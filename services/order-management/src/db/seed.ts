import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import {
  addDays,
  addOperatingDays,
  businessInstant,
  colomboToday,
  isOperatingDay,
  nextOperatingDay,
  now,
  operatingDaysBetween,
  prevOperatingDay,
  weekdayOf,
} from '../domain/calendar.js';
import { earliestDeliveryDate } from '../domain/cutoff.js';
import { nextOrderRefs } from '../domain/orderRef.js';
import type { DeferralReasonCode } from '../domain/reasonCodes.js';
import { computeRollups } from '../domain/rollups.js';
import type { OrderStatus } from '../domain/statusMachine.js';
import type { OrderItemInput, TempRequirement } from '../schemas/orders.schema.js';
import { FleetUnavailableError, type FleetVehicle } from '../clients/fleet.client.js';
import { listOutlets, type OutletMaster } from '../repositories/outlets.repo.js';
import { intBetween, mulberry32, pick, type Rng } from '../seed/prng.js';
import { loadVehicles, reeferCapacityOf, syncOutlets } from '../services/referenceData.js';
import { pool, withTransaction } from './pool.js';

/**
 * Data seeding only — structure comes from 02-order-management.sql. Every insert touches
 * tables this service owns and is idempotent (ON CONFLICT DO NOTHING / service_jobs guard).
 */

const DEMO_SEED_JOB = 'seed_demo';
const DEMO_SEED_KEY = 'v1';
const DEMO_SEED = 20260929;

const STALE_OUTLET = 'OUT045';
const AT_RISK_OUTLETS = ['OUT014', 'OUT027'] as const;
const DEMO_OUTLET = 'OUT001';
const CHILLED_WEEKDAYS = new Set([1, 3, 5]); // Mon / Wed / Fri
const PEAK_CHILLED_OVERLOAD = 1.4;

// ------------------------------------------------------------------ catalogue

interface CatalogueItem {
  sku: string;
  description: string;
  w: number;
  v: number;
  min: number;
  max: number;
}

const CATALOGUE: Record<'freshAmbient' | 'freshChilled' | 'style' | 'tech', readonly CatalogueItem[]> = {
  freshAmbient: [
    { sku: 'RICE-5KG', description: 'Samba rice 5kg bag', w: 5.05, v: 0.007, min: 20, max: 60 },
    { sku: 'FLOUR-1KG', description: 'Wheat flour 1kg', w: 1.02, v: 0.0014, min: 30, max: 90 },
    { sku: 'BISC-CTN', description: 'Biscuit carton (24 packs)', w: 4.8, v: 0.028, min: 10, max: 40 },
    { sku: 'WATER-1.5LX6', description: 'Bottled water 1.5L x6', w: 9.3, v: 0.012, min: 15, max: 50 },
    { sku: 'TEA-400G', description: 'Ceylon tea 400g', w: 0.42, v: 0.0009, min: 20, max: 80 },
    { sku: 'SOAP-CTN', description: 'Soap carton (48 bars)', w: 5.6, v: 0.011, min: 4, max: 15 },
    { sku: 'BREAD-TRAY', description: 'Bread tray (12 loaves)', w: 5.2, v: 0.045, min: 8, max: 30 },
  ],
  freshChilled: [
    { sku: 'MLK-1L', description: 'Fresh milk 1L', w: 1.03, v: 0.0011, min: 60, max: 180 },
    { sku: 'YOG-CUP12', description: 'Yoghurt cups (12)', w: 1.1, v: 0.0016, min: 20, max: 80 },
    { sku: 'CHK-WHOLE', description: 'Whole chicken 1.2kg', w: 1.25, v: 0.0025, min: 20, max: 70 },
    { sku: 'FISH-TRAY5', description: 'Fresh fish tray 5kg', w: 5.1, v: 0.009, min: 5, max: 20 },
    { sku: 'BUTTER-CTN', description: 'Butter carton (20 x 200g)', w: 4.1, v: 0.0055, min: 3, max: 12 },
    { sku: 'VEG-CRATE', description: 'Chilled vegetable crate', w: 12, v: 0.045, min: 8, max: 25 },
  ],
  style: [
    { sku: 'APP-CTN-S', description: 'Apparel carton (small)', w: 6.5, v: 0.06, min: 6, max: 20 },
    { sku: 'APP-CTN-L', description: 'Apparel carton (large)', w: 11, v: 0.12, min: 4, max: 15 },
    { sku: 'SHOE-CTN', description: 'Footwear carton (12 pairs)', w: 9, v: 0.08, min: 3, max: 10 },
    { sku: 'ACC-BOX', description: 'Accessories box', w: 3, v: 0.025, min: 4, max: 12 },
    { sku: 'GOH-RAIL', description: 'Garment-on-hanger rail', w: 18, v: 0.45, min: 1, max: 4 },
  ],
  tech: [
    { sku: 'TV-55', description: '55" LED TV', w: 18.5, v: 0.21, min: 1, max: 4 },
    { sku: 'FRIDGE-DD', description: 'Double-door refrigerator', w: 62, v: 0.72, min: 1, max: 2 },
    { sku: 'WASH-FL', description: 'Front-load washing machine', w: 70, v: 0.38, min: 1, max: 3 },
    { sku: 'AC-SPLIT', description: 'Split AC unit (indoor + outdoor)', w: 45, v: 0.3, min: 1, max: 3 },
    { sku: 'LAPTOP-CTN5', description: 'Laptop carton (5 units)', w: 12, v: 0.06, min: 1, max: 4 },
  ],
};

