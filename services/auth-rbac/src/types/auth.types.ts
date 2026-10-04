export type UserRole = 'dispatcher' | 'loader' | 'driver' | 'store_manager';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  outlet_id: string | null;
  depot: string | null;
  vehicle_id: string | null; // drivers: the vehicle they drive
  email?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface UserResponse {
  id: string;
  username: string;
  role: UserRole;
  fullName: string;
  outletId: string | null;
  depot: string | null;
  vehicleId: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRole;
  outlet_id: string | null;
  depot: string | null;
  vehicle_id?: string | null; // drivers only
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export type TokenPayload = AccessTokenPayload | RefreshTokenPayload;

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}
