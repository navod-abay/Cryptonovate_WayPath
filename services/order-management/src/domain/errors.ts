export const ErrorCodes = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  INVALID_TOKEN: 401,
  FORBIDDEN: 403,
  OUTLET_SCOPE_VIOLATION: 403,
  ORDER_NOT_FOUND: 404,
  OUTLET_NOT_FOUND: 404,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  CUTOFF_PASSED: 409,
  DUPLICATE_ORDER: 409,
  INVALID_STATE_TRANSITION: 409,
  ORDER_NOT_EDITABLE: 409,
  ORDER_NOT_CANCELLABLE: 409,
  IDEMPOTENCY_KEY_CONFLICT: 409,
  RECEIPT_ALREADY_RECORDED: 409,
  EMPTY_ORDER: 422,
  CHILLED_MISMATCH: 422,
  DEFERRAL_REASON_REQUIRED: 422,
  NON_OPERATING_DATE: 422,
  RECEIPT_UNITS_MISMATCH: 422,
  DB_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function appError(code: ErrorCode, message: string, details?: unknown): AppError {
  return new AppError(code, ErrorCodes[code], message, details);
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

interface PgErrorLike {
  code: string;
  constraint?: string;
  detail?: string;
}

const PG_CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08001',
  '08003',
  '08006',
]);

export function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export function isUniqueViolation(err: unknown, constraint?: string): err is PgErrorLike {
  return isPgError(err) && err.code === '23505' && (constraint === undefined || err.constraint === constraint);
}

/**
 * Translates a raw pg error into the service's error catalogue. Returns null for
 * errors that are not recognised so the caller can fall through to a 500.
 */
export function mapPgError(err: unknown): AppError | null {
  if (!isPgError(err)) {
    if (err instanceof Error && /Connection terminated|timeout exceeded when trying to connect/i.test(err.message)) {
      return appError('DB_UNAVAILABLE', 'Database is unavailable, please retry shortly');
    }
    return null;
  }
  if (PG_CONNECTION_CODES.has(err.code)) {
    return appError('DB_UNAVAILABLE', 'Database is unavailable, please retry shortly');
  }
  switch (err.code) {
    case '23505':
      if (err.constraint === 'uq_orders_idempotency') {
        return appError('IDEMPOTENCY_KEY_CONFLICT', 'Idempotency-Key has already been used');
      }
      if (err.constraint === 'order_receipts_order_ref_key') {
        return appError('RECEIPT_ALREADY_RECORDED', 'A receipt has already been recorded for this order');
      }
      return appError('DUPLICATE_ORDER', 'An order already exists for this outlet, date and temperature requirement');
    case '23503':
      return appError('OUTLET_NOT_FOUND', 'Referenced outlet does not exist');
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return appError('VALIDATION_ERROR', 'Value rejected by a database constraint', {
        constraint: err.constraint ?? null,
      });
    default:
      return null;
  }
}
