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

export async function refreshSession(): Promise<{ access_token: string }> {
  return apiPost('/api/auth/refresh', {});
}

export async function getProfile(): Promise<AuthUser> {
  return apiGet<AuthUser>('/api/auth/me');
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export function logout() {
  clearTokens();
}
