const LOCAL_IP = '192.168.1.X'; // Replace with your Windows machine's local IPv4 address

export const API_ROUTES = {
  AUTH: `http://${LOCAL_IP}:5001/api/auth`,
  ORDERS: `http://${LOCAL_IP}:5002/api/orders`,
  SYNC: `http://${LOCAL_IP}:5005/api/execution`,
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