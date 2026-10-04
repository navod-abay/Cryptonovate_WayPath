import { pool } from './pool';
import { colomboToday, planningJson, PlannedTrip } from '../services/sync.service';

/**
 * Demo data (SEED_DEMO_DATA, on by default): a few trucks whose drivers have already checked in at
 * the depot, so the demo loader's Ready to Load queue is not empty. Today's plan is made by Planning
 * at startup, so this waits for it, then marks the first DEMO_ARRIVALS of the demo loader's first
 * trips that no driver or loader has touched yet as started and arrived. Once per day: a day that
 * already has demo arrivals is left alone.
 */
const DEMO_LOADER = process.env.DEMO_ARRIVED_LOADER || 'Thilak Senanayake';
const DEMO_ARRIVALS = 3;
const RETRY_MS = 30_000;
const MAX_ATTEMPTS = 20;

async function seedDemoArrivals(): Promise<boolean> {
  const day = colomboToday();
  const trips: PlannedTrip[] = await planningJson(`/api/planning/trips?${new URLSearchParams({ date: day })}`);
  if (trips.length === 0) return false; // Planning has not planned today yet
  const ids = trips.map((t) => t.tripId);
  const seeded = await pool.query('SELECT 1 FROM driver_trip_progress WHERE trip_id = ANY($1) AND demo LIMIT 1', [ids]);
  if (seeded.rowCount) return true;
  const { rows } = await pool.query<{ trip_id: string }>(
    'SELECT trip_id FROM loading_manifests WHERE trip_id = ANY($1) UNION SELECT trip_id FROM driver_trip_progress WHERE trip_id = ANY($1)',
    [ids],
  );
  const touched = new Set(rows.map((r) => r.trip_id));
  const picks = trips
    .filter((t) => t.loaderName === DEMO_LOADER && t.tripNumber === 1 && !touched.has(t.tripId))
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime) || a.vehicleId.localeCompare(b.vehicleId))
    .slice(0, DEMO_ARRIVALS);
  for (const [n, t] of picks.entries()) {
    // Staggered: started 40-50 minutes ago, arrived 10-20 minutes ago.
    await pool.query(
      `INSERT INTO driver_trip_progress (trip_id, vehicle_id, started_at, depot_arrived_at, demo)
       VALUES ($1, $2, now() - make_interval(mins => $3), now() - make_interval(mins => $4), true)
       ON CONFLICT (trip_id) DO NOTHING`,
      [t.tripId, t.vehicleId, 50 - n * 5, 20 - n * 5],
    );
  }
  console.log(`[execution-sync] demo: ${picks.map((t) => t.vehicleId).join(', ') || 'no trucks'} checked in at the depot for ${DEMO_LOADER}`);
  return true;
}

export function startDemoArrivals() {
  if ((process.env.SEED_DEMO_DATA ?? 'true') !== 'true') return;
  let attempts = 0;
  const tick = async () => {
    try {
      if (await seedDemoArrivals()) return;
    } catch (err: any) {
      console.warn(`[execution-sync] demo arrivals: ${err.message}`);
    }
    if (++attempts < MAX_ATTEMPTS) setTimeout(tick, RETRY_MS);
  };
  void tick();
}
