import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { initDb } from './db/init';
import { pool } from './db/pool';
import notificationRoutes from './routes/notifications.routes';
import { startConsumer, stopConsumer } from './services/consumer';
import { openStreamCount } from './services/hub';

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get(['/health', '/api/notifications/health'], (_req: Request, res: Response) => {
  res.json({ service: 'notification-service', status: 'healthy', streams: openStreamCount(), timestamp: new Date().toISOString() });
});

app.use('/api/notifications', notificationRoutes); // direct calls to this service
app.use('/', notificationRoutes); // through the gateway (prefix already stripped)

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[notification-service] Unhandled Error:', err);
  res.status(err.status || 500).json({ success: false, error: err.message || 'Internal Server Error' });
});

async function startServer() {
  await initDb();
  void startConsumer();
  const server = app.listen(config.port, () => {
    console.log(`[notification-service] Listening on port ${config.port}`);
  });

  const shutdown = async () => {
    await stopConsumer();
    server.close();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

startServer().catch((err) => {
  console.error('[notification-service] Failed to start:', err);
  process.exit(1);
});
