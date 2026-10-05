import { apiGet, apiPost } from './clientApi';
import { Vehicle } from '../components/VehicleCard';

export type { Vehicle };

/** One order line with what has been scanned and reported so far. */
export interface ManifestLine {
  sku: string;
  description: string;
  qty: number;
  scanned: number;
  missing: number;
  damaged: number;
  /** Units not yet scanned or reported. */
  remaining: number;
}

/** One order on the truck (an outlet can have an ambient and a chilled order). */
export interface ManifestStop {
  loadingSequence: number;
  unloadingSequence: number;
  stopId: string;
  orderRef: string;
  outletId: string;
  temperature: 'chilled' | 'ambient';
  items: ManifestLine[];
  /** Every unit scanned or reported. */
  complete: boolean;
  /** Complete with at least one unit scanned: the order is on the truck. */
  loaded: boolean;
}

export interface TripManifest {
  tripId: string;
  vehicleId: string;
  depot: string;
  departureTime: string;
  status: 'awaiting_driver' | 'ready_to_load' | 'loading' | 'completed';
  loaderName: string | null;
  loadingStrategy: string;
  totalStops: number;
  stops: ManifestStop[];
}

export interface OrderState {
  complete: boolean;
  loaded: boolean;
  /** Order Management has the order as loaded. */
  synced: boolean;
}

export interface ScanResult {
  status: 'scanned' | 'duplicate';
  orderRef: string;
  outletId: string;
  sku: string;
  description: string;
  unit: number;
  line: ManifestLine;
  order: OrderState;
}

export interface ShortfallRequest {
  orderRef: string;
  sku: string;
  missingQty: number;
  damageFlag: boolean;
  notes?: string;
}

export interface ActiveTrip {
  tripId: string;
  tripNumber: number;
  vehicleId: string;
  vehicleType: 'truck' | 'van';
  temperature: 'frozen' | 'ambient';
  departureTime: string;
  stops: number;
  status: 'awaiting_driver' | 'ready_to_load' | 'loading' | 'completed';
  dock: string;
}

/** Today's trips of the vehicles assigned to the signed-in loader (the server knows who that is). */
export async function getActiveTrips(depot: string, status?: ActiveTrip['status']): Promise<Vehicle[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await apiGet<ActiveTrip[]>(`/api/execution/docks/${encodeURIComponent(depot)}/active-trips${query}`);
  return data.map((trip) => ({
    id: trip.vehicleId,
    tripId: trip.tripId,
    tripNumber: trip.tripNumber,
    departureTime: trip.departureTime,
    stops: trip.stops,
    temperature: trip.temperature,
    vehicleType: trip.vehicleType,
  }));
}

export async function getManifest(tripId: string): Promise<TripManifest> {
  return apiGet<TripManifest>(`/api/execution/trips/${encodeURIComponent(tripId)}/manifest`);
}

/** Start Loading: the trip moves to the "Loading" queue. Safe to call again to resume. */
export async function startLoading(tripId: string): Promise<void> {
  await apiPost(`/api/execution/trips/${encodeURIComponent(tripId)}/start`, {});
}

/** One unit label read by the camera or a handheld scanner. */
export async function scanUnit(tripId: string, barcode: string): Promise<ScanResult> {
  return apiPost<ScanResult>(`/api/execution/trips/${encodeURIComponent(tripId)}/scans`, { barcode });
}

/** Units that will not be loaded; the dispatcher and the outlet's store manager are alerted. */
export async function reportShortfall(
  tripId: string,
  shortfall: ShortfallRequest
): Promise<{ line: ManifestLine; order: OrderState }> {
  return apiPost(`/api/execution/trips/${encodeURIComponent(tripId)}/shortfall`, shortfall);
}

export async function dispatchTrip(tripId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/api/execution/trips/${encodeURIComponent(tripId)}/dispatch`, {});
}

/** The text on a unit's label: <orderRef>|<sku>|<unit>, printed as a QR code. */
export function unitLabel(orderRef: string, sku: string, unit: number): string {
  return `${orderRef}|${sku}|${unit}`;
}
