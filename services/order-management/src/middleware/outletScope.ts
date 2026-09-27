import { NextFunction, Request, Response } from 'express';
import { appError } from '../domain/errors.js';
import type { AccessTokenPayload, UserRole } from './authGuard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Actor {
  id: string | null;
  username: string;
  role: UserRole;
  outletId: string | null;
}

export function actorFrom(req: Request): Actor {
  const user: AccessTokenPayload | undefined = req.user;
  if (!user) {
    throw appError('UNAUTHORIZED', 'User authentication context required');
  }
  return {
    // placed_by / actor_id are UUID columns; never let a malformed `sub` break a write.
    id: typeof user.sub === 'string' && UUID_PATTERN.test(user.sub) ? user.sub : null,
    username: user.username,
    role: user.role,
    outletId: user.outlet_id ?? null,
  };
}

/**
 * A store_manager may only act on the outlet in their token. Dispatchers and loaders
 * are not outlet-scoped (route-level role checks decide what they may do).
 */
export function assertOutletInScope(actor: Actor, outletId: string): void {
  if (actor.role !== 'store_manager') return;
  if (!actor.outletId) {
    throw appError('OUTLET_SCOPE_VIOLATION', 'Store manager account is not linked to an outlet');
  }
  if (actor.outletId !== outletId) {
    throw appError('OUTLET_SCOPE_VIOLATION', `Store manager for ${actor.outletId} may not access outlet ${outletId}`, {
      token_outlet_id: actor.outletId,
      requested_outlet_id: outletId,
    });
  }
}

/**
 * For create: a store_manager's effective outlet is always the token's outlet_id.
 * An explicit, different outlet_id in the body is rejected rather than silently rewritten,
 * so a client bug surfaces instead of placing an order somewhere unexpected.
 * Dispatchers must name the outlet.
 */
export function resolveCreateOutlet(req: Request, _res: Response, next: NextFunction): void {
  try {
    const actor = actorFrom(req);
    const body = (req.body ?? {}) as { outlet_id?: unknown };
    const requested = typeof body.outlet_id === 'string' && body.outlet_id.length > 0 ? body.outlet_id : undefined;

    if (actor.role === 'store_manager') {
      if (!actor.outletId) {
        throw appError('OUTLET_SCOPE_VIOLATION', 'Store manager account is not linked to an outlet');
      }
      if (requested !== undefined) assertOutletInScope(actor, requested);
      req.body = { ...body, outlet_id: actor.outletId };
    } else if (requested === undefined) {
      throw appError('VALIDATION_ERROR', 'Invalid request payload format', [
        { field: 'outlet_id', message: 'outlet_id is required' },
      ]);
    }
    next();
  } catch (err) {
    next(err);
  }
}
