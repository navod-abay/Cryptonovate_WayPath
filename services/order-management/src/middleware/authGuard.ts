/**
 * Exportable Shared Auth Guard Middleware
 * Can be copied or imported across microservices (order-management, fleet-directory, etc.)
 * Verifies JWT access tokens statelessly without HTTP calls to auth-rbac.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 'system' is a service identity, not a person: Planning & Allocation signs its own access tokens
// with this role to read the confirmed pool and write allocations back.
export type UserRole = 'dispatcher' | 'loader' | 'driver' | 'store_manager' | 'system';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRole;
  outlet_id: string | null;
  depot: string | null;
  type: 'access';
}

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Middleware: Verifies the Access JWT token signature statelessly
 */
export const verifyToken = (jwtSecret: string) => {
  // No fallback secret: a baked-in default would let anyone who has read the repo mint tokens.
  if (!jwtSecret) {
    throw new Error('verifyToken requires the JWT access secret');
  }
  const secret = jwtSecret;

  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Bearer authorization token required',
        },
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, secret) as AccessTokenPayload;

      if (decoded.type !== 'access') {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_TYPE',
            message: 'Token must be an access token',
          },
        });
        return;
      }

      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired access token',
        },
      });
    }
  };
};

/**
 * Middleware: Enforces allowed roles
 */
export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication context required',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
        },
      });
      return;
    }

    next();
  };
};
