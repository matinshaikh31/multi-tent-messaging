import { Router } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware';
import { listConversationMessagesController } from './conversation.controller';

const router = Router();

// GET /api/v1/conversations/:conversationId/messages?limit=20&cursor=...
router.get('/:conversationId/messages', tenantMiddleware, listConversationMessagesController);

export { router as conversationRouter };

