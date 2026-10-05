/**
 * Reads from the existing backend services, mapped to the shapes the screens use.
 * Orders, deliveries, updates and "last order" quantities are all derived from the
 * order-management orders of this outlet (plus planning stops for ETA and vehicle).
 */
import { http } from './http';
import type {
  ConfirmationCode, Delivery, DeliveryStatus, Order, OrderStatus, OrderSuggestions, OrderType, Outlet, StoreType, TruckCapacity, Update,
} from '@/types';

// ------------------------------------------------------------ backend shapes

interface BackendItem { sku: string; description: string; quantity: number }
interface BackendEvent { to_status: string; reason_label?: string | null; reason_note?: string | null; occurred_at: string }
interface BackendOrder {
  order_ref: string;
  outlet_id: string;
  brand: 'Fresh' | 'Style' | 'Tech';
  order_date: string;
  temp_requirement: 'ambient' | 'chilled';
  status: string;
  window_open_time: string;
  window_close_time: string;
  vehicle_id: string | null;
  placed_at: string;
  updated_at: string;
  items?: BackendItem[];
  events?: BackendEvent[];
}
interface BackendStop { orderRef: string; outletId: string; sequence: number; eta: string; windowOpen: string; windowClose: string }
interface BackendTrip { vehicleId: string; stops: BackendStop[] }
interface BackendOutlet { outlet_id: string; brand: string; district: string }
interface BackendVehicle { temp: 'reefer' | 'ambient'; weight_cap_kg: number; volume_cap_m3: number }

// ------------------------------------------------------------ mapping tables

const STORE_TYPE: Record<string, StoreType> = { Fresh: 'grocery', Tech: 'tech', Style: 'style' };
const CATEGORIES: Record<StoreType, OrderType[]> = { grocery: ['chilled', 'dry'], tech: ['tech'], style: ['style'] };

/** Backend statuses the store manager sees; drafts, cancelled and not_run orders are hidden. */
const ORDER_STATUS: Record<string, OrderStatus> = {
  confirmed: 'confirmed',
  allocated: 'scheduled',
  deferred: 'deferred',
  loaded: 'loaded',
  out_for_delivery: 'on_the_way',
  delivered: 'delivered',
  received: 'delivered',
  disputed: 'delivered',
};

/**
 * Out for delivery stays "on the way" until the store manager starts unloading. Backend "delivered"
 * means the driver finished the drop-off; the store still has to confirm receipt, so it keeps
 * showing as unloading until the order is received or disputed.
 */
const DELIVERY_STATUS: Record<string, DeliveryStatus> = {
  out_for_delivery: 'on_the_way',
  delivered: 'unloading',
  received: 'delivered',
  disputed: 'delivered',
};

const UPDATE_SOURCE: Record<string, { source: Update['source']; message: (ref: string) => string }> = {
  allocated: { source: 'dispatcher', message: (r) => `Order ${r} has been scheduled for delivery.` },
  deferred: { source: 'dispatcher', message: (r) => `Order ${r} has been deferred.` },
  loaded: { source: 'loader', message: (r) => `Order ${r} has been loaded onto the vehicle.` },
  out_for_delivery: { source: 'driver', message: (r) => `Order ${r} is on the way.` },
  delivered: { source: 'driver', message: (r) => `Order ${r} has been delivered. Please confirm receipt.` },
};

const orderTypeOf = (o: BackendOrder): OrderType =>
  o.brand === 'Fresh' ? (o.temp_requirement === 'chilled' ? 'chilled' : 'dry') : o.brand === 'Tech' ? 'tech' : 'style';

const eventAt = (o: BackendOrder, status: string) => o.events?.find((e) => e.to_status === status)?.occurred_at;

// ------------------------------------------------------------ outlet and capacity

export async function fetchOutlet(outletId: string, fullName: string): Promise<Outlet> {
  const rows = await http.post<BackendOutlet[]>('/fleet/outlets/batch', { outlet_ids: [outletId] });
  const row = rows.find((r) => r.outlet_id === outletId);
  if (!row) throw new Error(`Outlet ${outletId} was not found.`);
  const storeType = STORE_TYPE[row.brand] ?? 'grocery';
  return {
    id: row.outlet_id,
    city: row.district,
    managerName: fullName.split(' ')[0] ?? fullName,
    storeName: `${row.brand} ${row.district}`,
    storeType,
    categories: CATEGORIES[storeType],
    address: '',
  };
}

