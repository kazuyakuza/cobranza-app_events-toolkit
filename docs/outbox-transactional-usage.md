# Transactional Outbox Usage Guide

## Overview

The transactional outbox pattern ensures atomicity between business data writes and event persistence. When a microservice performs a database write and needs to emit an event, using `saveInTransaction` with a TypeORM `QueryRunner` ensures both the business write and the outbox INSERT succeed or fail together.

This is critical for **`ms-db-gateway`** and any service using PostgreSQL + TypeORM where event loss is unacceptable.

## `saveToOutbox` vs `saveInTransaction`

| Aspect | `saveToOutbox` | `saveInTransaction` |
|--------|---------------|---------------------|
| Transaction scope | Independent INSERT in outbox table | INSERT within caller's active transaction |
| Atomicity | Event persisted even if business logic fails | Event rolled back with business logic on failure |
| Use case | Fire-and-forget events, SQLite services | `ms-db-gateway` and services with PostgreSQL |
| `transactionContext` | Not applicable | Required — provides TypeORM `QueryRunner` |
| Backend support | PostgreSQL, SQLite | PostgreSQL (TypeORM); SQLite accepts but ignores context |

## TypeORM Transaction Example

```typescript
import { DataSource } from 'typeorm';
import { OutboxService, TypeormQueryRunnerContext, EventEnvelope, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';

class PaymentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  async processPayment(paymentId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Business write — part of the transaction
      await queryRunner.manager.query(
        'UPDATE payments SET status = $1 WHERE id = $2',
        ['processed', paymentId],
      );

      // Outbox event — same transaction
      const transactionContext: TypeormQueryRunnerContext = {
        type: 'typeorm-query-runner',
        queryRunner: queryRunner,
      };

      const event = new EventEnvelope<{ paymentId: string; status: string }>({
        id: generateUuidV7(),
        type: 'payment.processed',
        version: '1.0.0',
        produced_at: new Date().toISOString(),
        producer: 'payment-service',
        company_id: '550e8400-e29b-41d4-a716-446655440000',
        actor_type: ActorType.SYSTEM,
        actor_id: 'payment-service',
        correlation_id: generateUuidV7(),
        data: { paymentId, status: 'processed' },
      });

      const subject = 'payment.processed';

      await this.outboxService.saveInTransaction({
        event,
        subject,
        transactionContext,
      });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
```

## TransactionContext Interface

```typescript
/** Base transaction context for outbox repository operations. */
interface TransactionContext {
  /** Discriminator for the transaction context type. */
  readonly type: string;
}
```

All transaction contexts extend `TransactionContext` with a `type` discriminator. This enables future ORMs (e.g., Prisma, Knex) without breaking changes.

## TypeormQueryRunnerContext

```typescript
/** Transaction context backed by a TypeORM QueryRunner. */
interface TypeormQueryRunnerContext extends TransactionContext {
  readonly type: 'typeorm-query-runner';
  /** QueryRunner bound to an active TypeORM transaction. */
  readonly queryRunner: EntityManagerLike;
}
```

The `queryRunner` field accepts any object implementing `EntityManagerLike` (the same contract used by the repository's constructor). TypeORM's `QueryRunner.manager` satisfies this contract out of the box.

## SQLite Consideration

SQLite-based services use the same `OutboxService` API. The `transactionContext` field in `SaveOutboxEntryParams` is optional — SQLite's `SqliteOutboxRepository` accepts but ignores it. This means:

- **API uniformity**: Service code can call `saveInTransaction` regardless of backend.
- **No full transactional atomicity**: SQLite operations are synchronous and single-connection. The outbox INSERT happens immediately without participating in an external transaction.
- **Use `saveToOutbox` for simplicity** unless you need the API symmetry.

## Error Handling

If the transaction is rolled back (e.g., business logic throws an error):

1. `queryRunner.rollbackTransaction()` reverts all changes, including the outbox INSERT.
2. The outbox event is **never persisted** — no ghost events.
3. The background processor never sees events from rolled-back transactions.

If `saveInTransaction` itself throws:

- The repository's `save` method may reject if the database connection is lost or the query fails.
- The caller should catch the error and roll back the transaction.
- No partial state — either both the business write and the outbox INSERT succeed, or neither does.

```typescript
try {
  // ... business logic ...
  await this.outboxService.saveInTransaction({ event, subject, transactionContext });
  await queryRunner.commitTransaction();
} catch (error) {
  await queryRunner.rollbackTransaction();
  // Log error, notify monitoring, etc.
  throw error;
}
```
