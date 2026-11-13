import { v4 as uuidv4 } from 'uuid';
import { insertMessage, findMessageByIdAndTenant } from './message.repository';
import { AppErrors } from '../../utils/app-error';
import type { CreateMessageInput } from './message.validation';
import type { Message } from '../../db/schema/messages.schema';

// Service layer: business rules for creating and reading messages.
// Controllers call services; services call repositories.

// createMessage is called by POST /api/v1/messages.
// Business rules enforced here:
//   1. The tenantId in the request body MUST match the x-tenant-id header.
//      This prevents a tenant from creating messages under another tenant's account.
//   2. A unique message ID is generated server-side (clients cannot supply their own).
//   3. Status always starts at QUEUED — only provider webhooks can advance it.
export async function createMessage(
  headerTenantId: string,
  input: CreateMessageInput
): Promise<Message> {
  if (input.tenantId !== headerTenantId) {
    throw AppErrors.tenantMismatch();
  }

  const messageId = `msg-${uuidv4()}`;

  return insertMessage({
    id: messageId,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.to,
    text: input.text,
    status: 'QUEUED',
  });
}

// getMessageByIdForTenant retrieves a message enforcing tenant isolation.
// If the message belongs to a different tenant, we return 404 (not 403),
// to avoid leaking that the message ID exists at all.
export async function getMessageByIdForTenant(
  messageId: string,
  tenantId: string
): Promise<Message> {
  const message = await findMessageByIdAndTenant(messageId, tenantId);
  if (!message) {
    throw AppErrors.notFound('Message');
  }
  return message;
}

