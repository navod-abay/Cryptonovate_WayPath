import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/auth.types';

// 'system' is not a user role: it is the role of the tokens services sign for each other.
export const requireRoles = (allowedRoles: (UserRole | 'system')[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required prior to permission check',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole | 'system')) {
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
