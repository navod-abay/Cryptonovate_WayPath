import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type UserRole = 'dispatcher' | 'loader' | 'driver' | 'store_manager' | 'system';

export interface AccessTokenPayload {
  sub?: string;
  userId?: string;
  username?: string;
  email?: string;
  role: UserRole;
  outlet_id?: string | null;
  depot?: string | null;
  type?: 'access';
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'waypoint_default_jwt_access_secret_key_2026_change_in_prod';

export const authenticateJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      ...decoded,
      userId: decoded.userId || decoded.sub,
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Unauthenticated user' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Required role (${allowedRoles.join(', ')}) missing. Current role: ${req.user.role}`,
      });
    }

    next();
  };
};

/**
 * Ensures store_manager can only confirm or dispute orders for their own outlet
 */
export const enforceOutletScope = (paramName: string = 'outletId') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next();

    if (user.role === 'dispatcher' || user.role === 'system') {
      return next();
    }

    if (user.role === 'store_manager') {
      const requestedOutlet = req.params[paramName] || req.query[paramName] || (req.body && req.body[paramName]);
      if (requestedOutlet && user.outlet_id && requestedOutlet !== user.outlet_id) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Outlet scope violation. Assigned to ${user.outlet_id}`,
        });
      }
    }

    next();
  };
};

