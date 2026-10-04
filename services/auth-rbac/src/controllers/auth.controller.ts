import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool';
import { TokenService } from '../services/token.service';
import { User } from '../types/auth.types';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export class AuthController {
  /**
   * POST /login
   */
  static async login(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body;

    try {
      const result = await pool.query<User>(
        'SELECT id, username, password_hash, full_name, role, outlet_id, depot, is_active, created_at FROM users WHERE username = $1',
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

      const access_token = TokenService.generateAccessToken(user);
      const refresh_token = TokenService.generateRefreshToken(user);

      res.status(200).json({
        success: true,
        access_token,
        refresh_token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          fullName: user.full_name,
          outletId: user.outlet_id,
          depot: user.depot,
        },
      });
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
   * POST /refresh
   */
  static async refresh(req: Request, res: Response): Promise<void> {
    const { refresh_token } = req.body;

    try {
      const decoded = TokenService.verifyRefreshToken(refresh_token);

      const result = await pool.query<User>(
        'SELECT id, username, password_hash, full_name, role, outlet_id, depot, is_active, created_at FROM users WHERE id = $1',
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
        'SELECT id, username, full_name, role, outlet_id, depot, is_active, created_at FROM users WHERE id = $1',
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
}
