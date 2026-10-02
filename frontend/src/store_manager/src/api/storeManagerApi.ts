/**
 * Store manager API layer.
 *
 * Everything here runs against in-memory mock data for now. Each function maps to the
 * backend endpoint it will call later (see comments), so connecting the real services
 * should only touch this file.
 */
import type { ConfirmationCode, IssueKind, IssueReport, Order, OrderLine, OrderType } from '@/types';
import { getState, setState } from '@/state/store';
import { now } from '@/mock/clock';
import { formatClock } from '@/utils/date';

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** POST /api/order-management/orders */
export async function placeOrder(input: { type: OrderType; deliveryDate: string; lines: OrderLine[] }): Promise<Order> {
  await delay();
  const placedAt = now();
  const order: Order = {
    id: `ORD-${getState().outlet.id}-${input.type === 'chilled' ? 'C' : 'D'}-${Math.floor(1000 + Math.random() * 8999)}`,
    type: input.type,
    deliveryDate: input.deliveryDate,
    status: 'scheduled',
    lines: input.lines.filter((l) => l.quantity > 0),
    placedAt: placedAt.toISOString(),
    // The planning engine would set these; we fake a plan two hours later.
    scheduledAt: new Date(placedAt.getTime() + 2 * 3600_000).toISOString(),
    eta: input.type === 'chilled' ? '09:12' : '10:40',
    vehicle: input.type === 'chilled' ? 'VEH056' : 'VEH003',
  };
  setState((s) => ({
    ...s,
    // Replace an existing order for the same day and type (re-ordering edits it).
    orders: [...s.orders.filter((o) => !(o.type === order.type && o.deliveryDate === order.deliveryDate)), order],
    missingFromLast: { ...s.missingFromLast, [input.type]: [] },
  }));
  return order;
}

/** Store manager dismissed the "receive missing items" prompt. */
export async function dismissMissingItems(type: OrderType) {
  setState((s) => ({ ...s, missingFromLast: { ...s.missingFromLast, [type]: [] } }));
}

/** POST /api/execution-sync/orders/:orderRef/dispute */
export async function reportIssue(input: {
  deliveryId: string;
  productId: string;
  kind: IssueKind;
  reasons: string[];
  quantity: number;
}): Promise<IssueReport> {
  await delay(250);
  const delivery = getState().deliveries.find((d) => d.id === input.deliveryId);
  const item = delivery?.items.find((i) => i.productId === input.productId);
  const report: IssueReport = {
    id: uid('REP'),
    itemName: item?.name ?? input.productId,
    createdAt: now().toISOString(),
    ...input,
  };
  setState((s) => ({
    ...s,
    deliveries: s.deliveries.map((d) =>
      d.id === input.deliveryId ? { ...d, reports: [...d.reports, report] } : d,
    ),
  }));
  return report;
}

export async function removeReport(deliveryId: string, reportId: string) {
  setState((s) => ({
    ...s,
    deliveries: s.deliveries.map((d) =>
      d.id === deliveryId ? { ...d, reports: d.reports.filter((r) => r.id !== reportId) } : d,
    ),
  }));
}

/** Store manager starts unloading an arrived vehicle. */
export async function startUnloading(deliveryId: string) {
  await delay(200);
  setState((s) => ({
    ...s,
    deliveries: s.deliveries.map((d) => (d.id === deliveryId ? { ...d, status: 'unloading' } : d)),
  }));
}

/**
 * Generates the 6-digit handover code the driver types into their app.
 * POST /api/execution-sync/orders/:orderRef/confirm
 */
export async function requestConfirmationCode(deliveryId: string): Promise<ConfirmationCode> {
  await delay(300);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  return { deliveryId, code, expiresAt: new Date(now().getTime() + 112_000).toISOString() };
}

/** Called when the driver has entered the code (mocked by the UI for now). */
export async function completeDelivery(deliveryId: string) {
  const at = now().toISOString();
  setState((s) => {
    const delivery = s.deliveries.find((d) => d.id === deliveryId);
    const issues = delivery?.reports.length ?? 0;
    return {
      ...s,
      deliveries: s.deliveries.map((d) => (d.id === deliveryId ? { ...d, status: 'delivered', confirmedAt: at } : d)),
      orders: s.orders.map((o) => (o.id === delivery?.orderId ? { ...o, status: 'delivered', receivedAt: at } : o)),
      updates: [
        {
          id: uid('U'),
          source: 'driver',
          message: `${delivery?.vehicle} delivery confirmed at ${formatClock(new Date(at))}${issues ? ` with ${issues} issue${issues > 1 ? 's' : ''}` : ''} !`,
          at,
          link: `/deliveries/${deliveryId}/receive`,
          read: false,
        },
        ...s.updates,
      ],
    };
  });
}

export async function markUpdatesRead(ids: string[]) {
  setState((s) => ({ ...s, updates: s.updates.map((u) => (ids.includes(u.id) ? { ...u, read: true } : u)) }));
}

/** POST /api/execution-sync/deliveries/:id/problems (not built yet on the backend). */
export async function reportDeliveryProblem(deliveryId: string, problems: string[]) {
  await delay(300);
  return { deliveryId, problems, ok: true };
}
