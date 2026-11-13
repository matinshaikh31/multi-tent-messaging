import { Request, Response, NextFunction } from 'express';
import { AppErrors } from '../utils/app-error';

// Extend Express's Request type to include tenantId.
// This tells TypeScript that after this middleware runs,
// req.tenantId will always be a string — no need to check for undefined downstream.
declare global {
  namespace Express {
    interface Request {
      tenantId: string;
    }
  }
}

// Tenant middleware reads the x-tenant-id request header and attaches it to req.tenantId.
// Every route that handles tenant-scoped data (messages, conversations) must use this middleware.
//
// IMPORTANT: In production, the tenant identity MUST come from a verified JWT or API key.
// Using an HTTP header directly is only acceptable for this assignment simulation,
// because any caller can forge a header value. Document this explicitly.
// TODO(security): Replace x-tenant-id header with verified API key / JWT tenant claim.
export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.headers['x-tenant-id'];

  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    next(AppErrors.tenantMissing());
    return;
  }

  req.tenantId = tenantId.trim();
  next();
}

