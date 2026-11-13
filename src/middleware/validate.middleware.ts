import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/app-error';

// validate() is a middleware factory.
// You call it with a Zod schema and which part of the request to validate:
//   - 'body' for POST/PUT request body (req.body)
//   - 'query' for query string params (req.query)
//   - 'params' for URL path params (req.params)
//
// If Zod finds any errors, it calls next() with a 400 AppError containing
// the first validation message. Business logic in the controller never runs.
// If valid, the parsed (and type-coerced) data replaces the original on req.
export function validate(
  schema: ZodSchema,
  target: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const firstError = (result.error as ZodError).errors[0];
      const message = `${firstError.path.join('.')}: ${firstError.message}`;
      next(new AppError(400, 'VALIDATION_ERROR', message));
      return;
    }
    // Replace raw request data with Zod-parsed (cleaned, type-coerced) values
    req[target] = result.data;
    next();
  };
}

