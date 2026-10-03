/**
 * Store manager authentication.
 * Real endpoints (auth-rbac behind the gateway at /api/auth) are listed in BACKEND_INTEGRATION.md.
 * USE_MOCK=true -> src/mock/server.ts answers instead.
 */
import { USE_MOCK } from './config';
import { ApiError, http, setPendingToken, setUnauthorizedHandler } from './http';
import * as mock from '@/mock/server';
import { MOCK_ACCOUNTS } from '@/mock/users';
import { emptyState, loadSavedSession, saveSession, setState } from '@/state/store';
import type { LoginResponse, Outlet, Session, User } from '@/types';

export class AuthError extends Error {}

/** POST /auth/login */
const apiLogin = (username: string, password: string) =>
  USE_MOCK ? mock.login(username, password) : http.post<LoginResponse>('/auth/login', { username, password }, { auth: false });

/** GET /auth/me (profile fields) */
const apiMe = () => (USE_MOCK ? mock.me() : http.get<User>('/auth/me'));

/** GET /orders/outlets/:outletId */
const apiOutlet = (outletId: string) => (USE_MOCK ? mock.getOutlet(outletId) : http.get<Outlet>(`/orders/outlets/${encodeURIComponent(outletId)}`));

export async function login(username: string, password: string): Promise<Session> {
  let res: LoginResponse;
  try {
    res = await apiLogin(username, password);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 400)) throw new AuthError('Incorrect username or password.');
    throw e;
  }
  if (res.user.role !== 'store_manager') throw new AuthError('This app is for store managers only.');
  if (!res.user.outletId) throw new AuthError('Your account is not linked to an outlet. Contact the dispatcher.');

  // Use the new token for the next two calls; the user only counts as signed in
  // (and the session is saved) once the outlet has loaded.
  setPendingToken(res.access_token);
  try {
    const [outlet, profile] = await Promise.all([apiOutlet(res.user.outletId), apiMe().catch(() => null)]);
    const session: Session = {
      token: res.access_token,
      refreshToken: res.refresh_token,
      user: { id: res.user.id, username: res.user.username, fullName: res.user.fullName, role: 'store_manager', outletId: res.user.outletId, ...(profile ?? {}) },
      outlet,
    };
    saveSession(session);
    setState(() => ({ ...emptyState(), session, outlet }));
    return session;
  } finally {
    setPendingToken(null);
  }
}

/** Sign out. JWTs are stateless, so this only clears the client (no endpoint needed). */
export async function logout() {
  if (USE_MOCK) mock.logout();
  saveSession(null);
  setState(() => emptyState());
}

setUnauthorizedHandler(() => {
  void logout();
});

/** POST /auth/change-password  (needs to be built in auth-rbac) */
export async function changePassword(current: string, next: string) {
  if (next.length < 8) throw new AuthError('New password must be at least 8 characters.');
  if (next === current) throw new AuthError('New password must be different from the current one.');
  try {
    if (USE_MOCK) await mock.changePassword(current, next);
    else await http.post<void>('/auth/change-password', { currentPassword: current, newPassword: next });
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) throw new AuthError(e.message);
    throw e;
  }
}

/** Demo accounts for the login page; empty when talking to the real backend. */
export const demoAccounts = () =>
  USE_MOCK ? MOCK_ACCOUNTS.map((a) => ({ username: a.user.username, password: a.password, storeType: a.outlet.storeType, outletId: a.outlet.id })) : [];

// Mock mode: tell the fake server who is signed in after a page reload.
const saved = loadSavedSession();
if (USE_MOCK && saved) mock.resumeSession(saved.user.username);
