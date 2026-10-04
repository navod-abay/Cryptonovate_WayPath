import { API_ROUTES } from './config';
import { authFetch, errorMessage } from './auth';
import { GoodsType, TripLog, TripNode, TripPayload } from '../types/trip';
import { pendingStopEvents, StopEvent } from '../services/StopEvents';

/** Planning's TripDetail as GET /api/execution/driver/active-route returns it. */
interface PlannedStop {
  stopId: string;
  sequence: number;
  orderRef: string;
  outletId: string;
  brand: string;
  temperature: string;
  eta: string;
  windowOpen: string;
  windowClose: string;
  items: { sku: string; description: string; qty: number }[];
  arrivedAt: string | null;
  departedAt: string | null;
}

interface PlannedTrip {
  tripId: string;
  tripNumber: number;
  planDate: string;
  depot: string;
  vehicleId: string;
  district: string;
  departureTime: string;
  returnTime: string;
  loadingStatus: string;
  driverStartedAt: string | null;
  depotArrivedAt: string | null;
  depotDepartedAt: string | null;
  stops: PlannedStop[];
}

export interface DriverDay {
  date: string;
  vehicleId: string;
  trips: TripPayload[];
}

/** Minutes the truck is at the dock before it leaves. */
const AT_DOCK_BEFORE_DEPARTURE_MIN = 30;

/** "06:23" -> "06:23 AM", as the screens show times. */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function minusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function goodsType(brand: string, temperature: string): GoodsType {
  if (temperature === 'chilled') return 'chilled';
  if (brand === 'Style') return 'style';
  if (brand === 'Tech') return 'tech';
  return 'dry';
}

/** An ISO time as the screens show it, e.g. "06:23 AM". */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The Arrival / Departure log and screen status of a stop, from its times. */
function progress(arrivedAt: string | null, departedAt: string | null, waiting: TripNode['status']) {
  const logs: TripLog[] = [];
  if (arrivedAt) logs.push({ action: 'Arrival', time: clockTime(arrivedAt) });
  if (departedAt) logs.push({ action: 'Departure', time: clockTime(departedAt) });
  const status: TripNode['status'] = departedAt ? 'completed' : arrivedAt ? waiting : 'pending';
  return { logs, status };
}

/** Events still queued on the phone (made without signal) count as done: the server will have them. */
function withPending(trip: PlannedTrip, pending: StopEvent[]): PlannedTrip {
  const mine = pending.filter((e) => e.tripId === trip.tripId);
  if (mine.length === 0) return trip;
  return {
    ...trip,
    stops: trip.stops.map((s) => {
      const at = (type: StopEvent['type']) => mine.find((e) => e.stopId === s.stopId && e.type === type)?.capturedAt ?? null;
      return { ...s, arrivedAt: s.arrivedAt ?? at('arrival'), departedAt: s.departedAt ?? at('departure') };
    }),
  };
}

function toPayload(trip: PlannedTrip): TripPayload {
  const chilled = trip.stops.some((s) => s.temperature === 'chilled');
  const warehouse: TripNode = {
    id: `${trip.tripId}-W`,
    type: 'warehouse',
    goodsType: chilled ? 'chilled' : goodsType(trip.stops[0]?.brand ?? '', 'ambient'),
    sequence: 0,
    title: `${trip.depot} Warehouse`,
    badgeText: `TRIP ${trip.tripNumber}`,
    location: trip.depot,
    scheduledStart: to12h(minusMinutes(trip.departureTime, AT_DOCK_BEFORE_DEPARTURE_MIN)),
    scheduledEnd: to12h(trip.departureTime),
    // Checked in, the truck can only leave once the loaders have released it.
    ...progress(trip.depotArrivedAt, trip.depotDepartedAt, trip.loadingStatus === 'completed' ? 'ready_to_depart' : 'arrived'),
    inventory: [],
  };
  const outlets: TripNode[] = trip.stops.map((s) => ({
    id: s.stopId,
    type: 'outlet',
    goodsType: goodsType(s.brand, s.temperature),
    sequence: s.sequence,
    title: s.outletId,
    badgeText: `${s.brand.toUpperCase()}${s.temperature === 'chilled' ? ' · CHILLED' : ''}`,
    location: trip.district,
    scheduledStart: to12h(s.windowOpen),
    scheduledEnd: to12h(s.windowClose),
    estimatedArrival: to12h(s.eta),
    // Once arrived, an outlet moves on to departure (as it does on the screen).
    ...progress(s.arrivedAt, s.departedAt, 'ready_to_depart'),
    // Expected to be delivered in full; the driver changes "actual" for a short delivery.
    inventory: s.items.map((i) => ({ id: i.sku, name: i.description, expected: i.qty, actual: i.qty })),
    stopId: s.stopId,
    orderRef: s.orderRef,
  }));
  return {
    tripId: trip.tripId,
    vehicleId: trip.vehicleId,
    planDate: trip.planDate,
    loadingStatus: trip.loadingStatus,
    activeTripId: `Trip ${trip.tripNumber}`,
    isStarted: !!trip.driverStartedAt,
    nodes: [warehouse, ...outlets],
  };
}

async function postTripAction(tripId: string, action: 'start' | 'depot-arrival' | 'depot-departure'): Promise<void> {
  const res = await authFetch(`${API_ROUTES.EXECUTION}/driver/trips/${encodeURIComponent(tripId)}/${action}`, { method: 'POST' });
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => null), res.status));
}

/** The driver pressed "Start Trip". */
export function startTrip(tripId: string): Promise<void> {
  return postTripAction(tripId, 'start');
}

/** The driver pressed "I've Arrived" at the depot: the loaders now see the truck as ready to load. */
export function arriveAtDepot(tripId: string): Promise<void> {
  return postTripAction(tripId, 'depot-arrival');
}

/** The driver leaves the depot; refused until the loaders have released the truck. */
export function departFromDepot(tripId: string): Promise<void> {
  return postTripAction(tripId, 'depot-departure');
}

/**
 * The store's 6-digit handover code, read out by the store manager: the order is delivered.
 * Needs signal (the code is checked on the server); a wrong or expired code throws with the reason.
 */
export async function completeHandover(orderRef: string, code: string): Promise<void> {
  const res = await authFetch(`${API_ROUTES.EXECUTION}/orders/${encodeURIComponent(orderRef)}/handover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => null), res.status));
}

/** Whether the loaders have released the truck yet (awaiting_driver | ready_to_load | loading | completed). */
export async function fetchLoadingStatus(tripId: string): Promise<string | undefined> {
  const day = await fetchTodayTrips();
  return day.trips.find((t) => t.tripId === tripId)?.loadingStatus;
}

/** Today's trips (Colombo date) of the vehicle the signed-in driver drives. */
export async function fetchTodayTrips(): Promise<DriverDay> {
  const res = await authFetch(`${API_ROUTES.EXECUTION}/driver/active-route`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  const day = body.data as { date: string; vehicleId: string; trips: PlannedTrip[] };
  const pending = await pendingStopEvents();
  return { date: day.date, vehicleId: day.vehicleId, trips: day.trips.map((t) => toPayload(withPending(t, pending))) };
}
