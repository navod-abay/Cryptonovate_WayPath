import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres_password@postgres:5432/delivery_db'),
  JWT_ACCESS_SECRET: z.string().default('waypoint_default_jwt_access_secret_key_2026'),
  JWT_REFRESH_SECRET: z.string().default('waypoint_default_jwt_refresh_secret_key_2026'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables configuration:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
