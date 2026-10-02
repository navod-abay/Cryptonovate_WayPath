import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const intFromString = (fallback: string, min: number, max: number) =>
  z
    .string()
    .default(fallback)
    .transform((val) => Number(val))
    .pipe(z.number().int().min(min).max(max));

const boolFromString = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback)
    .transform((val) => val === 'true' || val === '1');

const csvList = z
  .string()
  .default('')
  .transform((val) =>
    val
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

const required = (name: string) => z.string({ required_error: `${name} is required` }).trim().min(1, `${name} is required`);

/**
 * Addresses, ports and secrets have NO defaults: they differ per environment, and a baked-in
 * value would silently point a hosted deployment at the wrong place. They must be supplied by
 * the environment (docker-compose, the host, or a local .env — see .env.example).
 * Only behavioural settings (cutoff hour, limits, intervals) carry defaults.
 */
const envSchema = z.object({
  PORT: required('PORT')
    .transform((val) => Number(val))
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: required('DATABASE_URL'),
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  // Comma-separated origins allowed to call this API from a browser. Empty = any origin.
  CORS_ALLOWED_ORIGINS: csvList,

  ORDER_CUTOFF_HOUR: intFromString('16', 0, 23),
  BUSINESS_TZ: z
    .string()
    .default('Asia/Colombo')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'BUSINESS_TZ must be a valid IANA time zone'),
  NON_OPERATING_WEEKDAYS: csvList.pipe(
    z.array(z.coerce.number().int().min(0).max(6)).refine((days) => days.length < 7, 'At least one weekday must be operating'),
  ),
  HOLIDAY_DATES: csvList.pipe(z.array(z.string().regex(ISO_DATE, 'HOLIDAY_DATES entries must be YYYY-MM-DD'))),
  MAX_DEFERRALS: intFromString('3', 1, 50),
  AT_RISK_DAYS: intFromString('3', 1, 365),

  // Fleet & Directory's API: the source of vehicle data (reefer capacity, demo seed).
  FLEET_SERVICE_URL: required('FLEET_SERVICE_URL').pipe(z.string().url('FLEET_SERVICE_URL must be a URL')),
  FLEET_TIMEOUT_MS: intFromString('3000', 100, 60_000),
  // Fleet may still be starting when this service boots; the demo seed waits this long for it.
  FLEET_BOOT_ATTEMPTS: intFromString('5', 1, 60),
  FLEET_RETRY_DELAY_MS: intFromString('2000', 0, 60_000),
  // How often outlets_ref is re-copied from Fleet's outlets table.
  OUTLET_REFRESH_INTERVAL_MS: intFromString('300000', 5000, 86_400_000),

  SEED_DEMO_DATA: boolFromString('true'),
  CUTOFF_JOB_INTERVAL_MS: intFromString('60000', 1000, 3_600_000),

  // Chilled goods must arrive before 08:00, so a reefer realistically runs one chilled trip a day.
  // Used by GET /summary (demand vs. refrigerated capacity); the vehicles come from Fleet's API.
  CHILLED_TRIPS_PER_DAY: intFromString('1', 1, 2),
  });

const _env = envSchema.safeParse({
  ...process.env,
  NON_OPERATING_WEEKDAYS: process.env.NON_OPERATING_WEEKDAYS ?? '0',
});

if (!_env.success) {
  const problems = _env.error.issues.map((i) => `   - ${i.path.join('.') || '(config)'}: ${i.message}`).join('\n');
  console.error(`❌ Invalid environment configuration:\n${problems}\n   See services/order-management/.env.example for every setting.`);
  process.exit(1);
}

export const env = _env.data;
export type Env = typeof env;
