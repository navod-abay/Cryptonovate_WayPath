import { fetchVehicles, FleetUnavailableError, type FleetVehicle } from '../clients/fleet.client.js';
import { env } from '../config/env.js';
import type { Queryable } from '../db/pool.js';
import { outletDirectory, syncOutletsFromDirectory, type OutletRef } from '../repositories/outlets.repo.js';
import type { Depot } from '../schemas/orders.schema.js';

/**
 * Reference data owned by Fleet & Directory, as seen by Order Management. There is no
 * embedded copy and no fallback: if a source is unavailable, that is reported, not papered over.
 *
 * Outlets:  read from Fleet's `outlets` table in the shared database and copied into
 *           outlets_ref (our table: it carries the fairness counters and the orders FK).
 *           Refreshed at boot, on a timer, and on demand for an outlet not copied yet.
 * Vehicles: Fleet & Directory's HTTP API (GET /api/fleet/vehicles).
 */

interface OutletSyncState {
  last_synced_at: string | null;
  outlets: number | null;
  skipped_invalid: number | null;
  last_error: string | null;
}

const outletState: OutletSyncState = { last_synced_at: null, outlets: null, skipped_invalid: null, last_error: null };

export function referenceDataStatus() {
  return { outlets: { source: 'database: outlets (Fleet & Directory)', ...outletState } };
}

/** Copies Fleet's outlets into outlets_ref. Throws if the source table cannot be read. */
export async function syncOutlets(db?: Queryable): Promise<{ changed: number; total: number; skipped: number }> {
  try {
    const result = await syncOutletsFromDirectory(undefined, db);
    Object.assign(outletState, {
      last_synced_at: new Date().toISOString(),
      outlets: result.total - result.skipped,
      skipped_invalid: result.skipped,
      last_error: null,
    });
    return result;
  } catch (err) {
    outletState.last_error = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/**
 * Outlet for order creation. A miss in outlets_ref is checked against Fleet's table before
 * the caller is told the outlet does not exist, so an outlet added there works immediately.
 */
export async function resolveOutlet(outletId: string): Promise<OutletRef | null> {
  const known = await outletDirectory.findById(outletId);
  if (known) return known;
  const { changed } = await syncOutletsFromDirectory(outletId);
  return changed > 0 ? outletDirectory.findById(outletId) : null;
}

// ------------------------------------------------------------------ vehicles (Fleet API)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every vehicle Fleet knows. Throws FleetUnavailableError once the attempts are used up. */
export async function loadVehicles(attempts = 1): Promise<FleetVehicle[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      return await fetchVehicles();
    } catch (err) {
      if (!(err instanceof FleetUnavailableError)) throw err;
      lastError = err;
      if (attempt < attempts) await sleep(env.FLEET_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

export function reeferCapacityOf(vehicles: readonly FleetVehicle[], depot?: Depot): { vehicles: number; volume_m3: number } {
  const reefers = vehicles.filter((v) => v.temp === 'reefer' && (!depot || v.depot === depot));
  return { vehicles: reefers.length, volume_m3: Number(reefers.reduce((s, v) => s + v.volume_cap_m3, 0).toFixed(3)) };
}

export type ReeferCapacity =
  | { available: true; vehicles: number; volume_m3: number }
  | { available: false; reason: string };

const CAPACITY_TTL_MS = 30_000;
const capacityCache = new Map<string, { at: number; value: ReeferCapacity }>();

/**
 * Refrigerated capacity for the dashboard: the available reefers reported by Fleet, so a
 * vehicle in the workshop is excluded. Cached briefly so a dashboard refresh does not call
 * Fleet every time. When Fleet cannot be reached the capacity is reported as unavailable.
 */
export async function getReeferCapacity(depot?: Depot): Promise<ReeferCapacity> {
  const key = depot ?? '*';
  const cached = capacityCache.get(key);
  if (cached && Date.now() - cached.at < CAPACITY_TTL_MS) return cached.value;
  try {
    const vehicles = await fetchVehicles({ depot, status: 'available' });
    const value: ReeferCapacity = { available: true, ...reeferCapacityOf(vehicles, depot) };
    capacityCache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    if (!(err instanceof FleetUnavailableError)) throw err;
    console.warn(`⚠️ ${err.message}; /summary cannot show reefer capacity.`);
    return { available: false, reason: 'Fleet & Directory is unreachable' };
  }
}

// ------------------------------------------------------------------ background refresh

let timer: NodeJS.Timeout | null = null;
let refreshing = false;

export function startReferenceDataRefresh(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (refreshing) return;
    refreshing = true;
    syncOutlets()
      .then(({ changed }) => {
        if (changed > 0) console.log(`🔄 outlets_ref refreshed from Fleet's outlets table: ${changed} outlet(s) inserted or corrected.`);
      })
      .catch((err) => console.error('❌ Outlet refresh failed:', err))
      .finally(() => {
        refreshing = false;
      });
  }, env.OUTLET_REFRESH_INTERVAL_MS);
  timer.unref();
}

export function stopReferenceDataRefresh(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
