import { z } from 'zod';

// Zod schema for POST /api/v1/messages request body.
// Each field has explicit constraints matching the assignment spec.
export const createMessageSchema = z.object({
  tenantId: z.string().min(1).max(255),
  conversationId: z.string().min(1).max(255),
  to: z.string().min(1).max(255),
  text: z.string().min(1).max(4096),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