/** Largest vehicle per temperature: reefers carry chilled orders, ambient vehicles the rest. */
export async function fetchCapacity(categories: OrderType[]): Promise<Partial<Record<OrderType, TruckCapacity>>> {
  const vehicles = await http.get<BackendVehicle[]>('/fleet/vehicles');
  const largest = (temp: BackendVehicle['temp']): TruckCapacity | undefined => {
    const fleet = vehicles.filter((v) => v.temp === temp);
    return fleet.length
      ? { maxWeightKg: Math.max(...fleet.map((v) => Number(v.weight_cap_kg))), maxVolumeM3: Math.max(...fleet.map((v) => Number(v.volume_cap_m3))) }
      : undefined;
  };
  const result: Partial<Record<OrderType, TruckCapacity>> = {};
  for (const type of categories) {
    const cap = largest(type === 'chilled' ? 'reefer' : 'ambient');
    if (cap) result[type] = cap;
  }
  return result;
}

// ------------------------------------------------------------ orders snapshot

const detailCache = new Map<string, { updatedAt: string; order: BackendOrder }>();
const IN_PROGRESS = new Set(['allocated', 'loaded', 'out_for_delivery']);

async function loadOrderDetail(summary: BackendOrder): Promise<BackendOrder> {
  const cached = detailCache.get(summary.order_ref);
  if (cached && cached.updatedAt === summary.updated_at) return cached.order;
  const order = await http.get<BackendOrder>(`/orders/${encodeURIComponent(summary.order_ref)}`);
  detailCache.set(summary.order_ref, { updatedAt: summary.updated_at, order });
  return order;
}

async function loadPlan(orders: BackendOrder[]): Promise<Map<string, { eta: string; vehicle: string; stop: BackendStop; trip: BackendTrip }>> {
  const dates = [...new Set(orders.filter((o) => IN_PROGRESS.has(o.status)).map((o) => o.order_date))];
  const plan = new Map<string, { eta: string; vehicle: string; stop: BackendStop; trip: BackendTrip }>();
  await Promise.all(dates.map(async (date) => {
    try {
      const trips = await http.get<BackendTrip[]>('/planning/trips', { date });
      for (const trip of trips) for (const stop of trip.stops) plan.set(stop.orderRef, { eta: stop.eta, vehicle: trip.vehicleId, stop, trip });
    } catch {
      /* planning unavailable: orders still show, without ETA */
    }
  }));
  return plan;
}

/** Orders whose unloading the store manager has started (execution-sync). Missing data just means none started. */
async function loadUnloading(outletId: string): Promise<Set<string>> {
  try {
    const rows = await http.get<{ order_ref: string }[]>(`/execution/outlets/${encodeURIComponent(outletId)}/unloadings`);
    return new Set(rows.map((r) => r.order_ref));
  } catch {
    return new Set();
  }
}

interface Snapshot { orders: BackendOrder[]; plan: Awaited<ReturnType<typeof loadPlan>>; unloading: Set<string> }
let snapshot: { at: number; outletId: string; promise: Promise<Snapshot> } | null = null;

/** All visible orders of the outlet with their lines and events. Shared for a few seconds so one page load makes one round of calls. */
function loadSnapshot(outletId: string): Promise<Snapshot> {
  if (snapshot && snapshot.outletId === outletId && Date.now() - snapshot.at < 3000) return snapshot.promise;
  const promise = (async () => {
    const list = await http.get<{ orders: BackendOrder[] }>('/orders/', { outlet_id: outletId, page_size: 50 });
    const visible = list.orders.filter((o) => o.status in ORDER_STATUS);
    const [orders, unloading] = await Promise.all([Promise.all(visible.map(loadOrderDetail)), loadUnloading(outletId)]);
    return { orders, plan: await loadPlan(orders), unloading };
  })();
  snapshot = { at: Date.now(), outletId, promise };
  promise.catch(() => { if (snapshot?.promise === promise) snapshot = null; });
  return promise;
}

// ------------------------------------------------------------ orders, deliveries, updates, suggestions

export async function fetchOrders(outletId: string): Promise<Order[]> {
  const { orders, plan } = await loadSnapshot(outletId);
  return orders.map((o): Order => ({
    id: o.order_ref,
    type: orderTypeOf(o),
    deliveryDate: o.order_date,
    status: ORDER_STATUS[o.status],
    lines: (o.items ?? []).map((i) => ({ productId: i.sku, name: i.description, quantity: i.quantity })),
    placedAt: o.placed_at,
    scheduledAt: eventAt(o, 'allocated'),
    loadedAt: eventAt(o, 'loaded'),
    dispatchedAt: eventAt(o, 'out_for_delivery'),
    receivedAt: eventAt(o, 'received'),
    eta: plan.get(o.order_ref)?.eta,
    vehicle: o.vehicle_id ?? plan.get(o.order_ref)?.vehicle,
    deferredReason: o.status === 'deferred' ? [...(o.events ?? [])].reverse().find((e) => e.to_status === 'deferred')?.reason_label ?? undefined : undefined,
  }));
}

