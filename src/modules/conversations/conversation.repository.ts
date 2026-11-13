import { db } from '../../config/database';
import { messages } from '../../db/schema/messages.schema';
import { and, eq, or, gt, asc, sql } from 'drizzle-orm';
import type { Message } from '../../db/schema/messages.schema';
import type { CursorPayload } from '../../utils/cursor';

// Fetches a page of messages for a given tenant + conversation,
// sorted oldest-first by (created_at, id).
//
// WHY limit + 1?
// We fetch one extra row beyond the requested limit.
// If we get (limit + 1) rows back, we know there IS a next page,
// and we encode the last of the (limit) rows as the nextCursor.
// If we get <= limit rows, we're on the last page (nextCursor = null).
export async function findConversationMessages(
  tenantId: string,
  conversationId: string,
  limit: number,
  cursor: CursorPayload | null
): Promise<Message[]> {
  const baseCondition = and(
    eq(messages.tenantId, tenantId),
    eq(messages.conversationId, conversationId)
  );

  // Cursor condition:
  // WHY date_trunc('milliseconds', created_at)?
  // JavaScript's Date object and Date.toISOString() only have MILLISECOND precision (.123Z),
  // whereas PostgreSQL's default timestamptz stores MICROSECONDS (.123456Z).
  // Without truncating the DB column to milliseconds during comparison,
  // the row that generated the cursor (e.g. .123456Z) would still be strictly greater
  // than its truncated cursor (.123000Z), causing the last item of page N
  // to be re-fetched as the first item of page N+1!
  //
  // Truncating both sides to milliseconds ensures:
  // 1. Same-millisecond rows trigger the ID tie-break (id > cursor.id).
  // 2. The cursor row itself is guaranteed to be excluded.
  let whereClause;

  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    const cursorCondition = or(
      sql`date_trunc('milliseconds', ${messages.createdAt}) > ${cursorDate}::timestamptz`,
      and(
        sql`date_trunc('milliseconds', ${messages.createdAt}) = ${cursorDate}::timestamptz`,
        gt(messages.id, cursor.id)
      )
    );
    whereClause = and(baseCondition, cursorCondition);
  } else {
    whereClause = baseCondition;
  }

  return db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(limit + 1); // Fetch one extra to detect if more pages exist
}

