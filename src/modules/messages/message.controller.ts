import { Request, Response, NextFunction } from 'express';
import { createMessage, getMessageByIdForTenant } from './message.service';

// Controllers are "thin" — they only handle HTTP concerns:
//   1. Read values from the request (body, params, headers).
//   2. Call the service with clean inputs.
//   3. Format and send the HTTP response.
// No business logic, no SQL, no if/else status transitions here.

export async function createMessageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const message = await createMessage(req.tenantId, req.body);
    res.status(201).json({
      data: {
        messageId: message.id,
        tenantId: message.tenantId,
        conversationId: message.conversationId,
        to: message.to,
        text: message.text,
        status: message.status,
        createdAt: message.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMessageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const message = await getMessageByIdForTenant(req.params.messageId, req.tenantId);
    res.status(200).json({
      data: {
        messageId: message.id,
        conversationId: message.conversationId,
        to: message.to,
        text: message.text,
        status: message.status,
        createdAt: message.createdAt,
        sentAt: message.sentAt,
        deliveredAt: message.deliveredAt,
        readAt: message.readAt,
        failedAt: message.failedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

