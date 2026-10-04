/**
 * Tokens from POST /api/auth/login (the sign-in screen). Kept in memory like the sign-in state,
 * so a reload signs out. Every protected API call needs it.
 */
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export const getAccessToken = () => accessToken;

export function setTokens(tokens: { access_token?: string; refresh_token?: string } | null | undefined) {
  accessToken = tokens?.access_token || null;
  refreshToken = tokens?.refresh_token || null;
}

export const clearTokens = () => setTokens(null);

/** Exchanges the refresh token for a new access token once; concurrent callers share the attempt. */
export function refreshAccessToken(base: string): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal: AbortSignal.timeout(3000),
  })
    .then(async response => {
      const body = response.ok ? await response.json() : null;
      const token = body?.access_token ?? body?.data?.access_token;
      if (token) accessToken = token;
      return !!token;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}
