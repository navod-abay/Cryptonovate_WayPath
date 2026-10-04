import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import {
  addOperatingDays,
  businessInstant,
  colomboToday,
  isOperatingDay,
  now,
  prevOperatingDay,
} from '../domain/calendar.js';
import { nextOrderRefs } from '../domain/orderRef.js';
import type { OrderStatus } from '../domain/statusMachine.js';
import type { OrderItemInput, TempRequirement } from '../schemas/orders.schema.js';
import { listOutlets, type OutletMaster } from '../repositories/outlets.repo.js';
import { intBetween, mulberry32, type Rng } from '../seed/prng.js';
import { syncOutlets } from '../services/referenceData.js';
import { pool, withTransaction } from './pool.js';

/**
 * Data seeding only — structure comes from 02-order-management.sql. Every insert touches
 * tables this service owns and is idempotent (service_jobs guard + ON CONFLICT DO NOTHING).
 *
 * The demo orders are real orders from the challenge dataset, kept in seed-data/orders.csv (the
 * window algorithm 3 was back-tested on; regenerate with scripts/build-seed-csv.mjs). Each row has a
 * day `offset` instead of a date: offset 0 is the seeding day (or the last operating day if that
 * day is closed), negative offsets are past operating days, positive ones future operating days.
 * Every order is seeded as `confirmed`; Planning & Allocation plans the past days and today when it
 * starts. seed-data/outlet_state.csv holds each outlet's fairness counters at the first seeded day.
 */

const DATASET_SEED_JOB = 'seed_demo';
const DATASET_SEED_KEY = 'dataset-v1';
const LEGACY_SEED_KEY = 'v1'; // the earlier synthetic demo seed

const SEED_DIR = path.resolve(__dirname, '../../seed-data');

interface FixtureOrder {
  id: string;
  outlet_id: string;
  temp: TempRequirement;
  units: number;
  weight_kg: number;
  volume_m3: number;
}

interface Fixture {
  source: { file: string; dates: [string, string] };
  outlet_state: Record<string, { days_since_last_served: number; deferred_yesterday: boolean }>;
  days: { offset: number; source_date: string; orders: FixtureOrder[] }[];
}

// ------------------------------------------------------------------ order lines

interface CatalogueItem {
  sku: string;
  description: string;
}

// The dataset has order totals but no lines; these names make the manifests readable.
const CATALOGUE: Record<'freshAmbient' | 'freshChilled' | 'style' | 'tech', readonly CatalogueItem[]> = {
  freshAmbient: [
    { sku: 'RICE-5KG', description: 'Samba rice 5kg bag' },
    { sku: 'FLOUR-1KG', description: 'Wheat flour 1kg' },
    { sku: 'BISC-CTN', description: 'Biscuit carton (24 packs)' },
    { sku: 'WATER-1.5LX6', description: 'Bottled water 1.5L x6' },
    { sku: 'TEA-400G', description: 'Ceylon tea 400g' },
    { sku: 'SOAP-CTN', description: 'Soap carton (48 bars)' },
    { sku: 'BREAD-TRAY', description: 'Bread tray (12 loaves)' },
  ],
  freshChilled: [
    { sku: 'MLK-1L', description: 'Fresh milk 1L' },
    { sku: 'YOG-CUP12', description: 'Yoghurt cups (12)' },
    { sku: 'CHK-WHOLE', description: 'Whole chicken 1.2kg' },
    { sku: 'FISH-TRAY5', description: 'Fresh fish tray 5kg' },
    { sku: 'BUTTER-CTN', description: 'Butter carton (20 x 200g)' },
    { sku: 'VEG-CRATE', description: 'Chilled vegetable crate' },
  ],
  style: [
    { sku: 'APP-CTN-S', description: 'Apparel carton (small)' },
    { sku: 'APP-CTN-L', description: 'Apparel carton (large)' },
    { sku: 'SHOE-CTN', description: 'Footwear carton (12 pairs)' },
    { sku: 'ACC-BOX', description: 'Accessories box' },
    { sku: 'GOH-RAIL', description: 'Garment-on-hanger rail' },
  ],
  tech: [
    { sku: 'TV-55', description: '55" LED TV' },
    { sku: 'FRIDGE-DD', description: 'Double-door refrigerator' },
    { sku: 'WASH-FL', description: 'Front-load washing machine' },
    { sku: 'AC-SPLIT', description: 'Split AC unit (indoor + outdoor)' },
    { sku: 'LAPTOP-CTN5', description: 'Laptop carton (5 units)' },
  ],
};

