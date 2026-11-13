import { AppErrors } from '../../utils/app-error';
import { canTransition, getTimestampField } from './webhook.state-machine';
import { processWebhookTransaction, updateMessageStatus } from './webhook.repository';
import type { WebhookPayloadInput } from './webhook.validation';
import type { MessageStatus } from '../../db/schema/messages.schema';

export interface WebhookResult {
  eventId: string;
  messageId: string;
  duplicate: boolean;
  messageStatus: string;
}

// processProviderWebhook is the main business logic entry point for
// POST /api/v1/webhooks/provider.
//
// Flow:
//   1. Run everything inside a DB transaction (atomic insert + status update).
//   2. If eventId already exists -> return duplicate: true (idempotency).
//   3. If messageId not found -> throw 404.
//   4. Store event in webhook_events audit log regardless of transition validity.
//   5. If status transition is valid (forward) -> update messages.status + timestamp.
//   6. If status is stale/out-of-order -> keep current status (no regression).
export async function processProviderWebhook(input: WebhookPayloadInput): Promise<WebhookResult> {
  const newStatus = input.status as MessageStatus;
  const occurredAt = new Date(input.occurredAt);
  const rawPayload = JSON.stringify(input);

  // Run the transaction: idempotency check, message lookup, event insert
  let result;
  try {
    result = await processWebhookTransaction(
      input.eventId,
      input.messageId,
      newStatus,
      occurredAt,
      rawPayload
    );
  } catch (err: unknown) {
    const e = err as { isNotFound?: boolean };
    if (e.isNotFound) {
      throw AppErrors.notFound('Message');
    }
    throw err;
  }

  // Duplicate event: return current state without modifying anything
  if (result.isDuplicate) {
    return {
      eventId: input.eventId,
      messageId: input.messageId,
      duplicate: true,
      messageStatus: result.message.status,
    };
  }

  const currentStatus = result.message.status as MessageStatus;

  // Check if the status transition is valid (forward progression only)
  if (canTransition(currentStatus, newStatus)) {
    const timestampField = getTimestampField(newStatus);
    if (timestampField) {
      const updatedMessage = await updateMessageStatus(
        input.messageId,
        newStatus,
        timestampField,
        occurredAt
      );
      return {
        eventId: input.eventId,
        messageId: input.messageId,
        duplicate: false,
        messageStatus: updatedMessage.status,
      };
    }
  }

  // Out-of-order / stale event: event was stored in audit log, but status not regressed
  return {
    eventId: input.eventId,
    messageId: input.messageId,
    duplicate: false,
    messageStatus: currentStatus,
  };
}

