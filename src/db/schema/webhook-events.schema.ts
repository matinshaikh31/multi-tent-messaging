import { pgTable, varchar, timestamp, text, uniqueIndex } from 'drizzle-orm/pg-core';

// webhook_events is an audit log of every provider callback we receive.
// Key design decisions:
//   - event_id has a UNIQUE constraint: this is the database-level idempotency guard.
//     Even if two concurrent requests arrive with the same eventId, only one INSERT
//     will succeed; the other will get a unique-constraint violation which we catch
//     and treat as a duplicate.
//   - occurred_at = timestamp the provider says the event happened (from request body).
//   - received_at = timestamp our API server received the webhook.
//   - raw_payload stores the original JSON for debugging/auditing.
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: varchar('id', { length: 255 }).primaryKey(),              // internal UUID
    eventId: varchar('event_id', { length: 255 }).notNull(),      // provider's unique event ID
    messageId: varchar('message_id', { length: 255 }).notNull(),  // FK to messages.id
    status: varchar('status', { length: 50 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rawPayload: text('raw_payload'),                              // original JSON string
  },
  (table) => ({
    // UNIQUE constraint on event_id is the final concurrency-safe idempotency guard.
    // Application-level "check then insert" is a race condition; this unique index
    // makes the database the arbiter — only one insert wins.
    eventIdIdx: uniqueIndex('webhook_events_event_id_idx').on(table.eventId),
  })
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

