import type { MessageStatus } from '../../db/schema/messages.schema';

// STATUS_RANK assigns a numeric rank to each status.
// Higher rank = more advanced in the delivery lifecycle.
// This lets us compare statuses numerically instead of with complex if/else chains.
//
// TERMINAL statuses (READ, FAILED) have no valid outgoing transitions.
// Once a message is READ or FAILED, no later webhook event changes it.
//
// Status progression (forward only):
//   QUEUED (0) -> SENT (1) -> DELIVERED (2) -> READ (3)
//                                           FAILED (-1) can be reached from QUEUED or SENT
const STATUS_RANK: Record<MessageStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: -1, // Terminal failure — no further transitions allowed
};

const TERMINAL_STATUSES: Set<MessageStatus> = new Set(['READ', 'FAILED']);

// canTransition returns true if moving from currentStatus to newStatus is a valid
// forward transition. Called by the webhook service before updating the message.
//
// RULES:
//   1. Terminal states (READ, FAILED) are never advanced further.
//   2. newStatus must have a STRICTLY HIGHER rank than currentStatus.
//      (Equal rank = same status = idempotent, treated as stale.)
//   3. FAILED is a special terminal: it can be reached from QUEUED or SENT
//      (rank -1 < 0 and 1, but we special-case FAILED as a valid forward move).
export function canTransition(
  currentStatus: MessageStatus,
  newStatus: MessageStatus
): boolean {
  // Terminal states do not transition further
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return false;
  }

  // FAILED is a valid forward transition from QUEUED or SENT
  if (newStatus === 'FAILED') {
    return currentStatus === 'QUEUED' || currentStatus === 'SENT';
  }

  // For all other statuses, require strictly increasing rank
  return STATUS_RANK[newStatus] > STATUS_RANK[currentStatus];
}

// getTimestampField returns the column name to update when a status is reached.
// e.g. when status becomes "SENT", we set messages.sent_at = occurredAt.
export function getTimestampField(
  status: MessageStatus
): 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt' | null {
  const map: Partial<Record<MessageStatus, 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt'>> = {
    SENT: 'sentAt',
    DELIVERED: 'deliveredAt',
    READ: 'readAt',
    FAILED: 'failedAt',
  };
  return map[status] ?? null;
}

