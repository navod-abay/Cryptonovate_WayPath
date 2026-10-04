import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { pool } from './db/pool';
import { initDatabaseAndSeed } from './db/seed';
import authRoutes from './routes/auth.routes';

const app = express();

// Global Middleware
app.use(cors());
app.use(express.json());

// Mounting Auth Routes (Handles both direct mounts & gateway prefix stripping)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/', authRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    },
  });
});

let server: any;

async function bootstrap() {
  try {
    console.log('🔄 Initializing Auth-RBAC database connection and seeding...');
    await initDatabaseAndSeed();

    server = app.listen(env.PORT, () => {
      console.log(`🚀 Waypoint Auth-RBAC Microservice listening on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (error) {
    console.error('❌ Failed to start Auth-RBAC service:', error);
    process.exit(1);
  }
}

// Graceful Shutdown Logic
async function gracefulShutdown(signal: string) {
  console.log(`\n⚠️ Received ${signal}. Starting graceful shutdown...`);
  if (server) {
    server.close(() => {
      console.log('🔒 Express HTTP server closed.');
    });
  }

  try {
    await pool.end();
    console.log('🗄️ PostgreSQL pool closed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during PostgreSQL pool shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

bootstrap();