function catalogueFor(outlet: OutletMaster, temp: TempRequirement): readonly CatalogueItem[] {
  if (outlet.brand === 'Fresh') return temp === 'chilled' ? CATALOGUE.freshChilled : CATALOGUE.freshAmbient;
  return outlet.brand === 'Style' ? CATALOGUE.style : CATALOGUE.tech;
}

/**
 * Splits the dataset order into lines whose totals equal the dataset's units, weight and volume
 * exactly. All lines carry the order's average unit weight/volume (rounded down to the column
 * precision) except a final single-unit line that takes the remainder, so
 * SUM(quantity × unit_weight_kg) is the dataset weight to the gram.
 */
function linesFor(rng: Rng, outlet: OutletMaster, o: FixtureOrder): OrderItemInput[] {
  const chilled = o.temp === 'chilled';
  const weightG = Math.round(o.weight_kg * 1000); // unit_weight_kg is NUMERIC(8,3)
  const volume = Math.round(o.volume_m3 * 10000); // unit_volume_m3 is NUMERIC(8,4)
  const catalogue = [...catalogueFor(outlet, o.temp)]
    .map((item) => ({ item, key: rng() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
  const line = (c: CatalogueItem, quantity: number, g: number, v: number): OrderItemInput => ({
    sku: c.sku,
    description: c.description,
    quantity,
    unit_weight_kg: g / 1000,
    unit_volume_m3: v / 10000,
    is_chilled: chilled,
  });
  if (o.units === 1) return [line(catalogue[0], 1, weightG, volume)];

  // lines − 1 SKUs share units − 1 at the average; the last SKU is one unit carrying the remainder.
  const lines = Math.min(o.units, intBetween(rng, 2, outlet.brand === 'Tech' ? 2 : 4), catalogue.length);
  const shared = o.units - 1;
  const unitG = Math.floor(weightG / o.units);
  const unitV = Math.floor(volume / o.units);
  const out: OrderItemInput[] = [];
  let left = shared;
  for (let i = 0; i < lines - 1; i++) {
    const after = lines - 2 - i; // shared lines still to fill after this one
    const q = after === 0 ? left : intBetween(rng, 1, left - after);
    out.push(line(catalogue[i], q, unitG, unitV));
    left -= q;
  }
  out.push(line(catalogue[lines - 1], 1, weightG - unitG * shared, volume - unitV * shared));
  return out;
}

// ------------------------------------------------------------------ orders

interface SeedEvent {
  from: OrderStatus | null;
  to: OrderStatus;
  role: string;
  at: Date;
}

interface SeedOrder {
  sourceId: string;
  outlet: OutletMaster;
  orderDate: string;
  temp: TempRequirement;
  placedAt: Date;
  confirmedAt: Date;
  items: OrderItemInput[];
  events: SeedEvent[];
}

const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const earliest = (a: Date, b: Date) => (a < b ? a : b);

/** Fixture offset 0 is today, or the last operating day when today is closed. */
export function seedAnchorDay(today = colomboToday()): string {
  return isOperatingDay(today) ? today : prevOperatingDay(today);
}

function buildOrders(fixture: Fixture, outlets: Map<string, OutletMaster>, anchor: string, seededAt: Date) {
  const orders: SeedOrder[] = [];
  const skipped: string[] = [];
  for (const day of fixture.days) {
    const orderDate = addOperatingDays(anchor, day.offset);
    for (const o of day.orders) {
      const outlet = outlets.get(o.outlet_id);
      if (!outlet) {
        skipped.push(o.id);
        continue;
      }
      const rng = mulberry32(Number(o.id.replace(/\D/g, '')) || 1);
      // Placed the previous operating day before the 16:00 cutoff; never later than the seed itself.
      const placedAt = earliest(
        plusMinutes(businessInstant(prevOperatingDay(orderDate), '08:30'), intBetween(rng, 0, 360)),
        plusMinutes(seededAt, -intBetween(rng, 40, 600)),
      );
      const confirmedAt = plusMinutes(placedAt, intBetween(rng, 2, 30));
      orders.push({
        sourceId: o.id,
        outlet,
        orderDate,
        temp: o.temp,
        placedAt,
        confirmedAt,
        items: linesFor(rng, outlet, o),
        events: [
          { from: null, to: 'draft', role: 'store_manager', at: placedAt },
          { from: 'draft', to: 'confirmed', role: 'store_manager', at: confirmedAt },
        ],
      });
    }
  }
  return { orders, skipped };
}

// ------------------------------------------------------------------ persistence

async function insertOrders(client: PoolClient, orders: SeedOrder[]): Promise<string[]> {
  const refs = await nextOrderRefs(client, orders.map((o) => o.orderDate));
  const col = <T>(fn: (o: SeedOrder) => T) => orders.map(fn);

  await client.query(
    `INSERT INTO orders (
       order_ref, outlet_id, brand, depot, order_date, original_order_date, temp_requirement, status,
       window_open_time, window_close_time, placed_by_username, placed_at, confirmed_at, cutoff_applied_at,
       deferral_count, idempotency_key, created_at, updated_at)
     SELECT t.order_ref, t.outlet_id, t.brand, t.depot, t.order_date, t.order_date, t.temp, 'confirmed',
            t.w_open, t.w_close, t.placed_by_username, t.placed_at, t.confirmed_at, t.confirmed_at,
            0, t.idempotency_key, t.placed_at, t.confirmed_at
       FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::date[], $6::varchar[],
                   $7::time[], $8::time[], $9::varchar[], $10::timestamptz[], $11::timestamptz[], $12::varchar[])
         AS t(order_ref, outlet_id, brand, depot, order_date, temp, w_open, w_close,
              placed_by_username, placed_at, confirmed_at, idempotency_key)
     ON CONFLICT (order_ref) DO NOTHING`,
    [
      refs,
      col((o) => o.outlet.outlet_id),
      col((o) => o.outlet.brand),
      col((o) => o.outlet.depot),
      col((o) => o.orderDate),
      col((o) => o.temp),
      col((o) => o.outlet.window_open_time),
      col((o) => o.outlet.window_close_time),
      col((o) => `manager_${o.outlet.outlet_id.toLowerCase()}`),
      col((o) => o.placedAt),
      col((o) => o.confirmedAt),
      // Traceability back to the dataset row the order came from.
      col((o) => `dataset:${o.sourceId}`),
    ],
  );

  const items = orders.flatMap((o, i) => o.items.map((item) => ({ ref: refs[i], item })));
  await client.query(
    `INSERT INTO order_items (order_ref, sku, description, quantity, unit_weight_kg, unit_volume_m3, is_chilled)
     SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::int[], $5::numeric[], $6::numeric[], $7::boolean[])
     ON CONFLICT (order_ref, sku) DO NOTHING`,
    [
      items.map((x) => x.ref),
      items.map((x) => x.item.sku),
      items.map((x) => x.item.description),
      items.map((x) => x.item.quantity),
      items.map((x) => x.item.unit_weight_kg.toFixed(3)),
      items.map((x) => x.item.unit_volume_m3.toFixed(4)),
      items.map((x) => x.item.is_chilled),
    ],
  );

  // Totals derived from items with the same formula as the live path (§5.5).
  await client.query(
    `UPDATE orders o SET
       order_units = t.units, order_weight_kg = t.weight, order_volume_m3 = t.volume
     FROM (
       SELECT order_ref, SUM(quantity) AS units, SUM(quantity * unit_weight_kg) AS weight,
              SUM(quantity * unit_volume_m3) AS volume
         FROM order_items WHERE order_ref = ANY($1::varchar[]) GROUP BY order_ref
     ) t
     WHERE o.order_ref = t.order_ref`,
    [refs],
  );

  const events = orders.flatMap((o, i) => o.events.map((e) => ({ ref: refs[i], e })));
  await client.query(
    `INSERT INTO order_status_events (order_ref, from_status, to_status, reason_code, reason_note, actor_role, occurred_at)
     SELECT r, f, t, NULL, NULL, a, at FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::timestamptz[])
       AS x(r, f, t, a, at)`,
    [
      events.map((x) => x.ref),
      events.map((x) => x.e.from),
      events.map((x) => x.e.to),
      events.map((x) => x.e.role),
      events.map((x) => x.e.at),
    ],
  );
  return refs;
}

/** Fairness counters as of the first seeded day, from the dataset history before the block. */
async function setFairnessCounters(client: PoolClient, fixture: Fixture, firstDay: string): Promise<number> {
  const ids = Object.keys(fixture.outlet_state);
  const { rowCount } = await client.query(
    `UPDATE outlets_ref r
        SET days_since_last_served = t.days, deferred_yesterday = t.deferred,
            last_served_date = t.last_served, updated_at = now()
       FROM unnest($1::varchar[], $2::int[], $3::boolean[], $4::date[]) AS t(outlet_id, days, deferred, last_served)
      WHERE r.outlet_id = t.outlet_id`,
    [
      ids,
      ids.map((id) => fixture.outlet_state[id].days_since_last_served),
      ids.map((id) => fixture.outlet_state[id].deferred_yesterday),
      ids.map((id) => addOperatingDays(firstDay, -fixture.outlet_state[id].days_since_last_served)),
    ],
  );
  return rowCount ?? 0;
}

// ------------------------------------------------------------------ entry points

export type DemoSeedOutcome =
  | { status: 'seeded'; orders: number; from: string; to: string; anchor: string }
  | { status: 'already-seeded' }
  | { status: 'legacy-seed' }
  | { status: 'waiting'; reason: string };

/** Reads a seed CSV (no quoted fields) into rows keyed by header, checking the expected columns. */
function readCsv(file: string, columns: readonly string[]): Record<string, string>[] {
  const [head, ...lines] = readFileSync(path.join(SEED_DIR, file), 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.trim());
  const missing = columns.filter((c) => !cols.includes(c));
  if (missing.length > 0) throw new Error(`seed-data/${file} is missing column(s): ${missing.join(', ')}`);
  return lines.filter((l) => l.trim() !== '').map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}

function loadFixture(): Fixture {
  const rows = readCsv('orders.csv', ['offset', 'source_date', 'delivery_id', 'outlet_id', 'temp_requirement', 'order_units', 'order_weight_kg', 'order_volume_m3']);
  const days = new Map<number, Fixture['days'][number]>();
  for (const r of rows) {
    const offset = Number(r.offset);
    if (!days.has(offset)) days.set(offset, { offset, source_date: r.source_date, orders: [] });
    days.get(offset)!.orders.push({
      id: r.delivery_id,
      outlet_id: r.outlet_id,
      temp: r.temp_requirement as TempRequirement,
      units: Number(r.order_units),
      weight_kg: Number(r.order_weight_kg),
      volume_m3: Number(r.order_volume_m3),
    });
  }
  const outletState: Fixture['outlet_state'] = {};
  for (const r of readCsv('outlet_state.csv', ['outlet_id', 'days_since_last_served', 'deferred_yesterday'])) {
    outletState[r.outlet_id] = { days_since_last_served: Number(r.days_since_last_served), deferred_yesterday: r.deferred_yesterday === 'true' };
  }
  const ordered = [...days.values()].sort((a, b) => a.offset - b.offset);
  return {
    source: { file: 'seed-data/orders.csv', dates: [ordered[0].source_date, ordered[ordered.length - 1].source_date] },
    outlet_state: outletState,
    days: ordered,
  };
}

/**
 * Seeds the dataset orders once per database. They need the outlets (outlets_ref, copied from
 * Fleet's table at boot); if those are not there yet the seed stays pending and is retried.
 */
export async function seedDemoOrders(): Promise<DemoSeedOutcome> {
  const { rows: done } = await pool.query<{ job_key: string }>(
    'SELECT job_key FROM service_jobs WHERE job_name = $1 AND job_key IN ($2, $3)',
    [DATASET_SEED_JOB, DATASET_SEED_KEY, LEGACY_SEED_KEY],
  );
  if (done.some((r) => r.job_key === DATASET_SEED_KEY)) return { status: 'already-seeded' };
  if (done.length > 0) return { status: 'legacy-seed' };

  const fixture = loadFixture();
  return withTransaction(async (client): Promise<DemoSeedOutcome> => {
    const outlets = new Map((await listOutlets(client)).map((o) => [o.outlet_id, o]));
    const needed = new Set(fixture.days.flatMap((d) => d.orders.map((o) => o.outlet_id)));
    const missing = [...needed].filter((id) => !outlets.has(id));
    if (outlets.size === 0 || missing.length > needed.size / 2) {
      return { status: 'waiting', reason: `outlets_ref has ${outlets.size} outlet(s); ${missing.length} of the seed's ${needed.size} outlets are missing` };
    }

    const guard = await client.query(
      `INSERT INTO service_jobs (job_name, job_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING job_key`,
      [DATASET_SEED_JOB, DATASET_SEED_KEY],
    );
    if (guard.rowCount === 0) return { status: 'already-seeded' };

    const anchor = seedAnchorDay();
    const { orders, skipped } = buildOrders(fixture, outlets, anchor, now());
    await insertOrders(client, orders);
    const firstDay = addOperatingDays(anchor, fixture.days[0].offset);
    const lastDay = addOperatingDays(anchor, fixture.days[fixture.days.length - 1].offset);
    const outletsUpdated = await setFairnessCounters(client, fixture, firstDay);

    const result = {
      source: fixture.source,
      anchor,
      first_day: firstDay,
      last_day: lastDay,
      days: fixture.days.map((d) => ({ date: addOperatingDays(anchor, d.offset), source_date: d.source_date, orders: d.orders.length })),
      orders: orders.length,
      skipped_unknown_outlet: skipped,
      outlets_fairness_set: outletsUpdated,
    };
    await client.query('UPDATE service_jobs SET result = $3 WHERE job_name = $1 AND job_key = $2', [
      DATASET_SEED_JOB,
      DATASET_SEED_KEY,
      JSON.stringify(result),
    ]);
    return { status: 'seeded', orders: orders.length, from: firstDay, to: lastDay, anchor };
  });
}

/** Boot-time data preparation. Returns true when the demo seed is still pending. */
export async function seedData(opts: { demoOrders: boolean }): Promise<boolean> {
  const { changed, total, skipped } = await syncOutlets();
  console.log(`✅ outlets_ref synced from Fleet's outlets table: ${total - skipped} outlet(s), ${changed} inserted or corrected.`);
  if (skipped > 0) {
    console.warn(`⚠️ ${skipped} outlet row(s) in Fleet's table were not copied: brand, depot, dock, parking or delivery window is missing or invalid.`);
  }
  if (total === 0) {
    console.warn('⚠️ Fleet\'s outlets table is empty: no orders can be placed until it is loaded.');
  }

  if (!opts.demoOrders) {
    console.log('ℹ️ SEED_DEMO_DATA=false — skipping demo orders.');
    return false;
  }
  return reportDemoSeed(await seedDemoOrders());
}

export function reportDemoSeed(outcome: DemoSeedOutcome): boolean {
  if (outcome.status === 'seeded') {
    console.log(`✅ Dataset orders seeded: ${outcome.orders} confirmed orders for ${outcome.from} … ${outcome.to} (today = ${outcome.anchor}).`);
  }
  if (outcome.status === 'already-seeded') console.log('ℹ️ Dataset orders already seeded (service_jobs guard); skipping.');
  if (outcome.status === 'legacy-seed') {
    console.warn('⚠️ This database holds the earlier synthetic demo seed; the dataset seed is not added on top of it. ' +
      'Start from an empty volume (docker compose down -v) to use the dataset seed.');
  }
  if (outcome.status === 'waiting') console.warn(`⏳ Demo orders not seeded yet: ${outcome.reason}. Will retry.`);
  return outcome.status === 'waiting';
}

