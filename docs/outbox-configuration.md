# Outbox Configuration

## Overview

The Outbox pattern ensures transactional safety for event publishing. When a microservice performs a state change and needs to emit an event, the Outbox module persists the event to a local store first, then a background processor publishes it to NATS JetStream. This guarantees at-least-once delivery even if the publish step fails.

The `OutboxService` provides a unified interface regardless of the storage backend:

```typescript
async saveToOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void>
```

Two storage backends are supported:

- **SQLite** — file-based, self-contained, ideal for lightweight microservices
- **PostgreSQL** — shares the service's existing database, ideal for `ms-db-gateway`

## When to Use Each Backend

| Backend  | Use Case                              | Service Type                                      |
| -------- | ------------------------------------- | ------------------------------------------------- |
| Postgres | `ms-db-gateway`                       | Services with an existing PostgreSQL + TypeORM    |
| SQLite   | All other microservices               | Services without their own database infrastructure |

- **Postgres** shares the main application database — no extra file to manage, no Docker volume needed.
- **SQLite** uses a lightweight file-based database — self-contained but requires a persistent Docker volume.

## SQLite Configuration

### Via OutboxModule.forRoot

```typescript
import { OutboxModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    OutboxModule.forRoot({
      type: 'sqlite',
      sqlite: { dbPath: '/data/outbox.sqlite' },
      serviceOptions: {
        processorIntervalMs: 5000,
        maxRetries: 3,
        retryBackoffBaseMs: 1000,
      },
    }),
  ],
})
export class AppModule {}
```

### Via EventsToolkitModule.forRoot (Recommended)

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    EventsToolkitModule.forRoot({
      nats: { servers: ['nats://localhost:4222'] },
      outbox: {
        type: 'sqlite',
        sqlitePath: '/data/outbox.sqlite',
        serviceOptions: { maxRetries: 3 },
      },
    }),
  ],
})
export class AppModule {}
```

### Docker Volume (Required for SQLite)

When running in Docker, the SQLite file must be persisted across container restarts:

```yaml
volumes:
  - outbox-data:/data
```

Without a persistent volume, the SQLite file is lost on container restart, causing duplicate event delivery after recovery.

## PostgreSQL Configuration

### Via OutboxModule.forRoot

```typescript
import { OutboxModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    OutboxModule.forRoot({
      type: 'postgres',
      postgres: { entityManager: myTypeOrmEntityManager },
      serviceOptions: { maxRetries: 3 },
    }),
  ],
})
export class AppModule {}
```

### Via EventsToolkitModule.forRoot (Recommended)

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    EventsToolkitModule.forRoot({
      nats: { servers: ['nats://localhost:4222'] },
      outbox: {
        type: 'postgres',
        postgres: { entityManager: myTypeOrmEntityManager },
        serviceOptions: { maxRetries: 3 },
      },
    }),
  ],
})
export class AppModule {}
```

### EntityManagerLike Contract

The Postgres backend requires an object implementing `EntityManagerLike`:

```typescript
interface EntityManagerLike {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}
```

Any object that accepts parameterized SQL queries satisfies this contract. TypeORM's `EntityManager` is compatible out of the box.

## OutboxServiceOptions Reference

| Option               | Type                          | Default                           | Description                          |
| -------------------- | ----------------------------- | --------------------------------- | ------------------------------------ |
| enabled              | boolean                       | true                              | Enable or disable background processor |
| processorIntervalMs  | number                        | 5000                              | Poll interval in milliseconds        |
| maxRetries           | number                        | 3                                 | Max retries before DLQ routing       |
| retryBackoffBaseMs   | number                        | 1000                              | Base backoff delay (exponential)     |
| dlqSubjectBuilder    | (subject: string) => string   | prepends `dlq.`                   | Custom DLQ subject builder           |

## Background Processor Behavior

1. Polls pending entries at the configured interval (`processorIntervalMs`)
2. Publishes each entry via `ProducerService`
3. On success: marks the entry as `sent`
4. On failure: increments the attempt counter and applies exponential backoff
5. After `maxRetries` exceeded: routes to a DLQ subject and marks as `sent` (prevents re-processing)

## DLQ Routing

Default DLQ subject format: `dlq.{original_subject}`

Example: event on `company.550e8400...payment.proof.uploaded.v1` routes to `dlq.company.550e8400...payment.proof.uploaded.v1`

DLQ payload includes the original envelope plus `last_error`, `attempts`, and `failed_at` fields.

## Usage After Configuration

Regardless of the backend, the usage is identical:

```typescript
import { OutboxService } from '@cobranza-apps/events-toolkit';

class PaymentService {
  constructor(private readonly outboxService: OutboxService) {}

  async handle(event: MyEvent, context: EventContext): Promise<void> {
    const subject = this.subjectBuilder.build({
      companyId: context.companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '1',
    });
    await this.outboxService.saveToOutbox(event, subject);
  }
}
```

## Transactional Outbox (PostgreSQL + TypeORM)

