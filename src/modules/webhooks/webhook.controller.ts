import { Request, Response, NextFunction } from 'express';
import { processProviderWebhook } from './webhook.service';

export async function providerWebhookController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await processProviderWebhook(req.body);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

