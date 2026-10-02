import { pool, type Queryable } from '../db/pool.js';
import type { Depot } from '../schemas/orders.schema.js';
import { VEHICLE_FIXTURE } from '../seed/fleet.fixture.js';

export interface ReeferCapacity {
  vehicles: number;
  volume_m3: number;
  source: 'fleet.vehicles' | 'dataset-snapshot';
}

export function reeferCapacityFromFixture(depot?: Depot): ReeferCapacity {
  const reefers = VEHICLE_FIXTURE.filter((v) => v.temp === 'reefer' && (!depot || v.depot === depot));
  return {
    vehicles: reefers.length,
    volume_m3: Number(reefers.reduce((s, v) => s + v.volume_cap_m3, 0).toFixed(3)),
    source: 'dataset-snapshot',
  };
}

/**
 * Refrigerated capacity for the dashboard. Fleet & Directory owns `vehicles`; when that table
 * exists in the shared database it is read (read-only, never referenced by a foreign key) so
 * workshop status is respected. Otherwise the vehicles.csv snapshot is used, which keeps this
 * service runnable standalone.
 */
export async function getReeferCapacity(depot?: Depot, db: Queryable = pool): Promise<ReeferCapacity> {
  try {
    const { rows: exists } = await db.query<{ present: boolean }>(
      `SELECT to_regclass(current_schema() || '.vehicles') IS NOT NULL AS present`,
    );
    if (exists[0]?.present) {
      const { rows } = await db.query<{ vehicles: number; volume_m3: number | null }>(
        `SELECT COUNT(*)::int AS vehicles, SUM(volume_cap_m3) AS volume_m3
           FROM vehicles
          WHERE temp = 'reefer' AND COALESCE(status, 'available') = 'available'
            AND ($1::varchar IS NULL OR depot = $1)`,
        [depot ?? null],
      );
      if (rows[0] && rows[0].vehicles > 0) {
        return { vehicles: rows[0].vehicles, volume_m3: Number(rows[0].volume_m3 ?? 0), source: 'fleet.vehicles' };
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not read Fleet vehicles table; using the dataset snapshot for reefer capacity:', err);
  }
  return reeferCapacityFromFixture(depot);
}
