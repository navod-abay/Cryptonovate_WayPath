import { Pool } from 'pg';

// Shared delivery database: analytics only reads tables owned by the other services.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
