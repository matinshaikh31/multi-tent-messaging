import { app } from './app';
import { env } from './config/env';
import { connectDatabase } from './config/database';
import { pool } from './config/database';
import { logger } from './utils/logger';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import path from 'path';

// server.ts is the entry point. It:
//   1. Connects to PostgreSQL.
//   2. Runs pending migrations automatically (so a fresh DB is always up-to-date).
//   3. Starts the HTTP listener.
//   4. Handles graceful shutdown on SIGTERM/SIGINT (Ctrl+C).

async function start() {
  // 1. Verify DB connection
  await connectDatabase();

  // 2. Auto-run migrations
  try {
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: path.join(__dirname, '..', 'drizzle', 'migrations'),
    });
    logger.info('✅ Database migrations applied');
  } catch (err) {
    logger.error({ err }, '❌ Migration failed');
    process.exit(1);
  }

  // 3. Start listening
  const PORT = parseInt(env.PORT, 10);
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server listening on port ${PORT} [${env.NODE_ENV}]`);
  });

  // 4. Graceful shutdown: finish in-flight requests, then close DB connections
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      logger.info('Database pool closed. Goodbye.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

