import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3006;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'analytics-prediction', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'analytics-prediction', message: 'Delivery Analytics & Predictive ETA Service Operational' });
});

app.get('/kpi', (req, res) => {
  res.json({
    onTimeDeliveryRate: 98.4,
    avgUnloadTimeMinutes: 14.2,
    predictedDelays: 2
  });
});

app.listen(port, () => {
  console.log(`[analytics-prediction] Microservice listening on port ${port}`);
});
