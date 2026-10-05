// The app talks to the API gateway (NGINX, port 80), which routes /api/<service> to each service.
// Which gateway is set per build in ./gateway.ts.
import { GATEWAY_URL } from './gateway';

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
