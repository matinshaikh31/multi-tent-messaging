# Multi-Tenant Messaging Platform REST API

A production-grade REST API built in **Node.js**, **TypeScript**, **Express**, and **PostgreSQL** (with **Drizzle ORM**). It provides multi-tenant message ingestion, stable cursor-based conversation history, and an idempotent provider webhook engine resilient against network retries and out-of-order delivery updates.

---

## 📑 Table of Contents
1. [Architecture & Design Overview](#1-architecture--design-overview)
2. [Prerequisites & Quick Start](#2-prerequisites--quick-start)
3. [Database Schema & Migrations](#3-database-schema--migrations)
4. [API Reference & Examples](#4-api-reference--examples)
5. [Core Engineering Guarantees](#5-core-engineering-guarantees)
   - [Idempotency & Concurrency Safety](#51-idempotency--concurrency-safety)
   - [Monotonic Status State Machine & Out-of-Order Handling](#52-monotonic-status-state-machine--out-of-order-handling)
   - [Tenant Isolation](#53-tenant-isolation)
   - [Cursor-Based Pagination](#54-cursor-based-pagination)
6. [Security & Observability](#6-security--observability)
7. [Automated Testing](#7-automated-testing)
8. [Design Notes & High-Throughput Production Evolution](#8-design-notes--high-throughput-production-evolution)

---

## 1. Architecture & Design Overview

The application follows a **Layered MVC + Service + Repository** architecture with strict separation of concerns:

```
HTTP Request 
     │
     ▼
[Security Middleware] (Helmet, CORS, Body Limits)
     │
     ▼
[Tenant Middleware] (Extracts & validates `x-tenant-id`)
     │
     ▼
[Validation Middleware] (Zod schema checking for body, params, query)
     │
     ▼
[Controller] (Translates HTTP request <-> Domain parameters)
     │
     ▼
[Service Layer] (Business logic, status state transitions, cursor generation)
     │
     ▼
[Repository Layer] (Drizzle ORM typed queries & PostgreSQL transactions)
     │
     ▼
[PostgreSQL Database] (Acid persistence, unique constraints, composite indexes)
```

### Module Layout
```
src/
├── app.ts                         # Express application setup & middleware assembly
├── server.ts                      # Server bootstrap, DB migration check, graceful shutdown
├── config/
│   ├── env.ts                     # Zod-validated environment configuration
│   └── database.ts                # pg.Pool and Drizzle client instance
├── db/
│   └── schema/
│       ├── tenants.schema.ts      # Tenants table definition
│       ├── messages.schema.ts     # Messages table with (tenant_id, conversation_id, created_at, id) index
│       └── webhook-events.schema.ts # Webhook events audit log with UNIQUE(event_id)
├── middleware/
│   ├── tenant.middleware.ts       # Enforces presence of x-tenant-id header
│   ├── validate.middleware.ts     # Generic Zod request validator
│   ├── error.middleware.ts        # Centralized operational error & exception handler
│   └── not-found.middleware.ts    # RFC-compliant 404 handler
├── modules/
│   ├── messages/                  # Message creation and direct retrieval
│   ├── conversations/             # Conversation history with cursor pagination
│   └── webhooks/                  # Webhook processing, idempotency & state machine
└── utils/
    ├── app-error.ts               # Custom operational error classes
    ├── cursor.ts                  # Base64 cursor encode/decode utility
    └── logger.ts                  # Pino structured JSON logger with PII redaction
```

---

## 2. Prerequisites & Quick Start

### Prerequisites
- **Node.js**: v18.0.0 or later (Tested on Node.js v25)
- **Docker Desktop**: Running locally (to run PostgreSQL)

### 1-Command Setup

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL container in background
docker compose up -d

# 3. Generate and run database migrations
npm run db:generate
npm run db:migrate

# 4. Start development server
npm run dev
```

The server will log:
```
✅ Database connected
✅ Database migrations applied
🚀 Server listening on port 3000 [development]
```

### Useful Commands
| Command | Description |
|---|---|
| `npm run dev` | Runs the server with live reloading via `tsx` |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled production code |
| `npm run test` | Runs the full Vitest automated test suite |
| `npm run typecheck` | Checks TypeScript types without emitting code |
| `npm run db:generate` | Inspects schemas and generates migration SQL |
| `npm run db:migrate` | Applies pending migrations to PostgreSQL |

---

## 3. Database Schema & Migrations

All schema changes are tracked in versioned migration files in `drizzle/migrations/`.

```
                    ┌─────────────────────────┐
                    │         tenants         │
                    ├─────────────────────────┤
                    │ id (PK)                 │
                    │ name                    │
                    │ created_at              │
                    └───────────┬─────────────┘
                                │ 1
                                │
                                │ *
                    ┌───────────▼─────────────┐
                    │        messages         │
                    ├─────────────────────────┤
                    │ id (PK)                 │
                    │ tenant_id (FK)          │
                    │ conversation_id         │
                    │ to                      │
                    │ text                    │
                    │ status                  │
                    │ created_at              │
                    │ sent_at                 │
                    │ delivered_at            │
                    │ read_at                 │
                    │ failed_at               │
                    └───────────┬─────────────┘
                                │ 1
                                │
                                │ *
                    ┌───────────▼─────────────┐
                    │     webhook_events      │
                    ├─────────────────────────┤
                    │ id (PK)                 │
                    │ event_id (UNIQUE)       │
                    │ message_id (FK)         │
                    │ status                  │
                    │ occurred_at             │
                    │ received_at             │
                    │ created_at              │
                    │ raw_payload             │
                    └─────────────────────────┘
```

### Indexes & Performance Optimizations
1. **Composite Pagination Index**:
   `CREATE INDEX messages_tenant_conv_idx ON messages (tenant_id, conversation_id, created_at, id);`
   - Allows PostgreSQL to satisfy cursor pagination queries using an Index Scan without expensive table sorts.
2. **Idempotency Guard**:
   `CREATE UNIQUE INDEX webhook_events_event_id_idx ON webhook_events (event_id);`
   - Enforces uniqueness at the storage engine level against concurrent duplicate delivery attempts.

---

## 4. API Reference & Examples

### Base URL: `http://localhost:3000`

### 4.1 Health Check
**`GET /health`**
- Verifies server health and database connectivity via `SELECT 1`.
```bash
curl http://localhost:3000/health
```
```json
{
  "status": "ok"
}
```

---

### 4.2 Create a Message
**`POST /api/v1/messages`**
- **Headers**:
  - `Content-Type: application/json`
  - `x-tenant-id: tenant-a`
- **Request Body**:
```json
{
  "tenantId": "tenant-a",
  "conversationId": "conv-100",
  "to": "+919876543210",
  "text": "Your order #4592 has shipped!"
}
```
- **Response (`201 Created`)**:
```json
{
  "data": {
    "messageId": "msg-8f7d82b1-d3a9-4091-bf96-12c8a29a0081",
    "tenantId": "tenant-a",
    "conversationId": "conv-100",
    "to": "+919876543210",
    "text": "Your order #4592 has shipped!",
    "status": "QUEUED",
    "createdAt": "2026-11-13T16:15:00.000Z"
  }
}
```

---

### 4.3 Get Message Details
**`GET /api/v1/messages/:messageId`**
- **Headers**:
  - `x-tenant-id: tenant-a`
- **Response (`200 OK`)**:
```json
{
  "data": {
    "messageId": "msg-8f7d82b1-d3a9-4091-bf96-12c8a29a0081",
    "conversationId": "conv-100",
    "to": "+919876543210",
    "text": "Your order #4592 has shipped!",
    "status": "DELIVERED",
    "createdAt": "2026-11-13T16:15:00.000Z",
    "sentAt": "2026-11-13T16:16:00.000Z",
    "deliveredAt": "2026-11-13T16:17:00.000Z",
    "readAt": null,
    "failedAt": null
  }
}
```
*Note: If `tenant-b` attempts to access this message, the API returns `404 Not Found` (never leaking existence across tenant boundaries).*

---

### 4.4 List Conversation Messages (Cursor Pagination)
**`GET /api/v1/conversations/:conversationId/messages?limit=20&cursor=...`**
- **Headers**:
  - `x-tenant-id: tenant-a`
- **Query Parameters**:
  - `limit` *(optional, integer, default: 20, max: 100)*
  - `cursor` *(optional, base64url-encoded string)*
- **Response (`200 OK`)**:
```json
{
  "data": [
    {
      "messageId": "msg-8f7d82b1-d3a9-4091-bf96-12c8a29a0081",
      "conversationId": "conv-100",
      "to": "+919876543210",
      "text": "Your order #4592 has shipped!",
      "status": "DELIVERED",
      "createdAt": "2026-11-13T16:15:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTExLTEzVDE2OjE1OjAwLjAwMFoiLCJpZCI6Im1zZy04ZjdkODJiMSJ9"
  }
}
```

---

### 4.5 Receive Provider Webhook (Idempotent)
**`POST /api/v1/webhooks/provider`**
- **Headers**:
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "eventId": "evt-001",
  "messageId": "msg-8f7d82b1-d3a9-4091-bf96-12c8a29a0081",
  "status": "DELIVERED",
  "occurredAt": "2026-11-13T16:17:00.000Z"
}
```
- **Response (`200 OK` - First Ingestion)**:
```json
{
  "data": {
    "eventId": "evt-001",
    "messageId": "msg-8f7d82b1-d3a9-4091-bf96-12c8a29a0081",
    "duplicate": false,
    "messageStatus": "DELIVERED"
  }
}
```
- **Response (`200 OK` - Duplicate Retry of Same `eventId`)**:
```json
{
  "data": {
    "eventId": "evt-001",
    "messageId": "msg-8f7d82b1-d3a9-4091-bf96-12c8a29a0081",
    "duplicate": true,
    "messageStatus": "DELIVERED"
  }
}
```

---

### 4.6 Standardized Error Response Format
All errors return consistent, descriptive JSON:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "occurredAt: occurredAt must be an ISO 8601 datetime string"
  }
}
```

---

## 5. Core Engineering Guarantees

### 5.1 Idempotency & Concurrency Safety
External webhook providers often employ retry logic with exponential backoff on timeout. If an API endpoint is not strictly idempotent, retried webhooks can cause double processing, corrupted audit logs, or conflicting state updates.

**Our Multi-Layered Idempotency Guard**:
1. **Application Layer**: `SELECT 1 FROM webhook_events WHERE event_id = $1` inside an ACID transaction (`db.transaction`). If found, the request immediately short-circuits with `duplicate: true`.
2. **Database Engine Layer**: A `UNIQUE INDEX` on `webhook_events(event_id)`. If two identical requests hit the server concurrently in different threads/nodes, the second will trip PostgreSQL error code `23505` (`unique_violation`). The transaction safely rolls back, preventing split-brain states.

### 5.2 Monotonic Status State Machine & Out-of-Order Handling
Due to distributed networking, packet routing, and retry delays, delivery updates frequently arrive **out of chronological order** (e.g., a provider sends `DELIVERED`, and seconds later a delayed `SENT` packet arrives).

We enforce a **strictly monotonic state progression**:
```
QUEUED (0) ──> SENT (1) ──> DELIVERED (2) ──> READ (3)
    │              │
    └──> FAILED ◄──┘
```

#### Transition Rules:
| Current Message Status | Incoming Webhook Status | Action Taken | Resulting Status |
|---|---|---|---|
| `QUEUED` | `SENT` | Forward update | `SENT` |
| `QUEUED` | `DELIVERED` | Forward update (accommodates dropped/delayed `SENT`) | `DELIVERED` |
| `SENT` | `DELIVERED` | Forward update | `DELIVERED` |
| `DELIVERED` | `READ` | Forward update | `READ` |
| `QUEUED` or `SENT` | `FAILED` | Terminal failure transition | `FAILED` |
| `READ` (terminal) | `SENT` or `DELIVERED` | **Stale event**: Logged in `webhook_events`, but status not changed | `READ` |
| `DELIVERED` | `SENT` | **Stale event**: Logged in `webhook_events`, but status not changed | `DELIVERED` |
| `FAILED` (terminal) | Any status | **Ignored**: Terminal state preserved | `FAILED` |

### 5.3 Tenant Isolation
- **Authentication Contract**: Per assignment specifications, the `x-tenant-id` header represents the authenticated tenant identity.
- **Header vs. Body Enforcement**: On `POST /messages`, the middleware verifies that the payload's `tenantId` strictly matches the `x-tenant-id` header.
- **Query Scoping**: Every database query on `messages` enforces `WHERE tenant_id = $tenantId`. A `conversationId` or `messageId` alone is **never** sufficient to access a resource.
- **Zero Leakage**: Looking up a message owned by another tenant returns `404 Not Found` (rather than `403 Forbidden`) so callers cannot probe or enumerate valid message IDs belonging to competitors.

### 5.4 Cursor-Based Pagination
Traditional `OFFSET` pagination suffers from:
1. **Result Drifting**: When new messages arrive while a user is paginating, rows shift, causing duplicate or missed items on subsequent pages.
2. **Performance Degradation**: `OFFSET 50000` forces the database to read and discard 50,000 rows.

**Our Cursor Implementation**:
- The cursor is an opaque base64url string encoding `{ createdAt: ISOString, id: string }`.
- Ordering is deterministic: `ORDER BY created_at ASC, id ASC`.
- The database query uses millisecond truncation to maintain exact parity between PostgreSQL's microsecond storage and JavaScript's ISO millisecond serialization:
  ```sql
  WHERE tenant_id = $1 AND conversation_id = $2
    AND (
      date_trunc('milliseconds', created_at) > $cursorDate::timestamptz
      OR (
        date_trunc('milliseconds', created_at) = $cursorDate::timestamptz 
        AND id > $cursorId
      )
    )
  ORDER BY created_at ASC, id ASC
  LIMIT $limit + 1
  ```
- By querying `LIMIT + 1`, the API determines whether a next page exists without issuing an expensive `COUNT(*)` query.

---

## 6. Security & Observability

- **No SQL Injection**: Parameterized SQL execution via Drizzle ORM query builders (zero string interpolation).
- **Hardened HTTP Headers**: Integrated `helmet` protecting against XSS, clickjacking, and MIME-sniffing.
- **PII & Data Redaction**: The **Pino** structured JSON logger automatically redacts sensitive attributes (`text`, `to`, `authorization`, `password`) from log outputs.
- **Safe Health Endpoint**: `GET /health` runs a lightweight connection verification query (`SELECT 1`) without exposing database credentials, connection strings, or system paths in failure responses.

---

## 7. Automated Testing

The project includes unit tests and end-to-end integration tests using **Vitest** and **Supertest** running against a live PostgreSQL instance.

```bash
npm run test
```

### Test Coverage Highlights:
- **Unit Tests**:
  - `state-machine.test.ts`: Validates all valid forward status transitions, backward regressions (e.g. `READ` -> `SENT`), and terminal state protections.
  - `cursor.test.ts`: Tests round-trip base64 encoding/decoding and rejection of malformed or tampered cursor payloads.
- **Integration Tests** (`api.test.ts`):
  1. Message creation with valid payloads returns `201` and `QUEUED`.
  2. Missing fields return `400 VALIDATION_ERROR`.
  3. Header/body tenant mismatch returns `400 TENANT_MISMATCH`.
  4. Missing `x-tenant-id` header returns `400 TENANT_MISSING`.
  5. Cross-tenant retrieval returns `404` (strict tenant isolation).
  6. Multi-page cursor pagination returns stable chronological order across pages.
  7. Forward webhook transitions (`QUEUED` -> `SENT` -> `DELIVERED` -> `READ`).
  8. Idempotent webhook processing: repeated `eventId` returns `duplicate: true` and only 1 event record in database.
  9. Out-of-order webhook delivery: late `SENT` event arriving after `READ` does not regress status.
  10. Webhook with unknown `messageId` returns `404 NOT_FOUND`.
  11. Webhook payload validation: missing `eventId`, bad status enum, or malformed ISO dates return `400`.
  12. Health check returns `200 ok`.

---

## 8. Design Notes & High-Throughput Production Evolution

### 8.1 Current Architecture Trade-offs
- **Synchronous Webhook Ingestion**: Webhooks are validated and committed inside an HTTP request transaction. This provides immediate consistency and simplicity, but binds client latency to database write times. If database contention peaks, provider requests could time out.
- **Header-Based Tenant Identity**: Using `x-tenant-id` simulates multi-tenancy locally. In production, tenant identity should be extracted from an authenticated cryptographic JWT or verified API key hash.

### 8.2 Scaling to 100,000+ Requests/Second

```
                        ┌────────────────────────┐
                        │   API Gateway / LB     │
                        └───────────┬────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
          ┌──────────────────┐            ┌──────────────────┐
          │  API Ingestion   │            │  API Ingestion   │
          │   (Stateless)    │            │   (Stateless)    │
          └─────────┬────────┘            └─────────┬────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                         ┌────────────────────┐
                         │   Apache Kafka /   │  Partitioned by
                         │     RabbitMQ       │  conversation_id / message_id
                         └──────────┬─────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
          ┌──────────────────┐            ┌──────────────────┐
          │   Worker Node    │            │   Worker Node    │
          │ (Consumer Group) │            │ (Consumer Group) │
          └─────────┬────────┘            └─────────┬────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
         ┌─────────────────────┐        ┌──────────────────────┐
         │ Redis Distributed   │        │ Distributed Database │
         │   Lock & Dedupe     │        │  (CockroachDB /      │
         │   (SETNX / Bloom)   │        │   Postgres Citus)    │
         └─────────────────────┘        └──────────────────────┘
```

1. **Decouple Ingestion from Processing (Event Broker)**:
   - Webhook endpoints should validate payload schemas, write raw events directly to **Apache Kafka** or **AWS SQS / RabbitMQ**, and immediately return `202 Accepted`.
   - Partitioning Kafka topics by `message_id` guarantees that all events for a given message are processed in sequential order by the same worker instance, eliminating race conditions.
2. **Distributed Deduplication (Redis / Bloom Filter)**:
   - Check `eventId` in a high-speed in-memory **Redis** cluster using `SET key value NX EX 86400` or a Scalable Bloom Filter before hitting relational disk storage.
3. **Optimistic Concurrency & Version Columns**:
   - Add a `version INT` column to the `messages` table:
     ```sql
     UPDATE messages 
     SET status = $newStatus, version = version + 1 
     WHERE id = $id AND version = $expectedVersion;
     ```
   - If two workers attempt simultaneous status updates, only one increments the version; the other retries without blocking table locks.
4. **Distributed Storage & Database Partitioning**:
   - Shard the `messages` table horizontally by `tenant_id` using **PostgreSQL Citus** or **CockroachDB**, ensuring single-tenant data locality while scaling write throughput linearly across clusters.

# multi-tent-messaging
