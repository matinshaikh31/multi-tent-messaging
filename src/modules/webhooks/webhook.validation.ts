import { z } from 'zod';
import { MESSAGE_STATUSES } from '../../db/schema/messages.schema';

// Webhook payload validation schema.
// The provider can only send SENT, DELIVERED, READ, or FAILED — not QUEUED
// (messages start QUEUED when created by us, not from provider callbacks).
const PROVIDER_STATUSES = ['SENT', 'DELIVERED', 'READ', 'FAILED'] as const;

export const webhookPayloadSchema = z.object({
  eventId: z.string().min(1).max(255),
  messageId: z.string().min(1).max(255),
  status: z.enum(PROVIDER_STATUSES),
  occurredAt: z.string().datetime({ message: 'occurredAt must be an ISO 8601 datetime string' }),
});

export type WebhookPayloadInput = z.infer<typeof webhookPayloadSchema>;

