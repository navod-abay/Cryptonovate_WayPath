import { appError } from './errors.js';

export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'allocated',
  'loaded',
  'out_for_delivery',
  'delivered',
  'received',
  'disputed',
  'deferred',
  'not_run',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * draft ──┬─→ confirmed ──┬─→ allocated → loaded → out_for_delivery → delivered ──┬─→ received
 *         │               │                                                       └─→ disputed
 *         └─→ cancelled   ├─→ deferred ──┬─→ confirmed  (back into the next run's pool)
 *                         │              └─→ not_run    (aged out after MAX_DEFERRALS)
 *                         └─→ cancelled
 */
export const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['allocated', 'deferred', 'cancelled'],
  allocated: ['loaded'],
  loaded: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['received', 'disputed'],
  deferred: ['confirmed', 'not_run'],
  received: [],
  disputed: [],
  not_run: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ORDER_STATUSES.filter((s) => TRANSITIONS[s].length === 0);

/** Statuses that still represent demand the business has to fulfil. */
export const OPEN_STATUSES: readonly OrderStatus[] = [
  'confirmed',
  'deferred',
  'allocated',
  'loaded',
  'out_for_delivery',
];

export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ['draft', 'confirmed'];

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    const allowed = TRANSITIONS[from];
    throw appError(
      'INVALID_STATE_TRANSITION',
      `Cannot move an order from '${from}' to '${to}'` +
        (allowed.length ? `. Allowed: ${allowed.join(', ')}` : ` ('${from}' is terminal)`),
      { from, to, allowed: [...allowed] },
    );
  }
}
