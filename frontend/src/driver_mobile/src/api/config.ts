// The app talks to the API gateway (NGINX, port 80), which routes /api/<service> to each service.
//
// On a phone plugged in over USB, `adb reverse tcp:80 tcp:80` makes the phone's localhost:80 the
// gateway on the development machine, so no IP address is needed (Metro uses the same trick on 8081).
// On the Android emulator without adb reverse, use http://10.0.2.2 instead.
const GATEWAY_URL = 'http://localhost';

export const API_ROUTES = {
  AUTH: `${GATEWAY_URL}/api/auth`,
  ORDERS: `${GATEWAY_URL}/api/orders`,
  PLANNING: `${GATEWAY_URL}/api/planning`,
  EXECUTION: `${GATEWAY_URL}/api/execution`,
} as const;

export const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout: number = 8000
): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};
