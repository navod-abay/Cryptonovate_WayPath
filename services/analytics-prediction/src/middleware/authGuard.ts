import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type UserRole = 'dispatcher' | 'loader' | 'driver' | 'store_manager' | 'system';

export interface AccessTokenPayload {
  sub: string;
  userId?: string;
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

const DEFAULT_SECRET = 'waypoint_default_jwt_access_secret_key_2026_change_in_prod';

/**
 * Middleware: Verifies the Access JWT token signature statelessly
 */
export const verifyToken = (jwtSecret?: string) => {
  const secret = jwtSecret || process.env.JWT_ACCESS_SECRET || DEFAULT_SECRET;

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

      if (decoded.type && decoded.type !== 'access') {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_TYPE',
            message: 'Token must be an access token',
          },
        });
        return;
      }

      req.user = {
        ...decoded,
        userId: decoded.userId || decoded.sub,
      };
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
export const requireRole = (...allowedRoles: UserRole[]) => {
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
          message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`,
        },
      });
      return;
    }

    next();
  };
};
