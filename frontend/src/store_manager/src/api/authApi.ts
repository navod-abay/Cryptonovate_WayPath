/**
 * Store manager authentication.
 * Real endpoints (auth-rbac behind the gateway at /api/auth) are listed in BACKEND_INTEGRATION.md.
 * USE_MOCK=true -> src/mock/server.ts answers instead.
 */
import { AUTH_API_BASE_URL, USE_MOCK, USE_MOCK_AUTH } from './config';
import { ApiError, http, setPendingToken, setUnauthorizedHandler } from './http';
import * as backend from './backend';
import * as mock from '@/mock/server';
import { MOCK_ACCOUNTS } from '@/mock/users';
import { emptyState, loadSavedSession, saveSession, setState } from '@/state/store';
import type { LoginResponse, Outlet, Session, User } from '@/types';

export class AuthError extends Error {}

/** POST /auth/login */
const apiLogin = (username: string, password: string) =>
  USE_MOCK_AUTH
    ? mock.login(username, password)
    : http.post<LoginResponse>('/auth/login', { username, password }, { auth: false, baseUrl: AUTH_API_BASE_URL });

/** GET /auth/me (profile fields) */
const apiMe = async (): Promise<Partial<User>> => {
  if (USE_MOCK_AUTH) return mock.me();
  const res = await http.get<User | { success: boolean; user: User }>('/auth/me', undefined, { baseUrl: AUTH_API_BASE_URL });
  return (res as any)?.user ?? res;
};

/** POST /fleet/outlets/batch (brand and district); the manager's name comes from the login */
const apiOutlet = (outletId: string, fullName: string): Promise<Outlet> =>
  USE_MOCK ? mock.getOutlet(outletId) : backend.fetchOutlet(outletId, fullName);

export async function login(username: string, password: string): Promise<Session> {
  let res: LoginResponse;
  try {
    res = await apiLogin(username, password);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 400)) throw new AuthError(e.message || 'Incorrect username or password.');
    throw e;
  }
  if (res.user.role !== 'store_manager') throw new AuthError('This app is for store managers only.');
  if (!res.user.outletId) throw new AuthError('Your account is not linked to an outlet. Contact the dispatcher.');

  // Use the new token for the next two calls; the user only counts as signed in
  // (and the session is saved) once the outlet has loaded.
  setPendingToken(res.access_token);
  try {
    const [outlet, profile] = await Promise.all([apiOutlet(res.user.outletId, res.user.fullName), apiMe().catch(() => null)]);
    const profileUser = (profile as any)?.user ?? profile ?? {};
    const session: Session = {
      token: res.access_token,
      refreshToken: res.refresh_token,
      user: {
        id: res.user.id,
        username: res.user.username,
        fullName: res.user.fullName,
        role: 'store_manager',
        outletId: res.user.outletId,
        ...profileUser,
        // /me returns when the account was created
        memberSince: profileUser.memberSince ?? (profileUser as { createdAt?: string }).createdAt,
      },
      outlet,
    };
    saveSession(session);
    setState(() => ({ ...emptyState(), session, outlet }));
    return session;
  } finally {
    setPendingToken(null);
  }
}

/**
 * Re-reads the profile and the outlet so a change made on the server shows without signing in
 * again. The session is saved at login and would otherwise keep the old values until then.
 */
export async function refreshProfile() {
  const session = loadSavedSession();
  if (USE_MOCK_AUTH || !session) return;
  const [outlet, profile] = await Promise.all([apiOutlet(session.user.outletId, session.user.fullName), apiMe().catch(() => null)]);
  const fresh = ((profile as any)?.user ?? profile ?? {}) as Partial<User> & { createdAt?: string };
  const next: Session = {
    ...session,
    user: { ...session.user, ...fresh, memberSince: fresh.memberSince ?? fresh.createdAt ?? session.user.memberSince },
    outlet,
  };
  saveSession(next);
  setState((s) => (s.session ? { ...s, session: next, outlet } : s));
}

/** Sign out. JWTs are stateless, so this only clears the client (no endpoint needed). */
export async function logout() {
  if (USE_MOCK_AUTH) mock.logout();
  saveSession(null);
  setState(() => emptyState());
}

setUnauthorizedHandler(() => {
  void logout();
});

/** POST /auth/change-password */
export async function changePassword(current: string, next: string, confirm?: string) {
  if (next.length < 8) throw new AuthError('New password must be at least 8 characters.');
  if (next === current) throw new AuthError('New password must be different from the current one.');
  try {
    if (USE_MOCK_AUTH) await mock.changePassword(current, next);
    else await http.post<void>('/auth/change-password', { currentPassword: current, newPassword: next, confirmPassword: confirm }, { baseUrl: AUTH_API_BASE_URL });
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) throw new AuthError(e.message);
    throw e;
  }
}

/** Demo accounts for the login page */
export const demoAccounts = () =>
  USE_MOCK_AUTH
    ? MOCK_ACCOUNTS.map((a) => ({ username: a.user.username, password: a.password, storeType: a.outlet.storeType, outletId: a.outlet.id }))
    : [
        { username: 'manager_out001', password: 'Password123!', storeType: 'grocery' as const, outletId: 'OUT001' },
      ];

// Mock mode: tell the fake server who is signed in after a page reload.
const saved = loadSavedSession();
if (USE_MOCK && saved) mock.resumeSession(saved.user.username);
