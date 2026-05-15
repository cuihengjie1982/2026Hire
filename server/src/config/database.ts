import pg from 'pg';
import {env} from './env.js';

// Supabase SSL: add ?sslmode=require to connection string
const connectionString = env.DATABASE_URL.includes('supabase')
  ? `${env.DATABASE_URL}${env.DATABASE_URL.includes('?') ? '&' : '?'}sslmode=require`
  : env.DATABASE_URL;

const pool = new pg.Pool({
  connectionString,
  // Supabase transaction pooler uses port 5432 (direct) or 6543 (pooled)
  // For transaction mode (pooled), prepared statements must be disabled
  ...(env.DATABASE_URL.includes('supabase') ? {preparedStatements: false} : {}),
});

export const query = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> => {
  const {rows} = await pool.query(sql, params);
  return rows as T[];
};

export const queryOne = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> => {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
};

export const getClient = () => pool.connect();

export const transaction = async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    console.log(`  Database connected: ${result.rows[0].now}`);
  } catch (e) {
    console.error('  Database connection failed:', (e as Error).message);
    throw e;
  }
};

export default pool;
