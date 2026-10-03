/**
 * Store manager data API.
 *
 * Every function either asks the fake server in src/mock/server.ts (USE_MOCK, the default)
 * or calls the real gateway with `http`. The endpoint, request and response for each call
 * are documented in BACKEND_INTEGRATION.md. Pages never fetch on their own: they call these
 * functions and read the results from the store.
 */
import { USE_MOCK } from './config';
import { http } from './http';
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

/** GET /orders/products?categories=chilled,dry */
const fetchProducts = () =>
  USE_MOCK ? mock.getProducts(categories()) : http.get<Product[]>('/orders/products', { categories: categories().join(',') });

/** GET /fleet/capacity?categories=chilled,dry */
const fetchCapacity = () =>
  USE_MOCK
    ? mock.getTruckCapacity(categories())
    : http.get<Partial<Record<OrderType, TruckCapacity>>>('/fleet/capacity', { categories: categories().join(',') });

/** GET /orders/outlets/:outletId/orders */
const fetchOrders = () => (USE_MOCK ? mock.getOrders() : http.get<Order[]>(`/orders/outlets/${outletId()}/orders`));

/** GET /orders/outlets/:outletId/order-suggestions */
const fetchSuggestions = () =>
  USE_MOCK ? mock.getOrderSuggestions() : http.get<OrderSuggestions>(`/orders/outlets/${outletId()}/order-suggestions`);

/** GET /execution/outlets/:outletId/deliveries */
const fetchDeliveries = () => (USE_MOCK ? mock.getDeliveries() : http.get<Delivery[]>(`/execution/outlets/${outletId()}/deliveries`));

/** GET /execution/outlets/:outletId/updates */
const fetchUpdates = () => (USE_MOCK ? mock.getUpdates() : http.get<Update[]>(`/execution/outlets/${outletId()}/updates`));

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

/** POST /execution/deliveries/:deliveryId/unloading */
export async function startUnloading(deliveryId: string) {
  const d = USE_MOCK ? await mock.startUnloading(deliveryId) : await http.post<Delivery>(`/execution/deliveries/${deliveryId}/unloading`);
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
 * POST /execution/orders/:orderRef/confirm   (exists in execution-sync; should return the handover code)
 * The store manager reads the code to the driver, who types it into the driver app.
 */
export async function requestConfirmationCode(deliveryId: string): Promise<ConfirmationCode> {
  const delivery = getState().deliveries.find((d) => d.id === deliveryId);
  return USE_MOCK
    ? mock.createHandoverCode(deliveryId)
    : http.post<ConfirmationCode>(`/execution/orders/${encodeURIComponent(delivery?.orderId ?? '')}/confirm`, { deliveryId });
}

/**
 * GET /execution/deliveries/:deliveryId   Polled while the code is shown.
 * Returns true once the driver has entered the code (status "delivered").
 */
export async function checkHandover(deliveryId: string): Promise<boolean> {
  const d = USE_MOCK ? await mock.getDelivery(deliveryId) : await http.get<Delivery>(`/execution/deliveries/${deliveryId}`);
  upsertDelivery(d);
  if (d.status !== 'delivered') return false;
  await Promise.all([refreshOrders(), refreshLiveData()]).catch(() => undefined);
  return true;
}

// ============================================================ updates

/** POST /execution/updates/read   { ids } */
export async function markUpdatesRead(ids: string[]) {
  if (!ids.length) return;
  setState((s) => ({ ...s, updates: s.updates.map((u) => (ids.includes(u.id) ? { ...u, read: true } : u)) }));
  if (USE_MOCK) await mock.markUpdatesRead(ids);
  else await http.post<void>('/execution/updates/read', { ids });
}
