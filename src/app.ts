import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiRouter } from './routes';
import { notFoundMiddleware } from './middleware/not-found.middleware';
import { errorMiddleware } from './middleware/error.middleware';

// app.ts configures the Express application:
//   - Registers global middleware (applied to every request)
//   - Mounts route handlers
//   - Registers 404 and error middleware LAST
//
// IMPORTANT: app.ts does NOT call app.listen().
// That is done in server.ts. This separation allows tests to import
// 'app' and pass it directly to Supertest without binding to a network port.

const app = express();

// Security headers (helmet sets X-Content-Type-Options, X-Frame-Options, CSP, etc.)
app.use(helmet());

// CORS: only allow our own origin in production
// TODO(security): Configure specific origins for production deployment
app.use(cors());

// Parse JSON request bodies; reject requests with bodies > 1MB to prevent DoS
app.use(express.json({ limit: '1mb' }));

// Mount all API routes under /api/v1, plus /health
app.use('/api/v1', apiRouter);
app.get('/health', async (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 404 handler (must come after all routes)
app.use(notFoundMiddleware);

// Central error handler (must be last, with 4 params)
app.use(errorMiddleware);

export { app };

