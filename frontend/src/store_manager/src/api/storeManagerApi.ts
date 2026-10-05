/**
 * Store manager data API.
 *
 * Every function either asks the fake server in src/mock/server.ts (USE_MOCK, the default)
 * or calls the real gateway with `http`. The endpoint, request and response for each call
 * are documented in BACKEND_INTEGRATION.md. Pages never fetch on their own: they call these
 * functions and read the results from the store.
 */
import { USE_MOCK } from './config';
import * as backend from './backend';
import { ApiError, http } from './http';
import * as mock from '@/mock/server';
import { emptyData, getState, setState } from '@/state/store';
import type {
  ConfirmationCode, Delivery, IssueReport, NewIssueInput, NewOrderInput, Order,
  OrderSuggestions, OrderType, Product, TruckCapacity, Update,
} from '@/types';
import { describeReport } from '@/utils/text';

const outletId = () => encodeURIComponent(getState().outlet.id);
const categories = () => getState().outlet.categories;

// ============================================================ reads

// Real mode reads from the existing services through src/api/backend.ts (see BACKEND_INTEGRATION.md).

/** No product catalogue exists in the backend yet, so the product list is empty in real mode. */
const fetchProducts = (): Promise<Product[]> => (USE_MOCK ? mock.getProducts(categories()) : Promise.resolve([]));

/** GET /fleet/vehicles, largest vehicle per temperature */
const fetchCapacity = (): Promise<Partial<Record<OrderType, TruckCapacity>>> =>
  USE_MOCK ? mock.getTruckCapacity(categories()) : backend.fetchCapacity(categories());

/** GET /orders/?outlet_id= plus /orders/:ref for lines and events */
const fetchOrders = (): Promise<Order[]> => (USE_MOCK ? mock.getOrders() : backend.fetchOrders(getState().outlet.id));

/** Derived from the outlet's previous orders */
const fetchSuggestions = (): Promise<OrderSuggestions> =>
  USE_MOCK ? mock.getOrderSuggestions() : backend.fetchSuggestions(getState().outlet.id);

/** Derived from orders that are on the way or delivered, plus planning stops */
const fetchDeliveries = (): Promise<Delivery[]> => (USE_MOCK ? mock.getDeliveries() : backend.fetchDeliveries(getState().outlet.id));

/** Derived from order status events */
const fetchUpdates = (): Promise<Update[]> => (USE_MOCK ? mock.getUpdates() : backend.fetchUpdates(getState().outlet.id));

let loading: Promise<void> | null = null;

/** Everything the screens need after sign-in. Sets load.status to loading → ready | error. */
export function loadStoreData(): Promise<void> {
  loading ??= doLoadStoreData().finally(() => { loading = null; });
  return loading;
}

async function doLoadStoreData() {
  setState((s) => ({ ...s, load: { status: 'loading', error: null } }));
  try {
    const [products, capacity, orders, deliveries, updates, suggestions] = await Promise.all([
      fetchProducts(), fetchCapacity(), fetchOrders(), fetchDeliveries(), fetchUpdates(), fetchSuggestions(),
    ]);
    setState((s) => ({
      ...s,
      products, capacity, orders, deliveries, updates,
      lastOrderQty: suggestions.lastOrderQty,
      missingFromLast: { ...emptyData().missingFromLast, ...suggestions.missingFromLast },
      load: { status: 'ready', error: null },
    }));
  } catch (e) {
    setState((s) => ({ ...s, load: { status: 'error', error: (e as Error).message || 'Could not load your store data.' } }));
  }
}

/** Polled every POLL_INTERVAL_MS: deliveries move and updates arrive while the page is open. */
export async function refreshLiveData() {
  const [deliveries, updates] = await Promise.all([fetchDeliveries(), fetchUpdates()]);
  setState((s) => ({ ...s, deliveries, updates }));
}

