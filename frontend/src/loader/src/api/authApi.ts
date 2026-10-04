import { apiGet, apiPost, setTokens, getAccessToken, clearTokens } from './clientApi';

export interface AuthUser {
  id: string;
  username: string;
  role: 'dispatcher' | 'loader' | 'driver' | 'store_manager';
  fullName: string;
  outletId: string | null;
  depot: string | null;
}

export interface LoginResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const data = await apiPost<LoginResponse>('/api/auth/login', { username, password });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

/** A loader signs in at their depot's kiosk with their own 4-digit PIN. */
export async function pinLogin(depot: string, pin: string): Promise<LoginResponse> {
  const data = await apiPost<LoginResponse>('/api/auth/pin-login', { depot, pin });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function getProfile(): Promise<AuthUser> {
  const data = await apiGet<{ user: AuthUser }>('/api/auth/me');
  return data.user;
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export function logout() {
  clearTokens();
}
