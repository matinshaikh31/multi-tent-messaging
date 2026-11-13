import { Router } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createMessageSchema } from './message.validation';
import { createMessageController, getMessageController } from './message.controller';

// Router defines the URL paths and HTTP methods for the messages module.
// Middleware is attached in order — tenant check runs before validation,
// which runs before the controller.
const router = Router();

// POST /api/v1/messages — create a new message
router.post(
  '/',
  tenantMiddleware,
  validate(createMessageSchema, 'body'),
  createMessageController
);

// GET /api/v1/messages/:messageId — get message details
router.get('/:messageId', tenantMiddleware, getMessageController);

export { router as messageRouter };