async function refreshOrders() {
  const [orders, suggestions] = await Promise.all([fetchOrders(), fetchSuggestions()]);
  setState((s) => ({ ...s, orders, lastOrderQty: suggestions.lastOrderQty, missingFromLast: { ...s.missingFromLast, ...suggestions.missingFromLast } }));
}

const upsertDelivery = (d: Delivery) =>
  setState((s) => ({ ...s, deliveries: s.deliveries.some((x) => x.id === d.id) ? s.deliveries.map((x) => (x.id === d.id ? d : x)) : [...s.deliveries, d] }));

// ============================================================ orders

/** POST /orders/outlets/:outletId/orders  (creates, or replaces the order for that day + category) */
export async function placeOrder(input: NewOrderInput): Promise<Order> {
  const body = { ...input, lines: input.lines.filter((l) => l.quantity + (l.carriedOver ?? 0) > 0) };
  const order = USE_MOCK ? await mock.placeOrder(body) : await http.post<Order>(`/orders/outlets/${outletId()}/orders`, body);
  setState((s) => ({
    ...s,
    orders: [...s.orders.filter((o) => !(o.type === order.type && o.deliveryDate === order.deliveryDate)), order],
    missingFromLast: { ...s.missingFromLast, [order.type]: [] },
  }));
  return order;
}

/** POST /orders/outlets/:outletId/carry-over/dismiss   "No, don't add" on one missing item. */
export async function dismissMissingItem(type: OrderType, productId: string) {
  // Optimistic: hide the line now, put it back if the server refuses.
  const before = getState().missingFromLast[type];
  setState((s) => ({ ...s, missingFromLast: { ...s.missingFromLast, [type]: before.filter((l) => l.productId !== productId) } }));
  try {
    if (USE_MOCK) await mock.dismissCarryOver(type, productId);
    else await http.post<void>(`/orders/outlets/${outletId()}/carry-over/dismiss`, { type, productId });
  } catch (e) {
    setState((s) => ({ ...s, missingFromLast: { ...s.missingFromLast, [type]: before } }));
    throw e;
  }
}

// ============================================================ deliveries

/** POST /execution/orders/:orderRef/unloading (real mode) */
export async function startUnloading(deliveryId: string) {
  if (USE_MOCK) {
    const d = await mock.startUnloading(deliveryId);
    upsertDelivery(d);
    return d;
  }
  const current = getState().deliveries.find((x) => x.id === deliveryId);
  if (!current) throw new Error('Delivery not found.');
  await backend.startUnloading(current.orderId);
  const d: Delivery = { ...current, status: 'unloading' };
  upsertDelivery(d);
  return d;
}

/**
 * POST /execution/orders/:orderRef/dispute   (exists in execution-sync)
 * Sends the existing { discrepancyType, description } plus the structured fields the UI needs back.
 */
export async function reportIssue(deliveryId: string, input: NewIssueInput): Promise<IssueReport> {
  const delivery = getState().deliveries.find((d) => d.id === deliveryId);
  let report: IssueReport;
  if (USE_MOCK) report = await mock.createDispute(deliveryId, input);
  else {
    const itemName = delivery?.items.find((i) => i.productId === input.productId)?.name ?? input.productId;
    const description = describeReport({ ...input, id: '', deliveryId, itemName, createdAt: '' });
    report = await http.post<IssueReport>(`/execution/orders/${encodeURIComponent(delivery?.orderId ?? '')}/dispute`, {
      discrepancyType: input.kind, description, deliveryId, ...input,
    });
  }
  setState((s) => ({ ...s, deliveries: s.deliveries.map((d) => (d.id === deliveryId ? { ...d, reports: [...d.reports, report] } : d)) }));
  return report;
}

/** DELETE /execution/disputes/:reportId */
export async function removeReport(deliveryId: string, reportId: string) {
  if (USE_MOCK) await mock.deleteDispute(deliveryId, reportId);
  else await http.del<void>(`/execution/disputes/${reportId}`);
  setState((s) => ({ ...s, deliveries: s.deliveries.map((d) => (d.id === deliveryId ? { ...d, reports: d.reports.filter((r) => r.id !== reportId) } : d)) }));
}

