// Cursor-based pagination helper.
//
// WHY cursor pagination instead of OFFSET?
// OFFSET-based pagination (page 1, 2, 3...) breaks when new rows are inserted
// between page fetches — items can be duplicated or skipped.
//
// Cursor pagination uses the position of the LAST item on the current page
// to know exactly where the next page starts. It is stable even with concurrent inserts.
//
// Our cursor encodes TWO fields: { createdAt, id }
// - createdAt is the primary sort key (oldest to newest)
// - id is the tie-breaker for messages with identical createdAt timestamps
// Both values are base64-encoded together as a JSON string.

export interface CursorPayload {
  createdAt: string; // ISO timestamp string
  id: string;        // message ID
}

// Encode a cursor: takes the last item on a page and returns an opaque base64 string.
// The caller (GET /conversations endpoint) includes this as "nextCursor" in the response.
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// Decode a cursor: validates and parses the base64 string back into { createdAt, id }.
// Returns null if the cursor is missing, malformed, or tampered with.
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed === 'object' &&
      typeof parsed.createdAt === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

