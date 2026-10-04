const GATEWAY_URL = 'http://192.168.1.X'; // Windows machine's LAN IPv4; the NGINX gateway listens on port 80

export const API_ROUTES = {
  AUTH: `${GATEWAY_URL}/api/auth`,
  ORDERS: `${GATEWAY_URL}/api/orders`,
  SYNC: `${GATEWAY_URL}/api/execution`,
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