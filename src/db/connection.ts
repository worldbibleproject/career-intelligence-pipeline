import pg from 'pg';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: config.pg.host,
      port: config.pg.port,
      database: config.pg.database,
      user: config.pg.user,
      password: config.pg.password,
      ssl: config.pg.sslmode === 'require' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: config.pg.connectTimeout * 1000,
      max: 20,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: false,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected pool error:', err);
    });

    pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    logger.info('Database connection pool initialized');
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    const result = await client.query('SELECT NOW() as now, version() as version');
    client.release();
    logger.info('Database connection test successful', {
      timestamp: result.rows[0].now,
      version: result.rows[0].version.split(' ')[1],
    });
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error);
    return false;
  }
}

export default { getPool, closePool, testConnection };
