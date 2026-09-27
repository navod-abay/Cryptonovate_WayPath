import type { Brand, Depot, DockType, ParkingConstraint } from '../schemas/orders.schema.js';

/** Small, fast, seedable PRNG. Never use Math.random() in seed data: judges must see identical data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
export const intBetween = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

export interface OutletFixture {
  outlet_id: string;
  brand: Brand;
  district: string;
  depot: Depot;
  dock_type: DockType;
  parking_constraint: ParkingConstraint;
  mall_window: boolean;
  window_open_time: string;
  window_close_time: string;
}

export const DEPOT_DISTRICTS: Readonly<Record<Depot, readonly string[]>> = {
  Peliyagoda: ['Colombo', 'Gampaha', 'Kalutara', 'Galle', 'Kurunegala'],
  Kandy: ['Kandy', 'Matale', 'Nuwara Eliya', 'Badulla'],
};

const OUTLET_SEED = 0x0e11_2026;
const PELIYAGODA_SHARE = 0.75;
const VAN_ONLY_SHARE = 0.15;
const STYLE_MALL_COUNT = 13; // "around half" of 25

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const outletId = (n: number) => `OUT${String(n).padStart(3, '0')}`;

function pickDepotAndDistrict(rng: Rng): { depot: Depot; district: string } {
  const depot: Depot = rng() < PELIYAGODA_SHARE ? 'Peliyagoda' : 'Kandy';
  return { depot, district: pick(rng, DEPOT_DISTRICTS[depot]) };
}

function streetOrDock(rng: Rng): { dock_type: DockType; parking_constraint: ParkingConstraint } {
  if (rng() < VAN_ONLY_SHARE) return { dock_type: 'street', parking_constraint: 'van_only' };
  return { dock_type: rng() < 0.7 ? 'rear_dock' : 'street', parking_constraint: 'normal' };
}

/**
 * Exactly 120 outlets: Fresh OUT001–080, Style OUT081–105, Tech OUT106–120.
 * OUT001 is pinned to Fresh / Peliyagoda / Colombo because auth-rbac's manager_out001 uses it.
 */
export function buildOutletFixture(): OutletFixture[] {
  const rng = mulberry32(OUTLET_SEED);
  const outlets: OutletFixture[] = [];

  for (let n = 1; n <= 80; n++) {
    const loc = n === 1 ? { depot: 'Peliyagoda' as const, district: 'Colombo' } : pickDepotAndDistrict(rng);
    const access = n === 1 ? { dock_type: 'rear_dock' as const, parking_constraint: 'normal' as const } : streetOrDock(rng);
    // Fresh must arrive before 08:00; windows differ per outlet.
    const open = 4 * 60 + 30 + 15 * intBetween(rng, 0, 4); // 04:30–05:30
    const close = 7 * 60 + 15 * intBetween(rng, 0, 3); // 07:00–07:45
    outlets.push({
      outlet_id: outletId(n),
      brand: 'Fresh',
      ...loc,
      ...access,
      mall_window: false,
      window_open_time: hhmm(open),
      window_close_time: hhmm(close),
    });
  }

  const styleIds = Array.from({ length: 25 }, (_, i) => 81 + i);
  const mallIds = new Set(
    [...styleIds]
      .map((id) => ({ id, key: rng() }))
      .sort((a, b) => a.key - b.key)
      .slice(0, STYLE_MALL_COUNT)
      .map((x) => x.id),
  );
  for (const n of styleIds) {
    const loc = pickDepotAndDistrict(rng);
    if (mallIds.has(n)) {
      outlets.push({
        outlet_id: outletId(n),
        brand: 'Style',
        ...loc,
        dock_type: 'mall_bay',
        parking_constraint: 'mall_dock',
        mall_window: true,
        window_open_time: '06:00',
        window_close_time: '09:00',
      });
    } else {
      outlets.push({
        outlet_id: outletId(n),
        brand: 'Style',
        ...loc,
        ...streetOrDock(rng),
        mall_window: false,
        window_open_time: '09:00',
        window_close_time: '17:00',
      });
    }
  }

  for (let n = 106; n <= 120; n++) {
    outlets.push({
      outlet_id: outletId(n),
      brand: 'Tech',
      ...pickDepotAndDistrict(rng),
      ...streetOrDock(rng),
      mall_window: false,
      window_open_time: '09:00',
      window_close_time: '16:00',
    });
  }

  return outlets;
}