export async function fetchDeliveries(outletId: string): Promise<Delivery[]> {
  const { orders, plan, unloading } = await loadSnapshot(outletId);
  return orders.filter((o) => o.status in DELIVERY_STATUS).map((o): Delivery => {
    const planned = plan.get(o.order_ref);
    const finished = o.status === 'received' || o.status === 'disputed';
    return {
      id: o.order_ref,
      orderId: o.order_ref,
      type: orderTypeOf(o),
      vehicle: o.vehicle_id ?? planned?.vehicle ?? '',
      date: o.order_date,
      eta: planned?.eta ?? o.window_open_time,
      window: [planned?.stop.windowOpen ?? o.window_open_time, planned?.stop.windowClose ?? o.window_close_time],
      status: o.status === 'out_for_delivery' && unloading.has(o.order_ref) ? 'unloading' : DELIVERY_STATUS[o.status],
      stops: (planned?.trip.stops ?? []).map((s) => ({
        label: s.outletId === outletId ? 'Your store' : s.outletId,
        done: s.sequence < planned!.stop.sequence,
      })),
      items: (o.items ?? []).map((i) => ({
        productId: i.sku, name: i.description, ordered: i.quantity, sent: i.quantity, received: finished ? i.quantity : 0,
      })),
      reports: [],
      arrivedAt: eventAt(o, 'delivered'),
      confirmedAt: eventAt(o, 'received'),
      driverDone: o.status === 'delivered',
    };
  });
}

const READ_KEY = 'waypath.sm.readUpdates';
const readIds = (): Set<string> => {
  try { return new Set<string>(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]')); } catch { return new Set(); }
};
export function rememberRead(ids: string[]) {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...new Set([...readIds(), ...ids])])); } catch { /* storage unavailable */ }
}

/** POST /execution/orders/:ref/unloading, the store manager says the vehicle is here and unloading has started. */
export async function startUnloading(orderRef: string): Promise<void> {
  await http.post(`/execution/orders/${encodeURIComponent(orderRef)}/unloading`);
  snapshot = null;
}

/** Order status changes (scheduled, loaded, on the way, delivered), newest first. */
export async function fetchUpdates(outletId: string): Promise<Update[]> {
  const { orders } = await loadSnapshot(outletId);
  const read = readIds();
  return orders
    .flatMap((o) => (o.events ?? []).filter((e) => e.to_status in UPDATE_SOURCE).map((e): Update => {
      const id = `${o.order_ref}:${e.to_status}`;
      const meta = UPDATE_SOURCE[e.to_status];
      return {
        id,
        source: meta.source,
        message: meta.message(o.order_ref),
        at: e.occurred_at,
        link: e.to_status === 'delivered' ? `/deliveries/${o.order_ref}/receive` : `/orders/${o.order_ref}`,
        read: read.has(id),
      };
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** "Last order" quantities from the outlet's most recent orders. The backend has no per-item shortfall data, so nothing is owed. */
export async function fetchSuggestions(outletId: string): Promise<OrderSuggestions> {
  const { orders } = await loadSnapshot(outletId);
  const lastOrderQty: Record<string, number> = {};
  [...orders].sort((a, b) => a.placed_at.localeCompare(b.placed_at)).forEach((o) => {
    (o.items ?? []).forEach((i) => { lastOrderQty[i.sku] = i.quantity; });
  });
  return { lastOrderQty, missingFromLast: {} };
}

// ------------------------------------------------------------ handover and receipt

/** POST /execution/orders/:ref/confirm, the 6-digit code the store reads out to the driver. */
export const requestHandoverCode = (orderRef: string) =>
  http.post<ConfirmationCode>(`/execution/orders/${encodeURIComponent(orderRef)}/confirm`);

/** Order Management's status for one order (fresh, not cached). */
export async function fetchOrderStatus(orderRef: string): Promise<string> {
  const order = await http.get<{ status: string }>(`/orders/${encodeURIComponent(orderRef)}`);
  return order.status;
}

export interface ReceiptTotals { received_units: number; missing_units: number; rejected_units: number; note?: string }

/** POST /orders/:ref/receipt. Needs the order to be delivered; all received means received, anything short means disputed. */
export async function recordReceipt(orderRef: string, totals: ReceiptTotals): Promise<void> {
  await http.post(`/orders/${encodeURIComponent(orderRef)}/receipt`, totals);
  snapshot = null;
}
