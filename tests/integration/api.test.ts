import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { app } from '../../src/app';
import { db } from '../../src/config/database';
import { messages } from '../../src/db/schema/messages.schema';
import { webhookEvents } from '../../src/db/schema/webhook-events.schema';

// Integration tests: Supertest sends real HTTP requests to our Express app.
// Tests run against a REAL PostgreSQL database (the same one configured in .env).
// Each test clears messages and webhook_events before running so tests are isolated.
//
// WHY use a real DB and not mocks?
// Mocking the DB would not catch SQL mistakes, constraint violations, or transaction bugs.
// A real DB integration test proves the full stack works end-to-end.

const request = supertest(app);

beforeEach(async () => {
  // Clean slate before each test — delete in reverse FK order
  await db.delete(webhookEvents);
  await db.delete(messages);
});

afterAll(async () => {
  await db.delete(webhookEvents);
  await db.delete(messages);
});

// ─── Helper ────────────────────────────────────────────────────────────────────
async function createMessage(tenantId = 'tenant-a', conversationId = 'conv-100') {
  return request
    .post('/api/v1/messages')
    .set('x-tenant-id', tenantId)
    .send({ tenantId, conversationId, to: '+919876543210', text: 'Hello' });
}

async function sendWebhook(eventId: string, messageId: string, status: string) {
  return request.post('/api/v1/webhooks/provider').send({
    eventId,
    messageId,
    status,
    occurredAt: new Date().toISOString(),
  });
}

