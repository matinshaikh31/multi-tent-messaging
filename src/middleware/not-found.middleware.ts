import { Request, Response } from 'express';

// Catches any request that didn't match a registered route.
export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}

