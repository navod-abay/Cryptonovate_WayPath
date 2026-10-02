import { env } from '../config/env.js';
import { colomboMinutesSinceMidnight, colomboToday, nextOperatingDay, now } from './calendar.js';
import { appError } from './errors.js';

const CUTOFF_MINUTES = env.ORDER_CUTOFF_HOUR * 60;

export function isPastCutoff(at: Date = now()): boolean {
  return colomboMinutesSinceMidnight(at) >= CUTOFF_MINUTES;
}

/** The run an order confirmed right now would normally go on (ignores the cutoff). */
export function nextRunDate(at: Date = now()): string {
  return nextOperatingDay(colomboToday(at));
}

/** Earliest delivery date still open for ordering at `at` (§5.3 targetDeliveryDate). */
export function earliestDeliveryDate(at: Date = now()): string {
  const next = nextRunDate(at);
  return isPastCutoff(at) ? nextOperatingDay(next) : next;
}

/** A delivery date is open while its ordering cutoff has not passed. */
export function isDateOpen(date: string, at: Date = now()): boolean {
  return date >= earliestDeliveryDate(at);
}

export interface ConfirmDateResolution {
  orderDate: string;
  rolledToNextRun: boolean;
}

/**
 * Decides the delivery date at confirmation.
 * - No requested date → the next run, if its cutoff has not passed.
 * - Requested date   → honoured while it is still open.
 * - Otherwise        → 409 CUTOFF_PASSED, unless the caller consented with accept_next_run,
 *                      in which case the order rolls to the earliest open run.
 */
export function resolveConfirmDate(input: {
  requestedDate: string | null;
  acceptNextRun: boolean;
  at?: Date;
}): ConfirmDateResolution {
  const at = input.at ?? now();
  const earliest = earliestDeliveryDate(at);
  const target = input.requestedDate ?? nextRunDate(at);

  if (target >= earliest) {
    return { orderDate: target, rolledToNextRun: false };
  }
  if (input.acceptNextRun) {
    return { orderDate: earliest, rolledToNextRun: true };
  }
  throw appError(
    'CUTOFF_PASSED',
    `The ${String(env.ORDER_CUTOFF_HOUR).padStart(2, '0')}:00 ${env.BUSINESS_TZ} cutoff for ${target} has passed. ` +
      'Resend with {"accept_next_run": true} to confirm for the next available run.',
    { requested_date: target, next_available_date: earliest },
  );
}
