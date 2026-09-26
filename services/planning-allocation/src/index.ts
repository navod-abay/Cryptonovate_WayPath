import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 5003;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'planning-allocation', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'planning-allocation', message: 'Route Planning & Resource Allocation Engine Service Operational' });
});

app.post('/optimize', (req, res) => {
  res.json({
    status: 'OPTIMIZED',
    routesGenerated: 3,
    estimatedFuelSavedPercent: 14.5
  });
});

app.listen(port, () => {
  console.log(`[planning-allocation] Microservice listening on port ${port}`);
});
