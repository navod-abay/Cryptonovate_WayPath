/**
 * Store manager data API.
 *
 * Every function either asks the fake server in src/mock/server.ts (USE_MOCK, the default)
 * or calls the real gateway with `http`. The endpoint, request and response for each call
 * are documented in BACKEND_INTEGRATION.md. Pages never fetch on their own: they call these
 * functions and read the results from the store.
 */
import { USE_MOCK } from './config';
import { refreshProfile } from './authApi';
import * as backend from './backend';
import { ApiError, http } from './http';
import * as mock from '@/mock/server';
import { emptyData, getState, setState } from '@/state/store';
import { loadDrafts, saveDraft, type ReceiptDraft } from '@/state/receipts';
import type {
  ConfirmationCode, Delivery, DraftOrder, IssueReport, NewIssueInput, NewOrderInput, Order,
  OrderSuggestions, OrderType, Product, TruckCapacity, Update,
} from '@/types';

const outletId = () => encodeURIComponent(getState().outlet.id);
const categories = () => getState().outlet.categories;

// ============================================================ reads

// Real mode reads from the existing services through src/api/backend.ts (see BACKEND_INTEGRATION.md).

/** GET /orders/products */
const fetchProducts = (): Promise<Product[]> => (USE_MOCK ? mock.getProducts(categories()) : backend.fetchProducts(categories()));

/** GET /fleet/vehicles, largest vehicle per temperature */
const fetchCapacity = (): Promise<Partial<Record<OrderType, TruckCapacity>>> =>
  USE_MOCK ? mock.getTruckCapacity(categories()) : backend.fetchCapacity(categories());

/** GET /orders/?outlet_id= plus /orders/:ref for lines and events */
const fetchOrders = (): Promise<Order[]> => (USE_MOCK ? mock.getOrders() : backend.fetchOrders(getState().outlet.id));

/** Orders started but not confirmed; they pre-fill the cart */
const fetchDrafts = (): Promise<DraftOrder[]> => (USE_MOCK ? Promise.resolve([]) : backend.fetchDrafts(getState().outlet.id));

/** Derived from the outlet's previous orders */
const fetchSuggestions = (): Promise<OrderSuggestions> =>
  USE_MOCK ? mock.getOrderSuggestions() : backend.fetchSuggestions(getState().outlet.id);

/** Derived from orders that are on the way or delivered, plus planning stops; item reports still held on this device are added. */
const fetchDeliveries = async (): Promise<Delivery[]> => {
  if (USE_MOCK) return mock.getDeliveries();
  const deliveries = await backend.fetchDeliveries(getState().outlet.id);
  const drafts = loadDrafts(getState().outlet.id);
  return deliveries.map((d) => withDraft(d, drafts[d.id]));
};

function withDraft(d: Delivery, draft: ReceiptDraft | undefined): Delivery {
  if (!draft) return d;
  const known = new Set(d.reports.map((r) => r.id));
  return { ...d, reports: [...d.reports, ...draft.reports.filter((r) => !known.has(r.id))], receiptQueued: draft.queued };
}

/**
 * The notification service's alerts (GET /notifications/outlets/:outletId/updates) together with the
 * routine order steps derived from the order's events, newest first.
 */
const fetchUpdates = async (): Promise<Update[]> => {
  if (USE_MOCK) return mock.getUpdates();
  const [alerts, steps] = await Promise.all([
    http.get<Update[]>(`/notifications/outlets/${outletId()}/updates`).catch(() => [] as Update[]),
    backend.fetchLifecycleUpdates(getState().outlet.id),
  ]);
  return [...alerts, ...steps].sort((x, y) => y.at.localeCompare(x.at));
};

let loading: Promise<void> | null = null;

/** Everything the screens need after sign-in. Sets load.status to loading → ready | error. */
export function loadStoreData(): Promise<void> {
  loading ??= doLoadStoreData().finally(() => { loading = null; });
  return loading;
}

