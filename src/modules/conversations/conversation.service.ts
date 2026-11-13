import { findConversationMessages } from './conversation.repository';
import { decodeCursor, encodeCursor } from '../../utils/cursor';
import type { Message } from '../../db/schema/messages.schema';

export interface PaginatedMessages {
  data: Message[];
  pagination: {
    limit: number;
    nextCursor: string | null;
  };
}

// listConversationMessages is the service for GET /conversations/:id/messages.
// It handles all pagination logic so the controller stays thin.
export async function listConversationMessages(
  tenantId: string,
  conversationId: string,
  limit: number,
  cursorStr: string | undefined
): Promise<PaginatedMessages> {
  // Decode the cursor string into { createdAt, id } or null if no cursor (first page).
  const cursor = cursorStr ? decodeCursor(cursorStr) : null;

  // Fetch limit+1 rows (the extra row tells us if another page exists).
  const rows = await findConversationMessages(tenantId, conversationId, limit, cursor);

  const hasNextPage = rows.length > limit;
  // If there's a next page, remove the extra sentinel row from results.
  const data = hasNextPage ? rows.slice(0, limit) : rows;

  // Build the nextCursor from the last item in the current page.
  let nextCursor: string | null = null;
  if (hasNextPage && data.length > 0) {
    const lastItem = data[data.length - 1];
    nextCursor = encodeCursor({
      createdAt: lastItem.createdAt.toISOString(),
      id: lastItem.id,
    });
  }

  return {
    data,
    pagination: { limit, nextCursor },
  };
}

