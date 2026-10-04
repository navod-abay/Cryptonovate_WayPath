import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[notification-service] ${name} is required`);
    process.exit(1);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 5007),
  databaseUrl: required('DATABASE_URL'),
  // No fallback: a default secret would let anyone who has read the repo mint tokens.
  jwtSecret: required('JWT_ACCESS_SECRET'),
  natsUrl: process.env.NATS_URL || 'nats://nats:4222',
};
