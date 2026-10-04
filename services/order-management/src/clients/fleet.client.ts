import { z } from 'zod';
import { env } from '../config/env.js';
import { DepotEnum, type Depot } from '../schemas/orders.schema.js';

/**
 * HTTP client for Fleet & Directory, the owner of vehicle data.
 *   GET /api/fleet/vehicles?depot=&status=   -> { success, data: Vehicle[] }
 * Every response is validated here, so a contract drift fails loudly at the boundary.
 * (Outlets are not fetched over HTTP: they are read from the shared database — see
 * repositories/outlets.repo.ts.)
 */

export class FleetUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FleetUnavailableError';
  }
}

const FleetVehicleSchema = z.object({
  vehicle_id: z.string().min(1).max(20),
  type: z.enum(['truck', 'van']),
  temp: z.enum(['reefer', 'ambient']),
  weight_cap_kg: z.number().nonnegative(),
  volume_cap_m3: z.number().nonnegative(),
  depot: DepotEnum,
  status: z.string().nullable().optional(),
});

export interface FleetVehicle {
  vehicle_id: string;
  type: 'truck' | 'van';
  temp: 'reefer' | 'ambient';
  weight_cap_kg: number;
  volume_cap_m3: number;
  depot: Depot;
  status: string;
}

const EnvelopeSchema = z.object({ success: z.literal(true), data: z.array(z.unknown()) });

export function mapFleetVehicle(raw: unknown): FleetVehicle | null {
  const parsed = FleetVehicleSchema.safeParse(raw);
  if (!parsed.success) return null;
  const v = parsed.data;
  return {
    vehicle_id: v.vehicle_id,
    type: v.type,
    temp: v.temp,
    weight_cap_kg: v.weight_cap_kg,
    volume_cap_m3: v.volume_cap_m3,
    depot: v.depot,
    status: v.status ?? 'available',
  };
}

async function request(path: string): Promise<unknown[]> {
  const url = `${env.FLEET_SERVICE_URL.replace(/\/$/, '')}/api/fleet${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(env.FLEET_TIMEOUT_MS) });
  } catch (err) {
    throw new FleetUnavailableError(`Fleet & Directory unreachable at ${url}`, err);
  }
  if (!res.ok) {
    throw new FleetUnavailableError(`Fleet & Directory returned HTTP ${res.status} for ${path}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new FleetUnavailableError(`Fleet & Directory returned a non-JSON body for ${path}`, err);
  }
  const parsed = EnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new FleetUnavailableError(`Fleet & Directory response for ${path} is not a { success, data[] } envelope`);
  }
  return parsed.data.data;
}

export async function fetchVehicles(filter: { depot?: Depot; status?: string } = {}): Promise<FleetVehicle[]> {
  const params = new URLSearchParams();
  if (filter.depot) params.set('depot', filter.depot);
  if (filter.status) params.set('status', filter.status);
  const query = params.toString();
  const rows = await request(`/vehicles${query ? `?${query}` : ''}`);

  const vehicles = rows.map(mapFleetVehicle);
  const rejected = vehicles.filter((v) => v === null).length;
  if (rejected > 0) {
    console.warn(`⚠️ Fleet & Directory: ${rejected} of ${rows.length} vehicle row(s) failed contract validation and were ignored.`);
  }
  return vehicles.filter((v): v is FleetVehicle => v !== null);
}
