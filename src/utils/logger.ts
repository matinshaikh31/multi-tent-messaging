import pino from 'pino';
import { env } from '../config/env';

// Pino is a fast structured JSON logger.
// The redact option automatically replaces the value of matching paths with "[Redacted]"
// in log output — so sensitive data like message text, phone numbers, and tokens
// never appear in log files even if accidentally passed to logger.info().
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-tenant-id"]',   // tenant header value
      'body.text',                     // message body text
      'body.to',                       // recipient phone number
      'body.password',
      '*.text',
      '*.to',
    ],
    censor: '[Redacted]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

