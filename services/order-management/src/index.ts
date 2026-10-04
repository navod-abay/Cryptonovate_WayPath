import express from 'express';
import cors from 'cors';
import type { Server } from 'node:http';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { assertSchema, SchemaAssertionError } from './db/assertSchema.js';
import { reportDemoSeed, seedData, seedDemoOrders } from './db/seed.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { testClock } from './middleware/testClock.js';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec } from './docs/openapi.js';
import ordersRouter from './routes/orders.routes.js';
import { startCutoffTimer, stopCutoffTimer } from './services/cutoffJob.js';
import { startReferenceDataRefresh, stopReferenceDataRefresh } from './services/referenceData.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

// Global Middleware
// Browser origins come from configuration; with none configured any origin is accepted (dev default).
app.use(cors(env.CORS_ALLOWED_ORIGINS.length > 0 ? { origin: env.CORS_ALLOWED_ORIGINS } : undefined));
app.use(express.json({ limit: '1mb' }));
// After body parsing so the frozen clock survives into async handlers.
app.use(testClock);

const openApiSpec = buildOpenApiSpec();
// Registered before the routers so the '/' mount's auth guard does not intercept them.
for (const base of ['/api/orders', '']) {
  app.get(`${base}/openapi.json`, (_req, res) => res.json(openApiSpec));
  app.use(`${base}/docs`, swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Order Management API' }));
}

// Mount order matters: the '/' mount's auth guard would otherwise intercept /api/orders/health.
app.use('/api/orders', ordersRouter); // direct calls to this service
app.use('/', ordersRouter); // through the gateway (prefix already stripped)

app.use(notFoundHandler);
app.use(errorHandler);

let server: Server | undefined;

async function bootstrap() {
  try {
    console.log('🔄 Connecting Order Management to PostgreSQL...');
    await pool.query('SELECT 1');

    await assertSchema();
    const demoSeedPending = await seedData({ demoOrders: env.SEED_DEMO_DATA });

    server = app.listen(env.PORT, () => {
      console.log(`🚀 Waypoint Order Management Microservice listening on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    startCutoffTimer();
    startReferenceDataRefresh();
    if (demoSeedPending) retryDemoSeed();
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

// The dataset seed needs the outlets copied from Fleet & Directory's table. If they were not
// there at boot, keep trying in the background.
const DEMO_SEED_RETRY_MS = 15_000;
let demoSeedTimer: NodeJS.Timeout | undefined;
function retryDemoSeed() {
  demoSeedTimer = setInterval(() => {
    seedDemoOrders()
      .then((outcome) => {
        if (outcome.status !== 'waiting') {
          reportDemoSeed(outcome);
          clearInterval(demoSeedTimer);
        }
      })
      .catch((err) => console.error('❌ Demo seed retry failed:', err));
  }, DEMO_SEED_RETRY_MS);
  demoSeedTimer.unref();
}

// Graceful Shutdown Logic
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n⚠️ Received ${signal}. Starting graceful shutdown...`);
  stopCutoffTimer();
  stopReferenceDataRefresh();
  if (demoSeedTimer) clearInterval(demoSeedTimer);

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
