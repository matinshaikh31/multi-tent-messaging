import { Router, Request, Response } from 'express';
import { messageRouter } from '../modules/messages/message.routes';
import { conversationRouter } from '../modules/conversations/conversation.routes';
import { webhookRouter } from '../modules/webhooks/webhook.routes';
import { pool } from '../config/database';

const router = Router();

// Mount feature routers under /api/v1
router.use('/messages', messageRouter);
router.use('/conversations', conversationRouter);
router.use('/webhooks', webhookRouter);

// GET /health — returns service status and DB liveness
router.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch {
    // Safe failure: return unhealthy status WITHOUT exposing DB connection details
    res.status(503).json({ status: 'unhealthy' });
  }
});

export { router as apiRouter };

