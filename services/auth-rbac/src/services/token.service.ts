import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AccessTokenPayload, RefreshTokenPayload, User } from '../types/auth.types.js';

export class TokenService {
  /**
   * Generates a short-lived stateless Access JWT (15 min expiry)
   */
  static generateAccessToken(user: User): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      outlet_id: user.outlet_id,
      depot: user.depot,
      type: 'access',
    };

    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: '15m',
    });
  }

  /**
   * Generates a long-lived stateless Refresh JWT
   * Expiry: 16 hours for drivers (shift duration & rural connectivity blackout tolerance)
   * Expiry: 7 days for other operational roles
   */
  static generateRefreshToken(user: User): string {
    const payload: RefreshTokenPayload = {
      sub: user.id,
      type: 'refresh',
    };

    const expiresIn = user.role === 'driver' ? '16h' : '7d';

    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn,
    });
  }

  /**
   * Verifies access JWT signature and ensures payload type is 'access'
   */
  static verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (decoded.type !== 'access') {
      throw new Error('INVALID_TOKEN_TYPE');
    }
    return decoded;
  }

  /**
   * Verifies refresh JWT signature and ensures payload type is 'refresh'
   */
  static verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    if (decoded.type !== 'refresh') {
      throw new Error('INVALID_TOKEN_TYPE');
    }
    return decoded;
  }
}
