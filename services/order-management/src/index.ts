import express from 'express';
import cors from 'cors';
import type { Server } from 'node:http';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { assertSchema, SchemaAssertionError } from './db/assertSchema.js';
import { seedData } from './db/seed.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { testClock } from './middleware/testClock.js';
import ordersRouter from './routes/orders.routes.js';
import { startCutoffTimer, stopCutoffTimer } from './services/cutoffJob.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

// Global Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
// After body parsing so the frozen clock survives into async handlers.
app.use(testClock);

// Mount order matters: the '/' mount's auth guard would otherwise intercept /api/orders/health.
app.use('/api/orders', ordersRouter); // direct: curl localhost:3002/api/orders/...
app.use('/', ordersRouter); // through the gateway (prefix already stripped)

app.use(notFoundHandler);
app.use(errorHandler);

let server: Server | undefined;

async function bootstrap() {
  try {
    console.log('🔄 Connecting Order Management to PostgreSQL...');
    await pool.query('SELECT 1');

    await assertSchema();
    await seedData({ demoOrders: env.SEED_DEMO_DATA });

    server = app.listen(env.PORT, () => {
      console.log(`🚀 Waypoint Order Management Microservice listening on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    startCutoffTimer();
  } catch (error) {
    if (error instanceof SchemaAssertionError) {
      console.error(error.message);
    } else {
      console.error('❌ Failed to start Order Management service:', error);
    }
    await pool.end().catch(() => undefined);
    process.exit(1);
  }
}

// Graceful Shutdown Logic
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n⚠️ Received ${signal}. Starting graceful shutdown...`);
  stopCutoffTimer();

  const forceExit = setTimeout(() => {
    console.error('❌ Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      console.log('🔒 Express HTTP server closed.');
    }
    await pool.end();
    console.log('🗄️ PostgreSQL pool closed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

bootstrap();
