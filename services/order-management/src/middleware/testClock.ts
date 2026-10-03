import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { runWithClock } from '../domain/calendar.js';
import { appError } from '../domain/errors.js';

const HEADER = 'x-test-now';
// Require an explicit offset so a test can never be silently evaluated in the host's TZ.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Honours `X-Test-Now: 2026-10-03T15:00:00+05:30` to freeze the business clock for one
 * request. Disabled (header ignored) when NODE_ENV=production.
 */
export function testClock(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.header(HEADER);
  if (!raw || env.NODE_ENV === 'production') {
    next();
    return;
  }
  const at = new Date(raw);
  if (!ISO_WITH_OFFSET.test(raw) || Number.isNaN(at.getTime())) {
    next(appError('VALIDATION_ERROR', 'X-Test-Now must be an ISO 8601 timestamp with an offset, e.g. 2026-10-03T15:00:00+05:30'));
    return;
  }
  runWithClock(at, () => next());
}
