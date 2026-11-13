import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from './env';
import * as schema from '../db/schema';

// pg.Pool manages a pool of reusable database connections.
// Instead of opening a new connection per request (expensive),
// it reuses existing idle connections from the pool.
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,          // max simultaneous connections
  idleTimeoutMillis: 30000,
});

// drizzle() wraps the pool and provides a type-safe query builder
// that knows our schema (tables, columns, relations).
export const db = drizzle(pool, { schema });

// runMigrations connects once and applies any pending migration files
// in drizzle/migrations/ before the HTTP server starts accepting requests.
export async function connectDatabase(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
}

export { pool };