// ─── Test 1: Message Creation ──────────────────────────────────────────────────
describe('POST /api/v1/messages', () => {
  it('creates a message with QUEUED status (201)', async () => {
    const res = await createMessage();
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('QUEUED');
    expect(res.body.data.messageId).toMatch(/^msg-/);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({ tenantId: 'tenant-a' }); // missing conversationId, to, text
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when body tenantId mismatches x-tenant-id header', async () => {
    const res = await request
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({ tenantId: 'tenant-b', conversationId: 'conv-1', to: '+1', text: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });

  it('returns 400 when x-tenant-id header is missing', async () => {
    const res = await request
      .post('/api/v1/messages')
      .send({ tenantId: 'tenant-a', conversationId: 'c', to: '+1', text: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TENANT_MISSING');
  });
});

// ─── Test 2 & 3: Message Retrieval + Tenant Isolation ─────────────────────────
describe('GET /api/v1/messages/:messageId', () => {
  it('retrieves a message for the correct tenant (200)', async () => {
    const create = await createMessage('tenant-a');
    const { messageId } = create.body.data;

    const res = await request
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-a');
    expect(res.status).toBe(200);
    expect(res.body.data.messageId).toBe(messageId);
  });

  it('returns 404 when tenant-b tries to access tenant-a message (isolation)', async () => {
    const create = await createMessage('tenant-a');
    const { messageId } = create.body.data;

    const res = await request
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-b'); // wrong tenant
    expect(res.status).toBe(404);
  });
});

// ─── Test 4: Pagination ────────────────────────────────────────────────────────
describe('GET /api/v1/conversations/:id/messages — pagination', () => {
  it('returns messages in chronological order with nextCursor', async () => {
    const convId = `conv-pagination-${Date.now()}`;

    // Small delays ensure each message gets a distinct created_at timestamp.
    // Without delays, all 3 messages may land in the same millisecond, making
    // the cursor's timestamp-based tie-breaking unreliable in tests.
    await createMessage('tenant-a', convId);
    await new Promise((r) => setTimeout(r, 15));
    await createMessage('tenant-a', convId);
    await new Promise((r) => setTimeout(r, 15));
    await createMessage('tenant-a', convId);

    const res = await request
      .get(`/api/v1/conversations/${convId}/messages?limit=2`)
      .set('x-tenant-id', 'tenant-a');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.nextCursor).not.toBeNull();

    // Fetch second page using the cursor from the first page
    const res2 = await request
      .get(`/api/v1/conversations/${convId}/messages?limit=2&cursor=${res.body.pagination.nextCursor}`)
      .set('x-tenant-id', 'tenant-a');
    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.pagination.nextCursor).toBeNull();
  });

  it('tenant-b cannot see tenant-a conversation messages', async () => {
    await createMessage('tenant-a', 'conv-secret');
    const res = await request
      .get('/api/v1/conversations/conv-secret/messages')
      .set('x-tenant-id', 'tenant-b');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0); // empty, not leaked
  });
});

// ─── Test 5: Webhook Status Update ────────────────────────────────────────────
describe('POST /api/v1/webhooks/provider — status transitions', () => {
  it('advances status from QUEUED to SENT (200)', async () => {
    const create = await createMessage();
    const { messageId } = create.body.data;

    const res = await sendWebhook('evt-001', messageId, 'SENT');
    expect(res.status).toBe(200);
    expect(res.body.data.messageStatus).toBe('SENT');
    expect(res.body.data.duplicate).toBe(false);
  });

  it('advances status SENT -> DELIVERED -> READ in sequence', async () => {
    const create = await createMessage();
    const { messageId } = create.body.data;

    await sendWebhook('evt-s1', messageId, 'SENT');
    await sendWebhook('evt-d1', messageId, 'DELIVERED');
    const res = await sendWebhook('evt-r1', messageId, 'READ');

    expect(res.body.data.messageStatus).toBe('READ');
  });
});

// ─── Test 6: Idempotency ───────────────────────────────────────────────────────
describe('Webhook idempotency', () => {
  it('returns duplicate:true and does not re-apply same eventId', async () => {
    const create = await createMessage();
    const { messageId } = create.body.data;

    // Send same event twice
    const res1 = await sendWebhook('evt-idem-001', messageId, 'SENT');
    const res2 = await sendWebhook('evt-idem-001', messageId, 'SENT');

    expect(res1.body.data.duplicate).toBe(false);
    expect(res2.body.data.duplicate).toBe(true);
    expect(res2.body.data.messageStatus).toBe('SENT'); // unchanged

    // Verify only 1 event record in DB
    const events = await db.select().from(webhookEvents);
    expect(events.filter(e => e.eventId === 'evt-idem-001')).toHaveLength(1);
  });
});

// ─── Test 7: Out-of-order handling ────────────────────────────────────────────
describe('Out-of-order webhook events', () => {
  it('does not regress status when a stale SENT arrives after READ', async () => {
    const create = await createMessage();
    const { messageId } = create.body.data;

    await sendWebhook('evt-o1', messageId, 'SENT');
    await sendWebhook('evt-o2', messageId, 'DELIVERED');
    await sendWebhook('evt-o3', messageId, 'READ');

    // Now a late SENT event arrives (different eventId, out-of-order)
    const lateRes = await sendWebhook('evt-o4-late', messageId, 'SENT');
    expect(lateRes.body.data.messageStatus).toBe('READ'); // must NOT regress
  });
});

// ─── Test 8: Unknown message ID ───────────────────────────────────────────────
describe('Webhook for unknown message', () => {
  it('returns 404 for a non-existent messageId', async () => {
    const res = await sendWebhook('evt-unknown', 'msg-does-not-exist', 'SENT');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ─── Test 9: Invalid payloads return 400 ──────────────────────────────────────
describe('Webhook payload validation', () => {
  it('returns 400 for missing eventId', async () => {
    const res = await request.post('/api/v1/webhooks/provider').send({
      messageId: 'msg-123',
      status: 'SENT',
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await request.post('/api/v1/webhooks/provider').send({
      eventId: 'evt-bad',
      messageId: 'msg-123',
      status: 'QUEUED', // QUEUED is not a valid provider-sent status
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid occurredAt format', async () => {
    const res = await request.post('/api/v1/webhooks/provider').send({
      eventId: 'evt-bad2',
      messageId: 'msg-123',
      status: 'SENT',
      occurredAt: 'not-a-date',
    });
    expect(res.status).toBe(400);
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

