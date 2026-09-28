import pg from 'pg';

const { Pool, types } = pg;

// Parse PostgreSQL NUMERIC (type OID 1700) as float
types.setTypeParser(1700, (val: string) => parseFloat(val));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err: Error) => {
  console.error('[fleet-directory] Unexpected database client error:', err);
});
