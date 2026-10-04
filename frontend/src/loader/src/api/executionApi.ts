import { apiGet, apiPost } from './clientApi';
import { Vehicle } from '../components/VehicleCard';
export type { Vehicle } from '../components/VehicleCard';

export interface LoadingItem {
  id: string;
  name: string;
  loaded: number;
  total: number;
  damaged: number;
}

export interface TripManifest {
  tripId: string;
  vehicleId: string;
  depot: string;
  loadingStrategy: string;
  totalStops: number;
  stops: Array<{
    loadingSequence: number;
    unloadingSequence: number;
    stopNumber: number;
    outletId: string;
    orderRef: string;
    items: Array<{
      sku: string;
      qty: number;
    }>;
  }>;
}

export interface ShortfallRequest {
  order_ref: string;
  sku: string;
  missing_qty: number;
  damage_flag: boolean;
  notes?: string;
}

export interface ActiveTrip {
  tripId: string;
  vehicleId: string;
  vehicleType: 'truck' | 'van';
  temperature: 'frozen' | 'ambient';
  arrivalTime: string;
  stops: number;
  status: string;
  dock: string;
}

export async function getActiveTrips(depot: string, status?: string): Promise<Vehicle[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await apiGet<ActiveTrip[]>(`/api/execution/docks/${encodeURIComponent(depot)}/active-trips${query}`);
  return data.map((trip) => ({
    id: trip.vehicleId,
    arrivalTime: trip.arrivalTime,
    stops: trip.stops,
    temperature: trip.temperature,
    vehicleType: trip.vehicleType,
  }));
}

export async function getManifest(tripId: string): Promise<TripManifest> {
  return apiGet<TripManifest>(`/api/execution/trips/${tripId}/manifest`);
}

export function transformManifestToItems(manifest: TripManifest): LoadingItem[] {
  const itemMap = new Map<string, LoadingItem>();

  for (const stop of manifest.stops) {
    for (const item of stop.items) {
      const existing = itemMap.get(item.sku);
      if (existing) {
        existing.total += item.qty;
      } else {
        itemMap.set(item.sku, {
          id: item.sku,
          name: item.sku,
          loaded: 0,
          total: item.qty,
          damaged: 0,
        });
      }
    }
  }

  return Array.from(itemMap.values());
}

export async function reportShortfall(
  tripId: string,
  shortfall: ShortfallRequest
): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/api/execution/trips/${tripId}/shortfall`, shortfall);
}

export async function dispatchTrip(tripId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/api/execution/trips/${tripId}/dispatch`, {});
}
