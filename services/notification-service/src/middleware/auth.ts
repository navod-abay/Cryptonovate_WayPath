import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export type UserRole = 'dispatcher' | 'loader' | 'driver' | 'store_manager' | 'system';

/** auth-rbac access token claims. */
export interface AccessTokenPayload {
  sub: string;
  username?: string;
  role: UserRole;
  outlet_id?: string | null;
  depot?: string | null;
  type?: 'access' | 'refresh';
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export const authenticateJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice('Bearer '.length), config.jwtSecret) as AccessTokenPayload;
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ success: false, error: 'Unauthorized: Token must be an access token' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }
};

export const requireRole = (...allowedRoles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => {
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