function catalogueFor(outlet: OutletMaster, temp: TempRequirement): readonly CatalogueItem[] {
  if (outlet.brand === 'Fresh') return temp === 'chilled' ? CATALOGUE.freshChilled : CATALOGUE.freshAmbient;
  return outlet.brand === 'Style' ? CATALOGUE.style : CATALOGUE.tech;
}

function pickItems(rng: Rng, outlet: OutletMaster, temp: TempRequirement): OrderItemInput[] {
  const catalogue = catalogueFor(outlet, temp);
  const lines = outlet.brand === 'Tech' ? intBetween(rng, 1, 2) : intBetween(rng, 3, Math.min(6, catalogue.length));
  const chosen = [...catalogue]
    .map((item) => ({ item, key: rng() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, lines)
    .map((x) => x.item);
  return chosen.map((c) => ({
    sku: c.sku,
    description: c.description,
    quantity: intBetween(rng, c.min, c.max),
    unit_weight_kg: c.w,
    unit_volume_m3: c.v,
    is_chilled: temp === 'chilled',
  }));
}

// ------------------------------------------------------------------ order builder

// The fleet the demo is generated against; set once per seed run from Fleet & Directory's API.
let seedVehicles: readonly FleetVehicle[] = [];

interface SeedEvent {
  from: OrderStatus | null;
  to: OrderStatus;
  reasonCode: string | null;
  reasonNote: string | null;
  role: string;
  at: Date;
}

interface SeedOrder {
  outlet: OutletMaster;
  refDate: string;
  orderDate: string;
  originalDate: string;
  temp: TempRequirement;
  status: OrderStatus;
  deferralCount: number;
  vehicleId: string | null;
  tripId: number | null;
  placedAt: Date;
  confirmedAt: Date | null;
  items: OrderItemInput[];
  events: SeedEvent[];
  receipt: { received: number; missing: number; rejected: number; note: string | null } | null;
}

const PROGRESSION: readonly OrderStatus[] = ['allocated', 'loaded', 'out_for_delivery', 'delivered'];

const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

function deferralNote(code: DeferralReasonCode): string | null {
  switch (code) {
    case 'NO_REEFER_AVAILABLE':
      return 'All refrigerated vehicles committed to earlier chilled drops';
    case 'DISPATCHER_OVERRIDE':
      return 'Held back at outlet request (stock-take)';
    case 'VEHICLE_UNAVAILABLE':
      return 'Assigned vehicle in workshop';
    default:
      return null;
  }
}

function reasonFor(rng: Rng, outlet: OutletMaster, temp: TempRequirement): DeferralReasonCode {
  if (temp === 'chilled' && rng() < 0.7) return 'NO_REEFER_AVAILABLE';
  if (outlet.parking_constraint === 'van_only' && rng() < 0.6) return 'NO_VAN_FOR_VAN_ONLY_OUTLET';
  if (outlet.mall_window && rng() < 0.5) return 'WINDOW_INFEASIBLE';
  return pick(rng, [
    'CAPACITY_WEIGHT',
    'CAPACITY_VOLUME',
    'TIME_BUDGET_EXCEEDED',
    'LOWER_PRIORITY',
    'FUEL_QUOTA_EXCEEDED',
    'VEHICLE_UNAVAILABLE',
    'DISPATCHER_OVERRIDE',
  ] as const);
}

function buildOrder(
  rng: Rng,
  outlet: OutletMaster,
  originalDate: string,
  temp: TempRequirement,
  finalStatus: OrderStatus,
  opts: { deferrals?: DeferralReasonCode[]; agedOut?: boolean; receipt?: 'full' | 'short' } = {},
): SeedOrder {
  const deferrals = opts.deferrals ?? [];
  const orderDate = addOperatingDays(originalDate, deferrals.length);
  const events: SeedEvent[] = [];
  const ev = (from: OrderStatus | null, to: OrderStatus, role: string, at: Date, reasonCode: string | null = null, reasonNote: string | null = null) =>
    events.push({ from, to, role, at, reasonCode, reasonNote });

  const placedAt = plusMinutes(businessInstant(prevOperatingDay(originalDate), '08:30'), intBetween(rng, 0, 360));
  ev(null, 'draft', 'store_manager', placedAt);
  const order: SeedOrder = {
    outlet,
    refDate: originalDate,
    orderDate,
    originalDate,
    temp,
    status: finalStatus,
    deferralCount: deferrals.length,
    vehicleId: null,
    tripId: null,
    placedAt,
    confirmedAt: null,
    items: pickItems(rng, outlet, temp),
    events,
    receipt: null,
  };
  if (finalStatus === 'draft') return order;

  order.confirmedAt = plusMinutes(placedAt, intBetween(rng, 2, 30));
  ev('draft', 'confirmed', 'store_manager', order.confirmedAt);

  deferrals.forEach((code, k) => {
    const runDay = addOperatingDays(originalDate, k);
    const at = plusMinutes(businessInstant(prevOperatingDay(runDay), '18:00'), intBetween(rng, 0, 45));
    ev('confirmed', 'deferred', 'dispatcher', at, code, deferralNote(code));
    const last = k === deferrals.length - 1;
    if (last && opts.agedOut) {
      ev('deferred', 'not_run', 'system', plusMinutes(at, 0.02), 'AGED_OUT', `Deferred ${deferrals.length} times (MAX_DEFERRALS=${env.MAX_DEFERRALS}); originally due ${originalDate}`);
    } else {
      ev('deferred', 'confirmed', 'system', plusMinutes(at, 0.02), null, `Returned to the confirmed pool for ${addOperatingDays(originalDate, k + 1)} (deferral ${k + 1} of ${env.MAX_DEFERRALS})`);
    }
  });

  const target = finalStatus === 'received' || finalStatus === 'disputed' ? 'delivered' : finalStatus;
  const stepsToRun = PROGRESSION.indexOf(target) + 1;
  if (stepsToRun > 0) {
    // Real fleet: a chilled order needs a reefer from the outlet's own depot.
    const wanted = temp === 'chilled' ? 'reefer' : 'ambient';
    const sameTemp = seedVehicles.filter((v) => v.temp === wanted);
    const atDepot = sameTemp.filter((v) => v.depot === outlet.depot);
    order.vehicleId = pick(rng, atDepot.length > 0 ? atDepot : sameTemp).vehicle_id;
    order.tripId = temp === 'chilled' || outlet.mall_window ? 1 : intBetween(rng, 1, 2);

    const openAt = businessInstant(orderDate, outlet.window_open_time);
    const times: Record<string, Date> = {
      allocated: plusMinutes(businessInstant(prevOperatingDay(orderDate), '19:00'), intBetween(rng, 0, 60)),
      loaded: plusMinutes(openAt, -intBetween(rng, 70, 110)),
      out_for_delivery: plusMinutes(openAt, -intBetween(rng, 30, 60)),
      delivered: plusMinutes(openAt, intBetween(rng, 5, 90)),
    };
    const roles: Record<string, string> = { allocated: 'dispatcher', loaded: 'loader', out_for_delivery: 'driver', delivered: 'driver' };
    let prev: OrderStatus = 'confirmed';
    for (const s of PROGRESSION.slice(0, stepsToRun)) {
      ev(prev, s, roles[s], times[s], null, s === 'allocated' ? `Allocated to ${order.vehicleId}, trip ${order.tripId}` : null);
      prev = s;
    }
  }

  if (finalStatus === 'received' || finalStatus === 'disputed') {
    const units = computeRollups(order.items).order_units;
    // A single-unit order cannot be partially short; treat it as a clean receipt.
    if (units < 2) finalStatus = 'received';
    order.status = finalStatus;
    const short = finalStatus === 'disputed' ? Math.min(units - 1, intBetween(rng, 1, 4)) : 0;
    const rejected = finalStatus === 'disputed' && rng() < 0.4 ? Math.min(units - 1 - short, 1) : 0;
    order.receipt = {
      received: units - short - rejected,
      missing: short,
      rejected,
      note: finalStatus === 'disputed' ? `${short} missing, ${rejected} rejected on delivery` : null,
    };
    const deliveredAt = events[events.length - 1].at;
    ev('delivered', finalStatus, 'store_manager', plusMinutes(deliveredAt, intBetween(rng, 5, 25)), null, order.receipt.note);
  }

  if (opts.agedOut) order.status = 'not_run';
  return order;
}

// ------------------------------------------------------------------ scenario generation

function weightedStatus(rng: Rng): OrderStatus {
  const r = rng();
  if (r < 0.1) return 'confirmed';
  if (r < 0.25) return 'allocated';
  if (r < 0.45) return 'loaded';
  if (r < 0.7) return 'out_for_delivery';
  return 'delivered';
}

function generateDemoOrders(outlets: OutletMaster[]): { orders: SeedOrder[]; d0: string; d1: string; deferredYesterday: Set<string> } {
  const rng = mulberry32(DEMO_SEED);
  const today = colomboToday();
  const d0 = isOperatingDay(today) ? today : prevOperatingDay(today);
  const d1 = nextOperatingDay(today);

  const history: string[] = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(d0, -i);
    if (isOperatingDay(d)) history.push(d);
  }
  const lastHistory = prevOperatingDay(d0);
  const staleFrom = addOperatingDays(d0, -6);

  const fresh = outlets.filter((o) => o.brand === 'Fresh');
  const style = outlets.filter((o) => o.brand === 'Style');
  const tech = outlets.filter((o) => o.brand === 'Tech');
  const byId = new Map(outlets.map((o) => [o.outlet_id, o]));
  const chilledProgram = new Map(fresh.map((o) => [o.outlet_id, o.outlet_id === DEMO_OUTLET || rng() < 0.7]));
  const styleWeekday = new Map(style.map((o, i) => [o.outlet_id, (i % 6) + 1]));

  const orders: SeedOrder[] = [];

  // 1. History: mostly received, ~8% deferred once, ~5% disputed.
  for (const d of history) {
    const canDefer = d < lastHistory;
    const historic = (o: OutletMaster, temp: TempRequirement) => {
      const deferrals = canDefer && rng() < 0.08 ? [reasonFor(rng, o, temp)] : [];
      orders.push(buildOrder(rng, o, d, temp, rng() < 0.05 ? 'disputed' : 'received', { deferrals }));
    };
    for (const o of fresh) {
      if (o.outlet_id === STALE_OUTLET && d >= staleFrom) continue;
      historic(o, 'ambient');
      if (chilledProgram.get(o.outlet_id) && CHILLED_WEEKDAYS.has(weekdayOf(d))) historic(o, 'chilled');
    }
    for (const o of style) if (styleWeekday.get(o.outlet_id) === weekdayOf(d)) historic(o, 'ambient');
    for (const o of tech) if (rng() < 0.12) historic(o, 'ambient');
  }

  // 2. At-risk seeds.
  const stale = byId.get(STALE_OUTLET)!;
  orders.push(
    buildOrder(rng, stale, addOperatingDays(d0, -5), 'ambient', 'deferred', {
      deferrals: ['CAPACITY_WEIGHT', 'LOWER_PRIORITY', 'TIME_BUDGET_EXCEEDED'],
      agedOut: true,
    }),
    buildOrder(rng, stale, lastHistory, 'ambient', 'confirmed', { deferrals: ['CAPACITY_VOLUME', 'LOWER_PRIORITY'] }),
  );
  const [riskA, riskB] = AT_RISK_OUTLETS.map((id) => byId.get(id)!);
  const twoRunsBack = addOperatingDays(d1, -2);
  orders.push(
    buildOrder(rng, riskA, twoRunsBack, 'ambient', 'confirmed', { deferrals: ['CAPACITY_VOLUME', 'LOWER_PRIORITY'] }),
    buildOrder(rng, riskB, twoRunsBack, 'chilled', 'confirmed', { deferrals: ['NO_REEFER_AVAILABLE', 'NO_REEFER_AVAILABLE'] }),
  );

  // 3. Today (D0): a live, mixed dispatcher board.
  for (const o of fresh) {
    if (o.outlet_id === STALE_OUTLET) continue;
    const isDemo = o.outlet_id === DEMO_OUTLET;
    orders.push(buildOrder(rng, o, d0, 'ambient', isDemo ? 'delivered' : weightedStatus(rng)));
    if (chilledProgram.get(o.outlet_id) && (isDemo || rng() < 0.5)) {
      orders.push(buildOrder(rng, o, d0, 'chilled', isDemo ? 'delivered' : weightedStatus(rng)));
    }
  }
  for (const o of style) if (styleWeekday.get(o.outlet_id) === weekdayOf(d0)) orders.push(buildOrder(rng, o, d0, 'ambient', weightedStatus(rng)));
  for (const o of tech) if (rng() < 0.12) orders.push(buildOrder(rng, o, d0, 'ambient', weightedStatus(rng)));

  // 4. Next run (D+1): peak day. Chilled demand deliberately exceeds reefer capacity.
  for (const o of fresh) orders.push(buildOrder(rng, o, d1, 'ambient', 'confirmed'));
  const peakChilled: SeedOrder[] = [];
  for (const o of fresh) {
    if (o.outlet_id === DEMO_OUTLET) continue; // OUT001's chilled order is the draft below
    if (o.depot === 'Peliyagoda' || chilledProgram.get(o.outlet_id)) {
      peakChilled.push(buildOrder(rng, o, d1, 'chilled', 'confirmed'));
    }
  }
  const capacity = reeferCapacityOf(seedVehicles, 'Peliyagoda').volume_m3 * env.CHILLED_TRIPS_PER_DAY;
  const peliyagodaChilled = peakChilled.filter((o) => o.outlet.depot === 'Peliyagoda');
  const baseVolume = peliyagodaChilled.reduce((s, o) => s + computeRollups(o.items).order_volume_m3, 0);
  if (baseVolume > 0 && capacity > 0) {
    const factor = (capacity * PEAK_CHILLED_OVERLOAD) / baseVolume;
    for (const o of peakChilled) {
      o.items = o.items.map((i) => ({ ...i, quantity: Math.max(1, Math.round(i.quantity * factor)) }));
    }
  }
  orders.push(...peakChilled);
  for (const o of style) orders.push(buildOrder(rng, o, d1, 'ambient', 'confirmed')); // pre-season push
  for (const o of tech) if (rng() < 0.4) orders.push(buildOrder(rng, o, d1, 'ambient', 'confirmed'));

  // 5. One draft on OUT001 for the store-manager walkthrough (date fixed at confirm).
  const draftDate = earliestDeliveryDate();
  const draft = buildOrder(rng, byId.get(DEMO_OUTLET)!, draftDate, 'chilled', 'draft');
  draft.placedAt = now();
  draft.events[0].at = draft.placedAt;
  orders.push(draft);

  const deferredYesterday = new Set<string>([STALE_OUTLET, ...AT_RISK_OUTLETS]);
  return { orders, d0, d1, deferredYesterday };
}

// ------------------------------------------------------------------ persistence

async function insertDemoOrders(client: PoolClient, orders: SeedOrder[]): Promise<string[]> {
  const refs = await nextOrderRefs(client, orders.map((o) => o.refDate));
  const col = <T>(fn: (o: SeedOrder, i: number) => T) => orders.map(fn);

  await client.query(
    `INSERT INTO orders (
       order_ref, outlet_id, brand, depot, order_date, original_order_date, temp_requirement, status,
       window_open_time, window_close_time, placed_by_username, placed_at, confirmed_at, cutoff_applied_at,
       deferral_count, vehicle_id, trip_id, created_at, updated_at)
     SELECT t.order_ref, t.outlet_id, t.brand, t.depot, t.order_date, t.original_order_date, t.temp, t.status,
            t.w_open, t.w_close, t.placed_by_username, t.placed_at, t.confirmed_at, t.confirmed_at,
            t.deferral_count, t.vehicle_id, t.trip_id, t.placed_at, t.updated_at
       FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::date[], $6::date[],
                   $7::varchar[], $8::varchar[], $9::time[], $10::time[], $11::varchar[], $12::timestamptz[],
                   $13::timestamptz[], $14::int[], $15::varchar[], $16::smallint[], $17::timestamptz[])
         AS t(order_ref, outlet_id, brand, depot, order_date, original_order_date, temp, status, w_open, w_close,
              placed_by_username, placed_at, confirmed_at, deferral_count, vehicle_id, trip_id, updated_at)
     ON CONFLICT (order_ref) DO NOTHING`,
    [
      refs,
      col((o) => o.outlet.outlet_id),
      col((o) => o.outlet.brand),
      col((o) => o.outlet.depot),
      col((o) => o.orderDate),
      col((o) => o.originalDate),
      col((o) => o.temp),
      col((o) => o.status),
      col((o) => o.outlet.window_open_time),
      col((o) => o.outlet.window_close_time),
      col((o) => `manager_${o.outlet.outlet_id.toLowerCase()}`),
      col((o) => o.placedAt),
      col((o) => o.confirmedAt),
      col((o) => o.deferralCount),
      col((o) => o.vehicleId),
      col((o) => o.tripId),
      col((o) => o.events[o.events.length - 1].at),
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
      items.map((x) => x.item.unit_weight_kg),
      items.map((x) => x.item.unit_volume_m3),
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
     SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::text[], $6::varchar[], $7::timestamptz[])`,
    [
      events.map((x) => x.ref),
      events.map((x) => x.e.from),
      events.map((x) => x.e.to),
      events.map((x) => x.e.reasonCode),
      events.map((x) => x.e.reasonNote),
      events.map((x) => x.e.role),
      events.map((x) => x.e.at),
    ],
  );

  const receipts = orders.flatMap((o, i) => (o.receipt ? [{ ref: refs[i], r: o.receipt, at: o.events[o.events.length - 1].at }] : []));
  await client.query(
    `INSERT INTO order_receipts (order_ref, received_units, missing_units, rejected_units, note, received_at)
     SELECT * FROM unnest($1::varchar[], $2::int[], $3::int[], $4::int[], $5::text[], $6::timestamptz[])
     ON CONFLICT (order_ref) DO NOTHING`,
    [
      receipts.map((x) => x.ref),
      receipts.map((x) => x.r.received),
      receipts.map((x) => x.r.missing),
      receipts.map((x) => x.r.rejected),
      receipts.map((x) => x.r.note),
      receipts.map((x) => x.at),
    ],
  );

  return refs;
}

async function updateFairnessCounters(
  client: PoolClient,
  outlets: OutletMaster[],
  orders: SeedOrder[],
  d0: string,
  deferredYesterday: Set<string>,
): Promise<void> {
  const lastServed = new Map<string, string>();
  for (const o of orders) {
    if (o.status !== 'received' && o.status !== 'disputed') continue;
    const prev = lastServed.get(o.outlet.outlet_id);
    if (!prev || o.orderDate > prev) lastServed.set(o.outlet.outlet_id, o.orderDate);
  }
  const horizon = addDays(d0, -15);
  const ids = outlets.map((o) => o.outlet_id);
  await client.query(
    `UPDATE outlets_ref r
        SET last_served_date = t.last_served, days_since_last_served = t.days,
            deferred_yesterday = t.deferred, updated_at = now()
       FROM unnest($1::varchar[], $2::date[], $3::int[], $4::boolean[]) AS t(outlet_id, last_served, days, deferred)
      WHERE r.outlet_id = t.outlet_id`,
    [
      ids,
      ids.map((id) => lastServed.get(id) ?? null),
      ids.map((id) => operatingDaysBetween(lastServed.get(id) ?? horizon, d0)),
      ids.map((id) => deferredYesterday.has(id)),
    ],
  );
}

// ------------------------------------------------------------------ entry points

export type DemoSeedOutcome =
  | { status: 'seeded'; orders: number }
  | { status: 'already-seeded' }
  | { status: 'waiting'; reason: string };

/**
 * Generates the demo orders once per database. They are built from the real outlets
 * (outlets_ref, copied from Fleet's table) and the real vehicles (Fleet's API). If either is
 * not available yet the seed is left pending — nothing is invented — and can be retried.
 */
export async function seedDemoOrders(vehicleAttempts = 1): Promise<DemoSeedOutcome> {
  const { rows: done } = await pool.query('SELECT 1 FROM service_jobs WHERE job_name = $1 AND job_key = $2', [
    DEMO_SEED_JOB,
    DEMO_SEED_KEY,
  ]);
  if (done.length > 0) return { status: 'already-seeded' };

  let vehicles: FleetVehicle[];
  try {
    vehicles = await loadVehicles(vehicleAttempts);
  } catch (err) {
    if (!(err instanceof FleetUnavailableError)) throw err;
    return { status: 'waiting', reason: err.message };
  }
  if (!vehicles.some((v) => v.temp === 'reefer') || !vehicles.some((v) => v.temp === 'ambient')) {
    return { status: 'waiting', reason: `Fleet & Directory returned ${vehicles.length} vehicle(s), without both reefer and ambient ones` };
  }

  return withTransaction(async (client): Promise<DemoSeedOutcome> => {
    const outlets: OutletMaster[] = await listOutlets(client);
    const missing = [DEMO_OUTLET, STALE_OUTLET, ...AT_RISK_OUTLETS].filter(
      (id) => !outlets.some((o) => o.outlet_id === id && o.brand === 'Fresh'),
    );
    if (missing.length > 0) {
      return { status: 'waiting', reason: `outlets the demo story needs are not Fresh outlets in the directory: ${missing.join(', ')}` };
    }

    const guard = await client.query(
      `INSERT INTO service_jobs (job_name, job_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING job_key`,
      [DEMO_SEED_JOB, DEMO_SEED_KEY],
    );
    if (guard.rowCount === 0) return { status: 'already-seeded' };

    seedVehicles = vehicles;
    const { orders, d0, d1, deferredYesterday } = generateDemoOrders(outlets);
    await insertDemoOrders(client, orders);
    await updateFairnessCounters(client, outlets, orders, d0, deferredYesterday);

    const result = {
      orders: orders.length,
      today: d0,
      peak_day: d1,
      events: orders.reduce((s, o) => s + o.events.length, 0),
      outlets: outlets.length,
      vehicles: vehicles.length,
    };
    await client.query('UPDATE service_jobs SET result = $3 WHERE job_name = $1 AND job_key = $2', [
      DEMO_SEED_JOB,
      DEMO_SEED_KEY,
      JSON.stringify(result),
    ]);
    return { status: 'seeded', orders: orders.length };
  });
}

/** Boot-time data preparation. Returns true when a demo seed is still pending. */
const PRODUCT_GROUPS = [
  { key: 'freshAmbient', brand: 'Fresh', temp: 'ambient' },
  { key: 'freshChilled', brand: 'Fresh', temp: 'chilled' },
  { key: 'style', brand: 'Style', temp: 'ambient' },
  { key: 'tech', brand: 'Tech', temp: 'ambient' },
] as const;

/** Writes the catalogue to the products table: insert new SKUs, refresh the rest. Runs on every boot. */
export async function seedProducts(): Promise<number> {
  let count = 0;
  for (const group of PRODUCT_GROUPS) {
    for (const item of CATALOGUE[group.key]) {
      await pool.query(
        `INSERT INTO products (sku, description, brand, temp_requirement, unit_weight_kg, unit_volume_m3)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sku) DO UPDATE
           SET description = EXCLUDED.description, brand = EXCLUDED.brand, temp_requirement = EXCLUDED.temp_requirement,
               unit_weight_kg = EXCLUDED.unit_weight_kg, unit_volume_m3 = EXCLUDED.unit_volume_m3`,
        [item.sku, item.description, group.brand, group.temp, item.w, item.v],
      );
      count += 1;
    }
  }
  return count;
}

export async function seedData(opts: { demoOrders: boolean }): Promise<boolean> {
  console.log(`✅ Product catalogue ready: ${await seedProducts()} product(s).`);
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
  return reportDemoSeed(await seedDemoOrders(env.FLEET_BOOT_ATTEMPTS));
}

export function reportDemoSeed(outcome: DemoSeedOutcome): boolean {
  if (outcome.status === 'seeded') console.log(`✅ Demo orders seeded: ${outcome.orders} orders.`);
  if (outcome.status === 'already-seeded') console.log('ℹ️ Demo orders already seeded (service_jobs guard); skipping.');
  if (outcome.status === 'waiting') console.warn(`⏳ Demo orders not seeded yet: ${outcome.reason}. Will retry.`);
  return outcome.status === 'waiting';
}