For microservices that use PostgreSQL with TypeORM (e.g., `ms-db-gateway`), the outbox module supports inserting events within the same transaction as business data. This ensures atomicity: if the business write fails, the outbox entry is rolled back too.

### `saveToOutbox` vs `saveInTransaction`

| Aspect | `saveToOutbox` | `saveInTransaction` |
|--------|---------------|---------------------|
| Transaction scope | Independent INSERT | INSERT within caller's transaction |
| Atomicity | Event persisted even if business logic fails | Rolled back with business logic on failure |
| Use case | Fire-and-forget, SQLite services | PostgreSQL + TypeORM services |
| `transactionContext` | Not applicable | Required |

See [Transactional Outbox Usage Guide](outbox-transactional-usage.md) for full examples.

## Request-Reply with the Outbox

The Outbox module works transparently with request-reply events. When a request event includes `reply_to`, the outbox processor preserves it through the entire publish-retry-DLQ pipeline.

### When to use the Outbox with Request-Reply

| Pattern | Outbox for Request? | Outbox for Response? |
| ------- | ------------------- | -------------------- |
| Sync `request()` | ❌ No — uses NATS built-in reply | ❌ No — NATS handles the reply inbox |
| Async `sendRequest()` | ✅ Yes — use `sendAsyncRequestThroughOutbox` for guaranteed delivery | ⚠️ Only if handler has side effects needing transactional safety |
| Async `sendRequest()` (fire-and-forget OK) | ❌ No — use `RequestReplyService.sendRequest()` directly | ❌ No |

### Async Request Through Outbox (Low-Level)

Use `sendRequestThroughOutbox` for async request-reply flows where the request must survive service restarts:

```typescript
import { OutboxService, SubjectBuilder, EventContext, ActorType, generateUuidV7, createEvent } from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<void> {
    const requestSubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'requested', version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'requested.response', version: '1',
    });

    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const event = createEvent({ clientId }, context);

    // Outbox ensures the request is published even if NATS is temporarily down
    await this.outboxService.sendRequestThroughOutbox(event, requestSubject);
  }
}
```

### High-Level API — `sendAsyncRequestThroughOutbox`

The `sendAsyncRequestThroughOutbox` method provides a simpler API that builds the envelope internally:

```typescript
const result = await this.outboxService.sendAsyncRequestThroughOutbox({
  subject: requestSubject,
  payload: { clientId },
  context: {
    type: 'credit.check.requested',
    version: '1.0.0',
    producer: 'debt-service',
    companyId,
    actorType: ActorType.SYSTEM,
    actorId: 'debt-service',
    correlationId: generateUuidV7(),
    replyTo: replySubject,
  },
});

// Use result.correlationId to track the async response
```

The `context` parameter requires `replyTo` (enforced by TypeScript via `AsyncRequestEventContext`). This ensures request-reply events always have a response routing subject.

The method returns a `SendAsyncRequestThroughOutboxResult` with the event's `correlationId`, which can be used to correlate the async response when it arrives.

### Response Handling

Response handlers typically do **not** need the outbox pattern unless they perform other side effects that require transactional safety. Use `RequestReplyService.sendResponse()` or `ProducerService.publish()` directly:

```typescript
@OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })
async onCreditCheckRequested(event: EventEnvelope<CreditCheckRequestedData>): Promise<void> {
  if (!this.requestReply.isRequestReplyMessage(event)) { return; }

  const result = await this.performCheck(event.data);
  const responseEvent = this.requestReply.buildResponseEnvelope({
    requestEvent: event,
    responseContext: { /* ... */ },
    responseData: result,
  });

  // Direct publish — no outbox needed for responses
  await this.requestReply.sendResponse(event.correlation_id, responseEvent);
}
```

### Why use `sendAsyncRequestThroughOutbox` or `sendRequestThroughOutbox` instead of `saveToOutbox`?

- Both methods validate that `reply_to` is present either at compile time (`sendAsyncRequestThroughOutbox` via `AsyncRequestEventContext` type) or at runtime (`sendRequestThroughOutbox` via `ensureReplyToPresent()`). Calling `saveToOutbox` with an event missing `reply_to` would result in a fire-and-forget event, silently breaking the request-reply flow.
- The method names clearly communicate that the event is part of a request-reply exchange.
- `sendAsyncRequestThroughOutbox` returns `correlationId` for response tracking.

### DLQ Preservation

If a request-reply event exceeds `maxRetries` and is routed to the Dead Letter Queue, its `reply_to` field is preserved in the DLQ envelope. This allows DLQ monitoring systems to trace the original request context and understand which request flow was affected.

## Migration from 0.x API

| Old API                             | New API                                         |
| ----------------------------------- | ----------------------------------------------- |
| `SqliteOutboxService`               | `OutboxService` (unified, single class)        |
| `OutboxModule.register(...)`        | `OutboxModule.forRoot({ type, ... })`           |
| `dbPath` (top-level)               | `sqlite: { dbPath }` or `postgres: { entityManager }` |
| `publishInterval`                  | `serviceOptions.processorIntervalMs`            |