/** POST /execution/deliveries/:deliveryId/problems   Report button while the vehicle is on the way. */
export async function reportDeliveryProblem(deliveryId: string, problems: string[]) {
  return USE_MOCK
    ? mock.reportDeliveryProblem(deliveryId, problems)
    : http.post<{ id: string }>(`/execution/deliveries/${deliveryId}/problems`, { problems });
}

/**
 * POST /execution/orders/:orderRef/confirm   (issues the handover code; real mode)
 * The store manager reads the code to the driver, who types it into the driver app.
 */
export async function requestConfirmationCode(deliveryId: string): Promise<ConfirmationCode> {
  const delivery = getState().deliveries.find((d) => d.id === deliveryId);
  return USE_MOCK ? mock.createHandoverCode(deliveryId) : backend.requestHandoverCode(delivery?.orderId ?? '');
}

const recording = new Map<string, Promise<void>>();

/** Sends the store's receipt: items reported missing or damaged, the rest received. One call per delivery at a time. */
function recordReceipt(deliveryId: string): Promise<void> {
  const running = recording.get(deliveryId);
  if (running) return running;
  const delivery = getState().deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return Promise.reject(new Error('Delivery not found.'));
  const total = delivery.items.reduce((n, i) => n + i.sent, 0);
  const missing = delivery.reports.filter((r) => r.kind === 'missing').reduce((n, r) => n + r.quantity, 0);
  const rejected = delivery.reports.filter((r) => r.kind === 'damaged').reduce((n, r) => n + r.quantity, 0);
  if (missing + rejected > total) return Promise.reject(new Error('More items are reported than were sent.'));
  const note = delivery.reports.map((r) => describeReport(r)).join('; ').slice(0, 1000);
  const promise = backend
    .recordReceipt(delivery.orderId, { received_units: total - missing - rejected, missing_units: missing, rejected_units: rejected, ...(note ? { note } : {}) })
    .catch((e) => {
      // Already recorded (for example by an earlier attempt) counts as done.
      if (!(e instanceof ApiError && e.code === 'RECEIPT_ALREADY_RECORDED')) throw e;
    })
    .finally(() => recording.delete(deliveryId));
  recording.set(deliveryId, promise);
  return promise;
}

/** The driver already finished the handover, so no code is needed: record the receipt now. */
export async function confirmReceipt(deliveryId: string) {
  await recordReceipt(deliveryId);
  await Promise.all([refreshOrders(), refreshLiveData()]);
}

/**
 * GET /execution/deliveries/:deliveryId   Polled while the code is shown.
 * Returns true once the driver has entered the code (status "delivered").
 */
export async function checkHandover(deliveryId: string): Promise<boolean> {
  if (!USE_MOCK) {
    const delivery = getState().deliveries.find((x) => x.id === deliveryId);
    const status = await backend.fetchOrderStatus(delivery?.orderId ?? '');
    if (status === 'out_for_delivery') return false;
    // The driver entered the code, so the order is delivered; record the store's receipt now.
    if (status === 'delivered') await recordReceipt(deliveryId);
    await Promise.all([refreshOrders(), refreshLiveData()]).catch(() => undefined);
    return true;
  }
  const d = await mock.getDelivery(deliveryId);
  upsertDelivery(d);
  if (d.status !== 'delivered') return false;
  await Promise.all([refreshOrders(), refreshLiveData()]).catch(() => undefined);
  return true;
}

// ============================================================ updates

/** Real mode keeps the read state in this browser (the backend has no endpoint for it). */
export async function markUpdatesRead(ids: string[]) {
  if (!ids.length) return;
  setState((s) => ({ ...s, updates: s.updates.map((u) => (ids.includes(u.id) ? { ...u, read: true } : u)) }));
  if (USE_MOCK) await mock.markUpdatesRead(ids);
  else backend.rememberRead(ids);
}
