/**
 * Store manager auth (dummy). Connect to auth-rbac later:
 *   login          -> POST /api/auth-rbac/auth/login   { username, password } -> { accessToken, refreshToken, user }
 *   logout         -> POST /api/auth-rbac/auth/logout
 *   changePassword -> POST /api/auth-rbac/auth/change-password
 * Only this file and the mock accounts need to change.
 */
import { MOCK_ACCOUNTS } from '@/mock/users';
import { emptyState, getState, saveSession, setState, stateForSession } from '@/state/store';
import type { Session } from '@/types';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export class AuthError extends Error {}

export async function login(username: string, password: string): Promise<Session> {
  await delay();
  const account = MOCK_ACCOUNTS.find((a) => a.user.username.toLowerCase() === username.trim().toLowerCase());
  if (!account || account.password !== password) throw new AuthError('Incorrect username or password.');
  const session: Session = {
    token: `mock.${btoa(account.user.username)}.${Date.now()}`,
    user: account.user,
    outlet: account.outlet,
  };
  saveSession(session);
  setState(() => stateForSession(session));
  return session;
}

export async function logout() {
  saveSession(null);
  setState(() => emptyState());
}

export async function changePassword(current: string, next: string) {
  await delay(400);
  const username = getState().session?.user.username;
  const account = MOCK_ACCOUNTS.find((a) => a.user.username === username);
  if (!account) throw new AuthError('You are not logged in.');
  if (account.password !== current) throw new AuthError('Current password is incorrect.');
  if (next.length < 8) throw new AuthError('New password must be at least 8 characters.');
  if (next === current) throw new AuthError('New password must be different from the current one.');
  account.password = next; // mock only: resets when the page reloads
}
