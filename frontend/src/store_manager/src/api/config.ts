/**
 * API settings, read from Vite env vars (see .env.example).
 *
 *   VITE_USE_MOCK_API   "true" (default) = dummy data in src/mock, no network.
 *                       "false"          = real HTTP calls to the gateway.
 *   VITE_API_BASE_URL   Gateway base URL. Default "/api" (same origin, NGINX gateway).
 */
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false';

/** Dedicated auth mock toggle: if set, overrides USE_MOCK for auth calls */
export const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH !== undefined
  ? import.meta.env.VITE_USE_MOCK_AUTH === 'true'
  : USE_MOCK;

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
export const AUTH_API_BASE_URL = (import.meta.env.VITE_AUTH_API_BASE_URL ?? API_BASE_URL).replace(/\/$/, '');

/** Request timeout (ms). */
export const REQUEST_TIMEOUT_MS = 10_000;

/** How often Recent Updates and today's deliveries are refreshed (ms). */
export const POLL_INTERVAL_MS = 60_000;

/** How often the confirmation-code dialog asks whether the driver has entered the code (ms). */
export const HANDOVER_POLL_MS = 3_000;
