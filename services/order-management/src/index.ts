import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'order-management', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'order-management', message: 'Order Lifecycle & Management Service Operational' });
});

app.get('/orders', (req, res) => {
  res.json({
    orders: [
      { id: 'ord_101', customer: 'Acme Corp', itemsCount: 12, status: 'PENDING' },
      { id: 'ord_102', customer: 'Globex Inc', itemsCount: 4, status: 'ALLOCATED' }
    ]
  });
});

app.listen(port, () => {
  console.log(`[order-management] Microservice listening on port ${port}`);
});
