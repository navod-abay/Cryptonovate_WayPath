import express, { Request, Response } from 'express';
import cors from 'cors';
import { fleetRoutes } from './routes/fleet.routes';
import { pool } from './db/pool';

const app = express();
const port = process.env.PORT || 5004;

// Middleware
app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    service: 'fleet-director',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Root Info Endpoint
app.get('/', (req: Request, res: Response, next) => {
  // If requesting root path directly, return service info
  if (req.path === '/' || req.path === '') {
    res.json({
      service: 'fleet-directory',
      message: 'Fleet Directory & Vehicle Registry Service Operational',
    });
    return;
  }
  next();
});

// Mount Routes (root and gateway prefix)
app.use('/api/fleet', fleetRoutes);
app.use('/', fleetRoutes);

// Global Error Handler
app.use((err: unknown, req: Request, res: Response, _next: express.NextFunction) => {
  console.error('[fleet-directory] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    },
  });
});

const server = app.listen(port, () => {
  console.log(`[fleet-directory] Microservice listening on port ${port}`);
});

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n[fleet-directory] Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('[fleet-directory] HTTP server closed.');
  });

  try {
    await pool.end();
    console.log('[fleet-directory] PostgreSQL pool closed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('[fleet-directory] Error closing PostgreSQL pool:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
