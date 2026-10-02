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

const envSchema = z.object({
  PORT: intFromString('3002', 1, 65535),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres_password@postgres:5432/delivery_db'),
  JWT_ACCESS_SECRET: z.string().min(1).default('waypoint_default_jwt_access_secret_key_2026'),

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

  OUTLET_SOURCE: z.enum(['local', 'http']).default('local'),
  FLEET_SERVICE_URL: z.string().url().default('http://fleet-directory:3004'),

  SEED_DEMO_DATA: boolFromString('true'),
  CUTOFF_JOB_INTERVAL_MS: intFromString('60000', 1000, 3_600_000),

  // Chilled goods must arrive before 08:00, so a reefer realistically runs one chilled trip a day.
  // Used by GET /summary (demand vs. refrigerated capacity); vehicle data itself comes from Fleet.
  CHILLED_TRIPS_PER_DAY: intFromString('1', 1, 2),
});

const _env = envSchema.safeParse({
  ...process.env,
  NON_OPERATING_WEEKDAYS: process.env.NON_OPERATING_WEEKDAYS ?? '0',
});

if (!_env.success) {
  console.error('❌ Invalid environment variables configuration:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
export type Env = typeof env;
