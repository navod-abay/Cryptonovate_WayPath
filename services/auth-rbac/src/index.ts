import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'auth-rbac', status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: 'auth-rbac', message: 'Authentication & RBAC Microservice Operational' });
});

app.post('/login', (req, res) => {
  const { email, role } = req.body;
  res.json({
    success: true,
    token: 'mock_jwt_token_sample',
    user: { email, role: role || 'dispatcher' }
  });
});

app.listen(port, () => {
  console.log(`[auth-rbac] Microservice listening on port ${port}`);
});
