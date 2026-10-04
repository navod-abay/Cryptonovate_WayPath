import { API_ROUTES } from './config';
import { authFetch, errorMessage } from './auth';
import { GoodsType, TripNode, TripPayload } from '../types/trip';

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
    status: 'pending',
    logs: [],
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
    status: 'pending',
    logs: [],
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
    isStarted: false,
    nodes: [warehouse, ...outlets],
  };
}

/** Today's trips (Colombo date) of the vehicle the signed-in driver drives. */
export async function fetchTodayTrips(): Promise<DriverDay> {
  const res = await authFetch(`${API_ROUTES.EXECUTION}/driver/active-route`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  const day = body.data as { date: string; vehicleId: string; trips: PlannedTrip[] };
  return { date: day.date, vehicleId: day.vehicleId, trips: day.trips.map(toPayload) };
}
