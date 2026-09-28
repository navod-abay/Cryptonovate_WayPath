import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'execution-sync', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'execution-sync', message: 'Real-time Execution & GPS Telemetry Sync Service Operational' });
});

app.post('/telemetry', (req, res) => {
  const { driverId, lat, lng } = req.body;
  res.json({ success: true, driverId, lat, lng, syncedAt: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`[execution-sync] Microservice listening on port ${port}`);
});
