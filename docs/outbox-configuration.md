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

## Migration from 0.x API

| Old API                             | New API                                         |
| ----------------------------------- | ----------------------------------------------- |
| `SqliteOutboxService`               | `OutboxService` (unified, single class)        |
| `OutboxModule.register(...)`        | `OutboxModule.forRoot({ type, ... })`           |
| `dbPath` (top-level)               | `sqlite: { dbPath }` or `postgres: { entityManager }` |
| `publishInterval`                  | `serviceOptions.processorIntervalMs`            |