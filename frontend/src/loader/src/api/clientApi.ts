const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
}

export function getAccessToken() {
  return accessToken;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

interface ApiError {
  code: string;
  message: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    // auth-rbac and fleet send { error: { code, message } }; execution-sync sends { error: "text" }.
    const error = (data as { error?: ApiError | string })?.error;
    throw new Error((typeof error === 'string' ? error : error?.message) || `HTTP ${response.status}`);
  }

  // Unwrap { success, data } envelope
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as { data: T }).data;
  }

  return data as T;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${GATEWAY_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await handleResponse<{ access_token: string }>(response);
    accessToken = data.access_token;
    return accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (response.status === 401 && refreshToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retry = await fetch(`${GATEWAY_URL}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
      });
      return handleResponse<T>(retry);
    }
  }

  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 && refreshToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retry = await fetch(`${GATEWAY_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify(body),
      });
      return handleResponse<T>(retry);
    }
  }

  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 && refreshToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retry = await fetch(`${GATEWAY_URL}${path}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify(body),
      });
      return handleResponse<T>(retry);
    }
  }

  return handleResponse<T>(response);
}
