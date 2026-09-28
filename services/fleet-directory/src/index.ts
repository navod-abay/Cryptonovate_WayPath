import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'fleet-directory', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'fleet-directory', message: 'Fleet Directory & Vehicle Registry Service Operational' });
});

app.get('/vehicles', (req, res) => {
  res.json({
    vehicles: [
      { id: 'v_1', licensePlate: 'TRK-9921', type: 'Refrigerated Van', status: 'AVAILABLE' },
      { id: 'v_2', licensePlate: 'TRK-8812', type: 'EV Cargo Truck', status: 'IN_TRANSIT' }
    ]
  });
});

app.listen(port, () => {
  console.log(`[fleet-directory] Microservice listening on port ${port}`);
});