async function doLoadStoreData() {
  setState((s) => ({ ...s, load: { status: 'loading', error: null } }));
  try {
    // Profile and outlet first: the products and capacity below depend on the outlet's categories.
    await refreshProfile().catch(() => undefined);
    const [products, capacity, orders, drafts, deliveries, updates, suggestions] = await Promise.all([
      fetchProducts(), fetchCapacity(), fetchOrders(), fetchDrafts(), fetchDeliveries(), fetchUpdates(), fetchSuggestions(),
    ]);
    setState((s) => ({
      ...s,
      products, capacity, orders, drafts, deliveries, updates,
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
  await sendQueuedReceipts();
}

async function refreshOrders() {
  const [orders, drafts, suggestions] = await Promise.all([fetchOrders(), fetchDrafts(), fetchSuggestions()]);
  setState((s) => ({ ...s, orders, drafts, lastOrderQty: suggestions.lastOrderQty, missingFromLast: { ...s.missingFromLast, ...suggestions.missingFromLast } }));
}

const upsertDelivery = (d: Delivery) =>
  setState((s) => ({ ...s, deliveries: s.deliveries.some((x) => x.id === d.id) ? s.deliveries.map((x) => (x.id === d.id ? d : x)) : [...s.deliveries, d] }));

// ============================================================ orders

/** POST /orders (creates, or replaces the lines of the order for that day + category), then confirm */
export async function placeOrder(input: NewOrderInput): Promise<Order> {
  const body = { ...input, lines: input.lines.filter((l) => l.quantity + (l.carriedOver ?? 0) > 0) };
  const sameDay = <T extends { type: OrderType; deliveryDate: string }>(o: T) => o.type === body.type && o.deliveryDate === body.deliveryDate;
  const placed = getState().orders.find(sameDay);
  const draft = getState().drafts.find(sameDay);
  const known = placed ? { id: placed.id, draft: false } : draft ? { id: draft.id, draft: true } : undefined;
  const order = USE_MOCK ? await mock.placeOrder(body) : await backend.placeOrder(body, getState().outlet.id, getState().products, known);
  setState((s) => ({
    ...s,
    orders: [...s.orders.filter((o) => !(o.type === order.type && o.deliveryDate === order.deliveryDate)), order],
    drafts: s.drafts.filter((d) => !(d.type === order.type && d.deliveryDate === order.deliveryDate)),
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

const setDraft = (deliveryId: string, draft: ReceiptDraft | null) => {
  saveDraft(getState().outlet.id, deliveryId, draft);
  setState((s) => ({
    ...s,
    deliveries: s.deliveries.map((d) => (d.id === deliveryId ? { ...d, reports: draft?.reports ?? d.reports, receiptQueued: draft?.queued } : d)),
  }));
};
const draftFor = (deliveryId: string): ReceiptDraft => loadDrafts(getState().outlet.id)[deliveryId] ?? { reports: [], queued: false };

/**
 * "What's Wrong ?" while unloading. Real API: kept on this device and sent with the receipt
 * (POST /orders/:orderRef/receipt) once the order is delivered, so it can still be edited.
 */
export async function reportIssue(deliveryId: string, input: NewIssueInput): Promise<IssueReport> {
  if (USE_MOCK) {
    const report = await mock.createDispute(deliveryId, input);
    setState((s) => ({ ...s, deliveries: s.deliveries.map((d) => (d.id === deliveryId ? { ...d, reports: [...d.reports, report] } : d)) }));
    return report;
  }
  const delivery = getState().deliveries.find((d) => d.id === deliveryId);
  const report: IssueReport = {
    ...input,
    id: crypto.randomUUID(),
    deliveryId,
    itemName: delivery?.items.find((i) => i.productId === input.productId)?.name ?? input.productId,
    createdAt: new Date().toISOString(),
  };
  const draft = draftFor(deliveryId);
  setDraft(deliveryId, { ...draft, reports: [...draft.reports, report] });
  return report;
}

/** Removes a report made by mistake, before the receipt is sent. */
export async function removeReport(deliveryId: string, reportId: string) {
  if (USE_MOCK) {
    await mock.deleteDispute(deliveryId, reportId);
    setState((s) => ({ ...s, deliveries: s.deliveries.map((d) => (d.id === deliveryId ? { ...d, reports: d.reports.filter((r) => r.id !== reportId) } : d)) }));
    return;
  }
  const draft = draftFor(deliveryId);
  setDraft(deliveryId, { ...draft, reports: draft.reports.filter((r) => r.id !== reportId) });
}

/**
 * POST /orders/:orderRef/receipt   (order-management)
 * Totals for the whole order plus one line per problem: the manager's reports, and items the
 * loader removed (ordered − sent) as missing. Damaged counts as rejected.
 */
async function sendReceipt(delivery: Delivery) {
  const draft = draftFor(delivery.id);
  const lines = [
    ...delivery.items
      .filter((i) => i.sent < i.ordered)
      .map((i) => ({ sku: i.productId, kind: 'missing' as const, quantity: i.ordered - i.sent, reasons: ['Removed at loading'] })),
    ...draft.reports.map((r) => ({ sku: r.productId, kind: r.kind, quantity: r.quantity, reasons: r.reasons })),
  ];
  const units = (kind: 'missing' | 'damaged') => lines.filter((l) => l.kind === kind).reduce((n, l) => n + l.quantity, 0);
  const ordered = delivery.items.reduce((n, i) => n + i.ordered, 0);
  const missing = units('missing');
  const rejected = units('damaged');
  try {
    await http.post(`/orders/${encodeURIComponent(delivery.orderId)}/receipt`, {
      received_units: Math.max(0, ordered - missing - rejected),
      missing_units: missing,
      rejected_units: rejected,
      lines,
    });
  } catch (e) {
    // Sent before (e.g. the response was lost): nothing left to do.
    if (!(e instanceof ApiError && e.status === 409 && /already been recorded/i.test(e.message))) throw e;
  }
  setDraft(delivery.id, null);
}

/**
 * "Driver already left": the driver could not enter the code (no network at the outlet). The
 * receipt is sent automatically once their offline delivery proof syncs and the order is delivered.
 */
export async function queueReceipt(deliveryId: string) {
  if (USE_MOCK) return;
  setDraft(deliveryId, { ...draftFor(deliveryId), queued: true });
  await sendQueuedReceipts().catch(() => undefined);
}

/** Sends every queued receipt whose delivery is now delivered. Runs with each poll. */
async function sendQueuedReceipts() {
  if (USE_MOCK) return;
  const drafts = loadDrafts(getState().outlet.id);
  const ready = getState().deliveries.filter((d) => d.status === 'delivered' && drafts[d.id]?.queued);
  for (const d of ready) await sendReceiptOnce(d).catch(() => undefined);
}

/** POST /execution/deliveries/:deliveryId/problems   Report button while the vehicle is on the way. */
export async function reportDeliveryProblem(deliveryId: string, problems: string[]) {
  const orderRef = getState().deliveries.find((d) => d.id === deliveryId)?.orderId;
  return USE_MOCK
    ? mock.reportDeliveryProblem(deliveryId, problems)
    : http.post<{ id: string }>(`/execution/deliveries/${deliveryId}/problems`, { problems, orderRef });
}

/**
 * POST /execution/orders/:orderRef/confirm   (issues the handover code; real mode)
 * The store manager reads the code to the driver, who types it into the driver app.
 */
export async function requestConfirmationCode(deliveryId: string): Promise<ConfirmationCode> {
  const delivery = getState().deliveries.find((d) => d.id === deliveryId);
  return USE_MOCK ? mock.createHandoverCode(deliveryId) : backend.requestHandoverCode(delivery?.orderId ?? '');
}

const sending = new Map<string, Promise<void>>();

/** One receipt send per delivery at a time: the code modal and the poll can both reach it. */
function sendReceiptOnce(delivery: Delivery): Promise<void> {
  const running = sending.get(delivery.id);
  if (running) return running;
  const promise = sendReceipt(delivery).finally(() => sending.delete(delivery.id));
  sending.set(delivery.id, promise);
  return promise;
}

/** The driver already finished the handover, so no code is needed: send the receipt now. */
export async function confirmReceipt(deliveryId: string) {
  const delivery = getState().deliveries.find((d) => d.id === deliveryId);
  if (!delivery) throw new Error('Delivery not found.');
  await sendReceiptOnce(delivery);
  await Promise.all([refreshOrders(), refreshLiveData()]);
}

/**
 * Polled while the code is shown: true once the driver has entered it (the order is delivered).
 * Real mode reads the order's status, then sends the receipt. A network failure leaves the
 * receipt queued for the next poll; a refusal from the server is raised so the modal can say why.
 */
export async function checkHandover(deliveryId: string): Promise<boolean> {
  if (USE_MOCK) {
    const d = await mock.getDelivery(deliveryId);
    upsertDelivery(d);
    if (d.status !== 'delivered') return false;
    await Promise.all([refreshOrders(), refreshLiveData()]).catch(() => undefined);
    return true;
  }
  const delivery = getState().deliveries.find((x) => x.id === deliveryId);
  if (!delivery) throw new Error('Delivery not found.');
  const status = await backend.fetchOrderStatus(delivery.orderId);
  if (status === 'out_for_delivery') return false;
  if (status === 'delivered') {
    setDraft(deliveryId, { ...draftFor(deliveryId), queued: true });
    try {
      await sendReceiptOnce(delivery);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) throw e;
    }
  }
  await Promise.all([refreshOrders(), refreshLiveData()]).catch(() => undefined);
  return true;
}

// ============================================================ updates

/** Alerts are marked read on the notification service; derived order steps are remembered on this device. */
export async function markUpdatesRead(ids: string[]) {
  if (!ids.length) return;
  setState((s) => ({ ...s, updates: s.updates.map((u) => (ids.includes(u.id) ? { ...u, read: true } : u)) }));
  if (USE_MOCK) await mock.markUpdatesRead(ids);
  else {
    const derived = ids.filter((id) => /^ORD-\d{8}-\d+:/.test(id));
    const alerts = ids.filter((id) => !derived.includes(id));
    backend.rememberRead(derived);
    if (alerts.length) await http.post<void>('/notifications/read', { ids: alerts });
  }
}

/** Live updates pushed by notification-service; newest wins on id clashes. */
export function mergeUpdates(incoming: Update[]) {
  setState((s) => {
    const ids = new Set(incoming.map((u) => u.id));
    return { ...s, updates: [...incoming, ...s.updates.filter((u) => !ids.has(u.id))] };
  });
}
