import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ROUTES, fetchWithTimeout } from './config';

/**
 * The driver's session, kept on the phone so the app opens signed in. auth-rbac issues a 15-minute
 * access token and a 16-hour refresh token for drivers (a shift); authFetch refreshes the access
 * token once when a call is answered 401.
 */
export const ACCESS_TOKEN_KEY = '@auth_access_token';
const REFRESH_TOKEN_KEY = '@auth_refresh_token';
const USER_KEY = '@auth_user';
/** The depot this phone signs in at, remembered between sign-ins. */
const DEPOT_KEY = '@auth_depot';

export const DEPOTS = ['Peliyagoda', 'Kandy'] as const;
export type Depot = (typeof DEPOTS)[number];

export interface Driver {
  id: string;
  username: string;
  fullName: string;
  depot: string;
  vehicleId: string;
}

export class AuthError extends Error {}

export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
};

export async function getDriver(): Promise<Driver | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Driver) : null;
  } catch {
    return null;
  }
}

export async function getSavedDepot(): Promise<Depot | null> {
  const depot = await AsyncStorage.getItem(DEPOT_KEY).catch(() => null);
  return DEPOTS.find((d) => d === depot) ?? null;
}

/** Signed in when both a session and a driver are stored. */
export async function hasSession(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(REFRESH_TOKEN_KEY).catch(() => null)) && !!(await getDriver());
}

/** Error text from the services' { error: { message } } or { error: "text" } bodies. */
export function errorMessage(body: any, status: number): string {
  const e = body?.error;
  return (typeof e === 'string' ? e : e?.message) || `Request failed (${status})`;
}

/** The driver signs in with their own 4-digit PIN at the depot the phone is set to. */
export async function pinLogin(depot: Depot, pin: string): Promise<Driver> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_ROUTES.AUTH}/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depot, pin, role: 'driver' }),
    });
  } catch {
    throw new AuthError('No connection to the server. Check the network and try again.');
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) throw new AuthError('Wrong PIN. Please try again.');
  if (!res.ok) throw new AuthError(errorMessage(body, res.status));
  const user = body.user;
  if (user.role !== 'driver' || !user.vehicleId) {
    throw new AuthError('This account is not linked to a vehicle. Ask the dispatcher.');
  }
  const driver: Driver = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    depot: user.depot,
    vehicleId: user.vehicleId,
  };
  await AsyncStorage.setMany({
    [ACCESS_TOKEN_KEY]: body.access_token,
    [REFRESH_TOKEN_KEY]: body.refresh_token,
    [USER_KEY]: JSON.stringify(driver),
    [DEPOT_KEY]: depot,
  });
  return driver;
}

/** Signs out: the session goes, the phone's depot stays. */
export async function logout(): Promise<void> {
  await AsyncStorage.removeMany([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  const res = await fetchWithTimeout(`${API_ROUTES.AUTH}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.status === 401) {
    await logout(); // the shift's refresh token expired or the account was disabled
    return null;
  }
  if (!res.ok) return null;
  const { access_token } = await res.json();
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access_token);
  return access_token;
}

/**
 * fetch with the driver's access token, refreshed once on 401. Throws AuthError when the session is
 * gone, so the screen can send the driver back to sign in.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetchWithTimeout(url, {
      ...options,
      headers: { ...(options.headers as Record<string, string>), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  let res = await send(await getAccessToken());
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (!token) throw new AuthError('Your session has ended. Please sign in again.');
    res = await send(token);
  }
  return res;
}
