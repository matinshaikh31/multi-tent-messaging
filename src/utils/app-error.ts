// AppError is a custom error class for expected/operational errors
// (like "message not found" or "validation failed").
// It carries an HTTP status code and a machine-readable error code,
// so the central error handler can format a clean JSON response.
//
// By contrast, programming bugs produce generic Error objects
// which the error handler maps to 500 Internal Server Error.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Pre-defined factory helpers for common error scenarios.
export const AppErrors = {
  notFound: (resource: string) =>
    new AppError(404, 'NOT_FOUND', `${resource} not found`),
  validationError: (message: string) =>
    new AppError(400, 'VALIDATION_ERROR', message),
  tenantMissing: () =>
    new AppError(400, 'TENANT_MISSING', 'x-tenant-id header is required'),
  tenantMismatch: () =>
    new AppError(400, 'TENANT_MISMATCH', 'Body tenantId must match x-tenant-id header'),
};

