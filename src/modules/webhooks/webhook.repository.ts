import { db } from '../../config/database';
import { messages } from '../../db/schema/messages.schema';
import { webhookEvents } from '../../db/schema/webhook-events.schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { MessageStatus, Message } from '../../db/schema/messages.schema';
import type { WebhookEvent } from '../../db/schema/webhook-events.schema';

export interface WebhookTransactionResult {
  isDuplicate: boolean;
  message: Message;
  applied: boolean; // was the status actually advanced?
}

// processWebhookTransaction runs all webhook processing inside a single
// PostgreSQL transaction. This is critical for correctness:
//
// A database transaction is an "all or nothing" unit:
//   - If any step fails (e.g. constraint violation), ALL changes roll back.
//   - The event insertion and status update either BOTH commit or BOTH roll back.
//   - This prevents "split-brain" state where event is recorded but status update failed (or vice versa).
//
// Concurrency safety:
//   The UNIQUE constraint on webhook_events.event_id handles concurrent duplicate requests.
//   If two requests arrive simultaneously with the same eventId, only one INSERT succeeds.
//   The other gets a PostgreSQL error code 23505 (unique_violation), caught by error middleware.
export async function processWebhookTransaction(
  eventId: string,
  messageId: string,
  newStatus: MessageStatus,
  occurredAt: Date,
  rawPayload: string
): Promise<WebhookTransactionResult> {
  return db.transaction(async (tx) => {
    // Step 1: Check if this eventId was already processed (idempotency check).
    const [existingEvent] = await tx
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, eventId))
      .limit(1);

    if (existingEvent) {
      // Duplicate: fetch current message state and return without modifying anything.
      const [currentMessage] = await tx
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);
      return {
        isDuplicate: true,
        message: currentMessage,
        applied: false,
      };
    }

    // Step 2: Find the target message.
    const [currentMessage] = await tx
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!currentMessage) {
      // Throw to abort the transaction; caught by error middleware -> 404
      throw { isNotFound: true };
    }

    // Step 3: Insert the webhook event into the audit log (always, even if stale).
    await tx.insert(webhookEvents).values({
      id: uuidv4(),
      eventId,
      messageId,
      status: newStatus,
      occurredAt,
      rawPayload,
    });

    // Step 4: Determine if the status should be advanced.
    // (canTransition logic is imported in webhook.service.ts and passed in as a flag)
    return {
      isDuplicate: false,
      message: currentMessage,
      applied: false, // will be set by the service after updating
    };
  });
}

// updateMessageStatus updates the status and the relevant timestamp column.
// Called only when canTransition() returns true.
export async function updateMessageStatus(
  messageId: string,
  newStatus: MessageStatus,
  timestampField: 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt',
  occurredAt: Date
): Promise<Message> {
  const [updated] = await db
    .update(messages)
    .set({
      status: newStatus,
      [timestampField]: occurredAt,
    })
    .where(eq(messages.id, messageId))
    .returning();
  return updated;
}

