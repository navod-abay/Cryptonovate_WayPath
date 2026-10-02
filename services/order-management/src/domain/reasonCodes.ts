import { appError } from './errors.js';

export const DEFERRAL_REASONS = {
  CAPACITY_WEIGHT: 'Vehicle weight limits exhausted',
  CAPACITY_VOLUME: 'Vehicle volume limits exhausted',
  NO_REEFER_AVAILABLE: 'Chilled order, no refrigerated vehicle free',
  NO_VAN_FOR_VAN_ONLY_OUTLET: 'van_only outlet, no van available',
  WINDOW_INFEASIBLE: 'Cannot reach the outlet inside its delivery window',
  TIME_BUDGET_EXCEEDED: 'Route time budget exhausted',
  FUEL_QUOTA_EXCEEDED: 'Vehicle weekly fuel quota would be breached',
  VEHICLE_UNAVAILABLE: 'Vehicle in workshop / not available',
  LOWER_PRIORITY: 'Deprioritised against competing demand',
  DISPATCHER_OVERRIDE: 'Manual dispatcher decision',
  AGED_OUT: 'System: exceeded the maximum number of deferrals',
} as const;

export type DeferralReasonCode = keyof typeof DEFERRAL_REASONS;

export const DEFERRAL_REASON_CODES = Object.keys(DEFERRAL_REASONS) as DeferralReasonCode[];

/** AGED_OUT is system-set only; callers may not submit it. */
export const CALLER_REASON_CODES = DEFERRAL_REASON_CODES.filter((c) => c !== 'AGED_OUT');

export interface DeferralReason {
  reasonCode: DeferralReasonCode;
  reasonNote: string | null;
}

export function assertDeferralReason(reasonCode: unknown, reasonNote: unknown): DeferralReason {
  if (typeof reasonCode !== 'string' || !(CALLER_REASON_CODES as string[]).includes(reasonCode)) {
    throw appError('DEFERRAL_REASON_REQUIRED', 'A valid reason_code is required to defer an order', {
      reason_code: reasonCode ?? null,
      allowed: CALLER_REASON_CODES,
    });
  }
  const note = typeof reasonNote === 'string' && reasonNote.trim().length > 0 ? reasonNote.trim() : null;
  if (reasonCode === 'DISPATCHER_OVERRIDE' && note === null) {
    throw appError('DEFERRAL_REASON_REQUIRED', 'DISPATCHER_OVERRIDE requires a non-empty reason_note', {
      reason_code: reasonCode,
    });
  }
  return { reasonCode: reasonCode as DeferralReasonCode, reasonNote: note };
}
