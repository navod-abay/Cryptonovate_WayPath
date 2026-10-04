import pg from 'pg';
import { env } from '../config/env.js';

const { Pool, types } = pg;

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Dates shifted by the host TZ.
types.setTypeParser(types.builtins.DATE, (val: string) => val);
// NUMERIC -> JS number. Order rollups stay well inside double precision.
types.setTypeParser(types.builtins.NUMERIC, (val: string) => Number(val));
// BIGINT (COUNT(*), nextval) -> number.
types.setTypeParser(types.builtins.INT8, (val: string) => Number(val));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database client error:', err);
});

export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('❌ ROLLBACK failed:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
