import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import executionRoutes from './routes/execution.routes';
import { initDb } from './db/init';
import { startAlertRelay } from './services/alertOutbox';

dotenv.config();

const app = express();
const port = process.env.PORT || 5005;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check Endpoints
app.get('/health', (req: Request, res: Response) => {
  res.json({ service: 'execution-sync', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req: Request, res: Response) => {
  res.json({ service: 'execution-sync', message: 'Real-time Execution & GPS Telemetry Sync Service Operational' });
});

// Mount Routes
app.use('/', executionRoutes);

// Global Error Handler Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[execution-sync] Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// Start DB & Express Server
async function startServer() {
  await initDb();
  startAlertRelay();
  app.listen(port, () => {
    console.log(`[execution-sync] Microservice operational and listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('[execution-sync] Failed to start server:', err);
});
