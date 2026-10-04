import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool';
import { TokenService } from '../services/token.service';
import { pinLookup } from '../services/pin.service';
import { User } from '../types/auth.types';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export const pinLoginSchema = z.object({
  depot: z.string().min(1, 'Depot is required'),
  // Loaders sign in at the depot kiosk, drivers on their phone.
  role: z.enum(['loader', 'driver']).default('loader'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits'),
});

export const loadersQuerySchema = z.object({
  depot: z.string().min(1).optional(),
});

/** Issues the token pair for a signed-in user, in the shape POST /login returns. */
function sendSession(res: Response, user: User): void {
  res.status(200).json({
    success: true,
    access_token: TokenService.generateAccessToken(user),
    refresh_token: TokenService.generateRefreshToken(user),
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      outletId: user.outlet_id,
      depot: user.depot,
      vehicleId: user.vehicle_id ?? null,
    },
  });
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export class AuthController {
  /**
   * POST /login
   */
  static async login(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body;

    try {
      const result = await pool.query<User>(
        'SELECT id, username, password_hash, full_name, role, outlet_id, depot, vehicle_id, is_active, created_at FROM users WHERE username = $1',
        [username]
      );

      const user = result.rows[0];

      if (!user || !user.is_active) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        });
        return;
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        });
        return;
      }

      sendSession(res, user);
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected authentication error occurred',
        },
      });
    }
  }

  /**
   * POST /pin-login — a loader at their depot's kiosk, or a driver on their phone, signs in with
   * their own 4-digit PIN. PINs are unique per role within a depot, so role, depot and PIN identify
   * one person.
   */
  static async pinLogin(req: Request, res: Response): Promise<void> {
    const { depot, pin, role } = req.body;

    try {
      const result = await pool.query<User>(
        `SELECT id, username, password_hash, full_name, role, outlet_id, depot, vehicle_id, is_active, created_at
           FROM users
          WHERE role = $1 AND lower(depot) = lower($2) AND pin_lookup = $3 AND is_active`,
        [role, depot, pinLookup(role, depot, pin)]
      );
      const user = result.rows[0];
      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid PIN',
          },
        });
        return;
      }
      sendSession(res, user);
    } catch (error) {
      console.error('Error during PIN login:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected authentication error occurred',
        },
      });
    }
  }

  /**
   * GET /loaders?depot= — the active loaders (all depots, or one). Planning reads it to share each
   * day's vehicles among a depot's loaders.
   */
  static async loaders(req: Request, res: Response): Promise<void> {
    const parsed = loadersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'depot must be a non-empty string' },
      });
      return;
    }
    try {
      const result = await pool.query<Pick<User, 'id' | 'username' | 'full_name' | 'depot'>>(
        `SELECT id, username, full_name, depot FROM users
          WHERE role = 'loader' AND is_active AND depot IS NOT NULL AND ($1::text IS NULL OR lower(depot) = lower($1))
          ORDER BY depot, username`,
        [parsed.data.depot ?? null]
      );
      res.status(200).json({
        success: true,
        data: result.rows.map((u) => ({ id: u.id, username: u.username, fullName: u.full_name, depot: u.depot })),
      });
    } catch (error) {
      console.error('Error listing loaders:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list loaders',
        },
      });
    }
  }

  /**
   * POST /refresh
   */
  static async refresh(req: Request, res: Response): Promise<void> {
    const { refresh_token } = req.body;

    try {
      const decoded = TokenService.verifyRefreshToken(refresh_token);

      const result = await pool.query<User>(
        'SELECT id, username, password_hash, full_name, role, outlet_id, depot, vehicle_id, is_active, created_at FROM users WHERE id = $1',
        [decoded.sub]
      );

      const user = result.rows[0];

      if (!user || !user.is_active) {
        res.status(401).json({
          success: false,
          error: {
            code: 'USER_INACTIVE',
            message: 'User account is inactive or no longer exists',
          },
        });
        return;
      }

      const new_access_token = TokenService.generateAccessToken(user);

      res.status(200).json({
        success: true,
        access_token: new_access_token,
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid, expired, or malformed refresh token',
        },
      });
    }
  }

  /**
   * GET /me
   */
  static async me(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthenticated context',
        },
      });
      return;
    }

    try {
      const result = await pool.query<User>(
        'SELECT id, username, full_name, role, outlet_id, depot, vehicle_id, is_active, created_at FROM users WHERE id = $1',
        [req.user.sub]
      );

      const user = result.rows[0];

      if (!user) {
        res.status(444).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User record not found',
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          fullName: user.full_name,
          outletId: user.outlet_id,
          depot: user.depot,
          vehicleId: user.vehicle_id,
          isActive: user.is_active,
          createdAt: user.created_at,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve user profile',
        },
      });
    }
  }

  /**
   * GET /health
   */
  static health(req: Request, res: Response): void {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'auth-rbac',
    });
  }

  /**
   * POST /change-password
   */
  static async changePassword(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthenticated context',
        },
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const result = await pool.query<User>(
        'SELECT id, password_hash FROM users WHERE id = $1',
        [req.user.sub]
      );

      const user = result.rows[0];
      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User record not found',
          },
        });
        return;
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
          },
        });
        return;
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        newPasswordHash,
        user.id,
      ]);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to change password',
        },
      });
    }
  }

  /**
   * POST /logout
   */
  static logout(req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
}

