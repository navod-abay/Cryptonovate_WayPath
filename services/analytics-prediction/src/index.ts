import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { verifyToken, requireRole } from './middleware/authGuard';
import { demandForecast, dispatcherStatistics, isIsoDate } from './dispatcher';

const app = express();
const port = process.env.PORT || 5006;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'analytics-prediction', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'analytics-prediction', message: 'Delivery Analytics & Predictive ETA Service Operational' });
});

// Authenticated KPI metrics endpoint
app.get('/kpi', verifyToken(), requireRole('dispatcher', 'store_manager', 'system'), (req, res) => {
  res.json({
    success: true,
    data: {
      onTimeDeliveryRate: 98.4,
      avgUnloadTimeMinutes: 14.2,
      predictedDelays: 2
    }
  });
});

/** Rejects the request unless ?date is a valid YYYY-MM-DD. */
function requireDate(req: Request, res: Response, next: NextFunction): void {
  if (isIsoDate(req.query.date)) return next();
  res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request query parameters',
      details: [{ field: 'date', message: 'Must be a valid date in YYYY-MM-DD format' }],
    },
  });
}

// Dispatcher dashboard: deferrals and store-receipt shortfalls over the past week
app.get('/dispatcher/statistics', verifyToken(), requireRole('dispatcher'), requireDate, async (req, res, next) => {
  try {
    res.json({ success: true, data: await dispatcherStatistics(req.query.date as string) });
  } catch (err) {
    next(err);
  }
});

// Dispatcher dashboard demand chart (sample data until a model exists)
app.get('/forecast/demand', verifyToken(), requireRole('dispatcher'), requireDate, (req, res) => {
  res.json({ success: true, data: demandForecast(req.query.date as string) });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[analytics-prediction] request failed:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Analytics request failed' } });
});

app.listen(port, () => {
  console.log(`[analytics-prediction] Microservice listening on port ${port}`);
});
