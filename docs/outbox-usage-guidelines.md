# Outbox Usage Guidelines

> **Onboarding:** This document covers **step 7 (Outbox)** of the [Onboarding Flow](../README.md#onboarding-flow).
> **See also:** [AI Agent Guidelines](ai-agent-guidelines.md) · [Event & Messaging Convention](event-messaging-convention.md)

For detailed configuration, see [Outbox Configuration](outbox-configuration.md).
For transactional outbox usage, see [Transactional Outbox Usage Guide](outbox-transactional-usage.md).

---

## Table of Contents

- [Do You Need the Outbox?](#do-you-need-the-outbox)
- [Decision Tree: Backend Selection](#decision-tree-backend-selection)
- [Decision Tree: saveToOutbox vs saveInTransaction](#decision-tree-savetooutbox-vs-saveintransaction)
- [Decision Tree: Normal vs Request-Reply Outbox API](#decision-tree-normal-vs-request-reply-outbox-api)
- [SQLite vs PostgreSQL: Trade-Offs](#sqlite-vs-postgresql-trade-offs)
- [Retry & DLQ Behavior](#retry--dlq-behavior)
- [Common Patterns](#common-patterns)
- [Related Documentation](#related-documentation)

---

## Do You Need the Outbox?

| Scenario | Need Outbox? | Reason |
|----------|-------------|--------|
| Service writes to DB, then publishes event | Yes | Guarantees event delivery even if NATS is temporarily down |
| Simple fire-and-forget event | Optional | `ProducerService.publish()` works, but outbox adds durability |
| Sync request-reply (`request()`) | No | NATS handles reply internally; outbox not needed for the request |
| Async request-reply needing guaranteed delivery | Yes | Use `sendAsyncRequestThroughOutbox` |
| Service restarts frequently | Yes | Outbox ensures events are published after recovery |

---

## Decision Tree: Backend Selection

```
1. Does the service already use PostgreSQL with TypeORM?
   ├─ Yes → Use PostgreSQL backend (shares existing DB, no extra file)
   └─ No  → 2. Does the service have access to persistent storage (Docker volume)?
              ├─ Yes → Use SQLite backend (lightweight, self-contained)
              └─ No  → Use ProducerService.publish() directly (no outbox durability)
```

For configuration details, see:
- [SQLite Configuration](outbox-configuration.md#sqlite-configuration)
- [PostgreSQL Configuration](outbox-configuration.md#postgresql-configuration)

---

## Decision Tree: saveToOutbox vs saveInTransaction

```
1. Is the event published as part of a database transaction?
   ├─ Yes → 2. Are you using PostgreSQL + TypeORM?
   │          ├─ Yes → Use saveInTransaction (atomicity guaranteed)
   │          └─ No (SQLite) → Use saveToOutbox (simpler; no transactional atomicity needed)
   └─ No → Use saveToOutbox (fire-and-forget event persistence)
```

| Aspect | `saveToOutbox` | `saveInTransaction` |
|--------|---------------|---------------------|
| Transaction scope | Independent INSERT | INSERT within caller's transaction |
| Atomicity guarantee | Event persisted regardless of business outcome | Event rolled back with business data on failure |
| Backend support | PostgreSQL and SQLite | PostgreSQL (TypeORM QueryRunner); SQLite ignores context |
| When to use | Fire-and-forget; simple event publishing | Business write + event must be atomic |
| API | `saveToOutbox(event, subject)` | `saveInTransaction({ event, subject, transactionContext })` |

For full code examples, see [Transactional Outbox Usage Guide](outbox-transactional-usage.md).

---

## Decision Tree: Normal vs Request-Reply Outbox API

```
1. Is the event part of a request-reply flow?
   ├─ Yes → 2. Do you have a pre-built EventEnvelope?
   │          ├─ Yes → Use sendRequestThroughOutbox (low-level API)
   │          └─ No  → Use sendAsyncRequestThroughOutbox (high-level API, enforces replyTo at compile time)
   └─ No → Use saveToOutbox (standard fire-and-forget)
```

| API | Purpose | Returns | replyTo Validation |
|-----|---------|---------|-------------------|
| `saveToOutbox` | Standard event persistence | `void` | None (fire-and-forget) |
| `sendRequestThroughOutbox` | Async request-reply (low-level) | `void` | Runtime (`ensureReplyToPresent()`) |
| `sendAsyncRequestThroughOutbox` | Async request-reply (high-level) | `{ correlationId }` | Compile-time (`AsyncRequestEventContext` type) |

**Never use `saveToOutbox` for request-reply events** — it lacks `replyTo` validation and the method name doesn't communicate the request-reply intent.

---

## SQLite vs PostgreSQL: Trade-Offs

| Aspect | SQLite | PostgreSQL |
|--------|--------|-----------|
| Setup complexity | Minimal (single file) | Requires separate database |
| Infrastructure dependency | None | Requires PostgreSQL instance |
| Transactional atomicity | No (single-connection) | Yes (via TypeORM QueryRunner) |
| Docker requirement | Persistent volume needed | Shares existing DB |
| Best for | Lightweight microservices without DB | `ms-db-gateway` and services with PostgreSQL |
| Scalability | Single-writer | Full concurrent access |

---

## Retry & DLQ Behavior

- Background processor polls pending entries at `processorIntervalMs` (default: 5000ms)
- On publish success: entry marked `sent`
- On publish failure: attempt counter incremented, exponential backoff applied
- After `maxRetries` (default: 3): routed to DLQ subject (`dlq.{original_subject}`)
- DLQ payload includes: original envelope, `last_error`, `attempts`, `failed_at`
- Request-reply events preserve `reply_to` through DLQ routing

Configure via `OutboxServiceOptions`:

| Option | Default | Description |
|--------|---------|-------------|
| `processorIntervalMs` | 5000 | Background processor poll interval (ms) |
| `maxRetries` | 3 | Max retries before DLQ routing |
| `retryBackoffBaseMs` | 1000 | Base delay for exponential backoff |

---

## Common Patterns

### Pattern 1: Simple Fire-and-Forget with Outbox (SQLite)

```typescript
const event = createEvent(data, context);
await this.outboxService.saveToOutbox(event, subject);
```

### Pattern 2: Transactional Publish with Business Write (PostgreSQL)

```typescript
await this.outboxService.saveInTransaction({ event, subject, transactionContext });
// Commit the transaction — both business write and outbox INSERT are atomic
```

### Pattern 3: Async Request-Reply Through Outbox (High-Level)

```typescript
const result = await this.outboxService.sendAsyncRequestThroughOutbox({
  subject: requestSubject,
  payload: { clientId },
  context: { /* AsyncRequestEventContext with replyTo */ },
});
// Track result.correlationId for async response handling
```

### Pattern 4: Sync Request-Reply (No Outbox Needed)

```typescript
const response = await this.requestReply.request(subject, payload, { context, timeoutMs: 5000 });
// Side effects from the response can use the outbox:
await this.outboxService.saveToOutbox(sideEffectEvent, sideEffectSubject);
```

---

## Related Documentation

- [Outbox Configuration](outbox-configuration.md) — SQLite/PostgreSQL setup, service options, migration guide
- [Transactional Outbox Usage Guide](outbox-transactional-usage.md) — TypeORM examples, TransactionContext, error handling
- [Request-Reply Patterns](request-reply-patterns.md) — Sync and async patterns
- [Request-Reply Guidelines](request-reply-guidelines.md) — Decision tree for sync vs async and outbox usage
- [Event & Messaging Convention](event-messaging-convention.md) — Full convention specification
