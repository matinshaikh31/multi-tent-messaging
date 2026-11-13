import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

// Central error handler: Express calls this whenever next(error) is called anywhere in the app.
// It is registered LAST in app.ts (after all routes) with 4 parameters — Express identifies
// it as an error handler by the arity (err, req, res, next).
//
// Design principles:
// - If the error is an AppError (operational/expected), return its status code and message.
// - If the error is unexpected (a programming bug), log it and return a generic 500.
// - NEVER expose stack traces, SQL errors, or internal details to the client.
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError && err.isOperational) {
    // Expected error (validation failure, not found, etc.)
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Handle Postgres unique constraint violation (concurrent duplicate webhook)
  const pgError = err as { code?: string };
  if (pgError.code === '23505') {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Duplicate event detected',
      },
    });
    return;
  }

  // Unexpected programming error — log full details internally, return generic message
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled server error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

