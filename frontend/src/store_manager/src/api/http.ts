/**
 * Small fetch wrapper used by every real (non-mock) API call.
 * - Prefixes API_BASE_URL (e.g. "/api" -> NGINX gateway).
 * - Sends the JWT as "Authorization: Bearer <token>".
 * - Unwraps the backend envelope { success, data } and returns `data`.
 * - Times out after REQUEST_TIMEOUT_MS.
 * - On 401 tries POST /auth/refresh once, then signs the user out.
 */
import { API_BASE_URL, AUTH_API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';
import { getState, saveSession, setState } from '@/state/store';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown, readonly code?: string) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Options {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Send the bearer token (default true). */
  auth?: boolean;
  /** Custom base URL override (e.g. AUTH_API_BASE_URL) */
  baseUrl?: string;
}

let onUnauthorized: () => void = () => undefined;
/** Token used during sign-in, before the session is stored. */
let pendingToken: string | null = null;
export const setPendingToken = (t: string | null) => { pendingToken = t; };
/** authApi registers what to do when the session can't be refreshed (sign out). */
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

function buildUrl(path: string, query?: Options['query'], baseUrl?: string) {
  const base = baseUrl ?? API_BASE_URL;
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${url}?${qs}` : url;
}

async function send(method: Method, path: string, opts: Options): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const token = getState().session?.token ?? pendingToken;
  try {
    return await fetch(buildUrl(path, opts.query, opts.baseUrl), {
      method,
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.auth !== false && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ApiError('The server took too long to respond.', 0);
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
  }
}

/** POST /auth/refresh with the saved refresh token; true when a new access token was stored. */
export async function tryRefresh(): Promise<boolean> {
  const session = getState().session;
  if (!session?.refreshToken) return false;
  const res = await send('POST', '/auth/refresh', {
    body: { refresh_token: session.refreshToken },
    auth: false,
    baseUrl: AUTH_API_BASE_URL,
  }).catch(() => null);
  if (!res?.ok) return false;
  const json = await res.json().catch(() => ({}));
  const token = json.access_token ?? json.data?.access_token;
  if (!token) return false;
  const next = { ...session, token };
  saveSession(next);
  setState((s) => ({ ...s, session: next }));
  return true;
}

export async function request<T>(method: Method, path: string, opts: Options = {}): Promise<T> {
  let res = await send(method, path, opts);
  if (res.status === 401 && opts.auth !== false && (await tryRefresh())) res = await send(method, path, opts);

  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false) onUnauthorized();
    const message = json?.message ?? json?.error?.message ?? json?.error ?? `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, json?.details ?? json?.error?.details, json?.error?.code);
  }
  // Backend services reply { success: true, data: ... }; fall back to the raw body.
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}

export const http = {
  get: <T>(path: string, query?: Options['query'], opts?: Omit<Options, 'body' | 'query'>) => request<T>('GET', path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts?: Omit<Options, 'body'>) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<Options, 'body'>) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<Options, 'body'>) => request<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, opts?: Omit<Options, 'body'>) => request<T>('DELETE', path, opts),
};
