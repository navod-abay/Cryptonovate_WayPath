import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, appError, isAppError, mapPgError } from '../domain/errors.js';

/** Express 4 does not forward rejected promises; this does. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(appError('NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));
};

interface BodyParserError {
  type: string;
  status?: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return typeof err === 'object' && err !== null && typeof (err as { type?: unknown }).type === 'string';
}

function normalise(err: unknown): AppError {
  if (isAppError(err)) return err;

  if (err instanceof ZodError) {
    return appError(
      'VALIDATION_ERROR',
      'Invalid request payload format',
      err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    );
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return appError('VALIDATION_ERROR', 'Request body is not valid JSON');
    }
    if (err.type === 'entity.too.large') {
      return appError('PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    if (err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
      return appError('VALIDATION_ERROR', 'Unsupported request body encoding');
    }
  }

  return mapPgError(err) ?? appError('INTERNAL_SERVER_ERROR', 'An unexpected internal error occurred');
}

// Must be registered as the LAST app.use().
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appErr = normalise(err);
  const orderRef = typeof req.params?.order_ref === 'string' ? req.params.order_ref : undefined;
  const logContext = `${req.method} ${req.originalUrl} code=${appErr.code}${orderRef ? ` order_ref=${orderRef}` : ''}`;

  if (appErr.httpStatus >= 500) {
    console.error(`❌ ${logContext}`, err);
  } else {
    console.warn(`⚠️ ${logContext} — ${appErr.message}`);
  }

  res.status(appErr.httpStatus).json({
    success: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
    },
  });
}
