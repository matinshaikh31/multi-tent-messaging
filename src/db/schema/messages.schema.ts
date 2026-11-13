import { pgTable, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

// Valid message statuses. Using a union type enforces this at compile time.
export const MESSAGE_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

// The messages table stores every message created via POST /api/v1/messages.
// Key design decisions:
//   - tenant_id scopes ALL queries: a message is only accessible to its owner tenant.
//   - conversation_id groups messages in a thread.
//   - Nullable *_at timestamps are set only when the status reaches that level.
//   - Composite index on (tenant_id, conversation_id, created_at, id) enables
//     efficient cursor-based pagination filtered by tenant + conversation.
export const messages = pgTable(
  'messages',
  {
    id: varchar('id', { length: 255 }).primaryKey(),              // e.g. "msg-<uuid>"
    tenantId: varchar('tenant_id', { length: 255 }).notNull(),
    conversationId: varchar('conversation_id', { length: 255 }).notNull(),
    to: varchar('to', { length: 255 }).notNull(),                 // recipient phone / handle
    text: text('text').notNull(),                                  // message body
    status: varchar('status', { length: 50 }).notNull().default('QUEUED'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),          // set when status -> SENT
    deliveredAt: timestamp('delivered_at', { withTimezone: true }), // set when status -> DELIVERED
    readAt: timestamp('read_at', { withTimezone: true }),          // set when status -> READ
    failedAt: timestamp('failed_at', { withTimezone: true }),      // set when status -> FAILED
  },
  (table) => ({
    // Composite index used by the GET /conversations/:id/messages pagination query.
    // Covers: WHERE tenant_id = ? AND conversation_id = ? ORDER BY created_at, id
    tenantConvIdx: index('messages_tenant_conv_idx').on(
      table.tenantId,
      table.conversationId,
      table.createdAt,
      table.id
    ),
  })
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

