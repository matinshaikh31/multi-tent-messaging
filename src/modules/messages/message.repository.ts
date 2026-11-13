import { db } from '../../config/database';
import { messages } from '../../db/schema/messages.schema';
import { eq, and } from 'drizzle-orm';
import type { NewMessage, Message } from '../../db/schema/messages.schema';

// Repository layer: ALL database queries for the messages table live here.
// No HTTP logic, no business rules — only SQL operations.
// Services call these functions and decide what to do with the results.

// Insert a new message row.
export async function insertMessage(data: NewMessage): Promise<Message> {
  const [row] = await db.insert(messages).values(data).returning();
  return row;
}

// Find a message by its ID AND tenant_id together.
// Combining both in the WHERE clause is the tenant isolation guarantee:
// even if someone guesses another tenant's messageId, they get null.
export async function findMessageByIdAndTenant(
  id: string,
  tenantId: string
): Promise<Message | null> {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

// Find a message by ID only (used by webhook handler which doesn't have a tenant header).
export async function findMessageById(id: string): Promise<Message | null> {
  const [row] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1);
  return row ?? null;
}

