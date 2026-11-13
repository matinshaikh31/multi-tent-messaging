import { Request, Response, NextFunction } from 'express';
import { listConversationMessages } from './conversation.service';

export async function listConversationMessagesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Parse and clamp limit from query string (default: 20, max: 100)
    const rawLimit = parseInt(String(req.query.limit ?? '20'), 10);
    const limit = isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);
    const cursor = req.query.cursor as string | undefined;

    const result = await listConversationMessages(
      req.tenantId,
      req.params.conversationId,
      limit,
      cursor
    );

    res.status(200).json({
      data: result.data.map((m) => ({
        messageId: m.id,
        conversationId: m.conversationId,
        to: m.to,
        text: m.text,
        status: m.status,
        createdAt: m.createdAt,
      })),
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

