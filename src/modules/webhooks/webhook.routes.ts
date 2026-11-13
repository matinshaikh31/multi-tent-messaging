import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { webhookPayloadSchema } from './webhook.validation';
import { providerWebhookController } from './webhook.controller';

const router = Router();

// POST /api/v1/webhooks/provider — receives provider delivery status callbacks.
// No tenant middleware: provider webhooks are not tenant-authenticated user requests.
// TODO(security): In production, verify HMAC signature from provider to authenticate the caller.
router.post('/provider', validate(webhookPayloadSchema, 'body'), providerWebhookController);

export { router as webhookRouter };

