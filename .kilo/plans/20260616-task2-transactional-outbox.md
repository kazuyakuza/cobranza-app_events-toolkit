# Task 2: Transactional Outbox Hook — Implementation Plan

## Objective

Add transactional support to the outbox module so that `ms-db-gateway` (PostgreSQL + TypeORM) can insert outbox events within the same database transaction as business data, while SQLite-based services use a uniform API without full transactional atomicity.

---

## Pre-Analysis

### Current State

| File | Role |
|------|------|
| `src/outbox/outbox.types.ts` | `OutboxEntry`, `SaveOutboxEntryParams`, `OutboxRepository`, `EntityManagerLike`, module options |
| `src/outbox/outbox.service.ts` | `OutboxService` with `saveToOutbox(event, subject)` and `sendRequestThroughOutbox(event, subject)` |
| `src/outbox/outbox-service-deps.interface.ts` | `OutboxServiceDeps` (repository, producerService, logger, options) |
| `src/outbox/postgres-outbox.repository.ts` | `PostgresOutboxRepository` — uses constructor-injected `EntityManagerLike` for ALL queries |
| `src/outbox/sqlite-outbox.repository.ts` | `SqliteOutboxRepository` — uses `better-sqlite3` synchronously |
| `src/outbox/outbox.module.ts` | `OutboxModule.forRoot` / `forRootAsync` wires up repository + service |
| `src/outbox/index.ts` | Barrel exports |
| `src/outbox/outbox.service.fixture.ts` | Test helpers and mock factory |
| `src/outbox/outbox.service.spec.ts` | Existing `saveToOutbox` unit tests |

### Key Challenge

`PostgresOutboxRepository` receives `EntityManagerLike` in its constructor. For TypeORM transactions, the `QueryRunner` is created per-request and must be used for the INSERT — not the constructor-injected manager. The cleanest approach: extend `SaveOutboxEntryParams` with an optional `transactionContext` and resolve the executor per-save.

### Design Decisions

1. **`TransactionContext` as a discriminated interface** — `type` field discriminator enables future ORMs without breaking changes.
2. **`SaveInTransactionParams` as a separate type** — follows max-2-params rule; defined in its own file per project rules.
3. **`PostgresOutboxRepository.resolveQueryExecutor()`** — private method that returns the transaction context's `queryRunner` when a `TypeormQueryRunnerContext` is provided, otherwise falls back to `this.entityManager`.
4. **`SqliteOutboxRepository` ignores `transactionContext`** — SQLite's synchronous API makes per-request transactions less critical; the flag is accepted but not used.
5. **`saveToOutbox` remains unchanged** — backward-compatible; `transactionContext` defaults to `undefined`.
6. **`ensureTable()` always uses `this.entityManager`** — DDL operations should not participate in user transactions; the `tableEnsured` flag ensures it runs at most once.

---

## Implementation Steps

### Step 1: Create `TransactionContext` interface

**File:** `src/outbox/transaction-context.interface.ts` (NEW)

```typescript
import { EntityManagerLike } from './outbox.types';

/** Base transaction context for outbox repository operations. */
export interface TransactionContext {
  /** Discriminator for the transaction context type. */
  readonly type: string;
}

/** Transaction context backed by a TypeORM QueryRunner. */
export interface TypeormQueryRunnerContext extends TransactionContext {
  readonly type: 'typeorm-query-runner';
  /** QueryRunner bound to an active TypeORM transaction. */
  readonly queryRunner: EntityManagerLike;
}
```

**Rationale:** Discriminated union pattern with `type` string field. `TypeormQueryRunnerContext` narrows to `'typeorm-query-runner'`. Future contexts (e.g., `'prisma-transaction'`) extend `TransactionContext` with their own fields.

---

### Step 2: Create `SaveInTransactionParams` interface

**File:** `src/outbox/save-in-transaction-params.interface.ts` (NEW)

```typescript
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { TransactionContext } from './transaction-context.interface';

/** Parameters for persisting an event to the outbox within a database transaction. */
export interface SaveInTransactionParams {
  /** Event envelope to persist. */
  readonly event: EventEnvelope<unknown>;
  /** NATS subject the event will be published to. */
  readonly subject: string;
  /** Transaction context linking the outbox insert to an active transaction. */
  readonly transactionContext: TransactionContext;
}
```

**Rationale:** Encapsulates the 3 parameters into a single object, following the max-2-params rule. Defined in its own file per project rules.

---

### Step 3: Extend `SaveOutboxEntryParams` with optional `transactionContext`

**File:** `src/outbox/outbox.types.ts` (MODIFY)

Add import of `TransactionContext` at top:

```typescript
import { TransactionContext } from './transaction-context.interface';
```

Add `transactionContext` field to `SaveOutboxEntryParams`:

```typescript
/** Parameters for persisting an event to the outbox. */
export interface SaveOutboxEntryParams {
  event: EventEnvelope<unknown>;
  subject: string;
  metadata?: unknown;
  /** Optional transaction context for inserting the event within an active database transaction. */
  transactionContext?: TransactionContext;
}
```

**Lines changed:** ~3 (1 import, 1 field, 1 JSDoc comment)

---

### Step 4: Update `PostgresOutboxRepository` to use transaction context

**File:** `src/outbox/postgres-outbox.repository.ts` (MODIFY)

4a. Add import:

```typescript
import { TransactionContext, TypeormQueryRunnerContext } from './transaction-context.interface';
```

4b. Add `resolveQueryExecutor` private method:

```typescript
private resolveQueryExecutor(context?: TransactionContext): EntityManagerLike {
  if (context?.type === 'typeorm-query-runner') {
    return (context as TypeormQueryRunnerContext).queryRunner;
  }
  return this.entityManager;
}
```

4c. Modify `save()` to use `resolveQueryExecutor`:

Replace:
```typescript
await this.entityManager.query(INSERT_SQL, [
```

With:
```typescript
const executor = this.resolveQueryExecutor(params.transactionContext);
await executor.query(INSERT_SQL, [
```

**Lines changed:** ~12 (1 import, 5 new method lines, 2 modified lines in save)

**Note on `ensureTable()`:** Remains unchanged — always uses `this.entityManager` for DDL, which is correct since DDL should not be part of a user's business transaction.

---

### Step 5: Update `SqliteOutboxRepository` to accept (and ignore) transaction context

**File:** `src/outbox/sqlite-outbox.repository.ts` (NO CHANGES)

The `save(params: SaveOutboxEntryParams)` signature already accepts `SaveOutboxEntryParams`, which now includes the optional `transactionContext` field. Since it's optional, the SQLite implementation simply ignores it — no code changes required.

---

### Step 6: Add `saveInTransaction` method to `OutboxService`

**File:** `src/outbox/outbox.service.ts` (MODIFY)

6a. Add import:

```typescript
import { SaveInTransactionParams } from './save-in-transaction-params.interface';
```

6b. Add `saveInTransaction` method after `saveToOutbox`:

```typescript
/** Persists an event to the outbox within an active database transaction. */
async saveInTransaction(params: SaveInTransactionParams): Promise<void> {
  await this.repository.save({
    event: params.event,
    subject: params.subject,
    transactionContext: params.transactionContext,
  });
  this.logOutboxSaved(params.event, params.subject);
}
```

**Lines changed:** ~8 (1 import, 7 new method lines)

**Why single param:** The method accepts `SaveInTransactionParams` (encapsulated object) to comply with max-2-params rule. `event` + `subject` + `transactionContext` would be 3 params.

---

### Step 7: Update barrel exports

**File:** `src/outbox/index.ts` (MODIFY)

Add exports for new types:

```typescript
export { TransactionContext, TypeormQueryRunnerContext } from './transaction-context.interface';
export { SaveInTransactionParams } from './save-in-transaction-params.interface';
```

**Lines changed:** ~2

---

### Step 8: `OutboxServiceDeps` — NO CHANGES NEEDED

The `OutboxServiceDeps` interface only references `OutboxRepository` — it doesn't need changes since the repository interface now accepts `transactionContext` via `SaveOutboxEntryParams`.

---

### Step 9: Write unit tests for `saveInTransaction`

**File:** `src/outbox/outbox.service.transactional.spec.ts` (NEW)

Test cases:

1. **`saveInTransaction` calls `repository.save` with event, subject, and transaction context**
   - Create a `TypeormQueryRunnerContext` mock
   - Call `service.saveInTransaction({ event, subject, transactionContext })`
   - Assert `repository.save` called with `{ event, subject, transactionContext }`

2. **`saveInTransaction` logs the outbox saved event**
   - Call `service.saveInTransaction({ ... })`
   - Assert `logger.logOutboxSaved` called with correct context

3. **`saveInTransaction` passes `transactionContext` object reference to `repository.save`**
   - Verify the `repository.save` call args include the exact `transactionContext` object reference

```typescript
import { OutboxService } from './outbox.service';
import {
  createTestEnvelope,
  createOutboxMocks,
  createService,
  OutboxMocks,
} from './outbox.service.fixture';
import { TypeormQueryRunnerContext } from './transaction-context.interface';

describe('OutboxService - saveInTransaction', () => {
  let mocks: OutboxMocks;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
  });

  it('calls repository.save with event, subject, and transaction context', async () => {
    const envelope = createTestEnvelope();
    const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
    const transactionContext: TypeormQueryRunnerContext = {
      type: 'typeorm-query-runner',
      queryRunner: { query: jest.fn().mockResolvedValue(undefined) },
    };

    await service.saveInTransaction({ event: envelope, subject, transactionContext });

    expect(mocks.repository.save).toHaveBeenCalledWith({
      event: envelope,
      subject,
      transactionContext,
    });
  });

  it('calls logger.logOutboxSaved with correct context', async () => {
    const envelope = createTestEnvelope();
    const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
    const transactionContext: TypeormQueryRunnerContext = {
      type: 'typeorm-query-runner',
      queryRunner: { query: jest.fn().mockResolvedValue(undefined) },
    };

    await service.saveInTransaction({ event: envelope, subject, transactionContext });

    expect(mocks.logger.logOutboxSaved).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: envelope.id, subject }),
    );
  });

  it('passes transactionContext object reference to repository.save', async () => {
    const envelope = createTestEnvelope();
    const subject = 'test.subject';
    const transactionContext: TypeormQueryRunnerContext = {
      type: 'typeorm-query-runner',
      queryRunner: { query: jest.fn().mockResolvedValue(undefined) },
    };

    await service.saveInTransaction({ event: envelope, subject, transactionContext });

    const saveCall = mocks.repository.save.mock.calls[0][0];
    expect(saveCall.transactionContext).toBe(transactionContext);
  });
});
```

---

### Step 10: Write unit tests for `PostgresOutboxRepository` transaction context handling

**File:** `src/outbox/postgres-outbox.repository.transactional.spec.ts` (NEW)

Test cases:

1. **When `transactionContext` with type `'typeorm-query-runner'` is provided, INSERT uses the context's `queryRunner`**
   - Create `PostgresOutboxRepository` with a default `entityManager` mock
   - Create a `TypeormQueryRunnerContext` with a different `queryRunner` mock
   - Call `repository.save({ event, subject, transactionContext })`
   - Assert INSERT was executed on `queryRunner.query()`, NOT on `entityManager.query()` (except for CREATE TABLE)

2. **When no `transactionContext`, INSERT uses the constructor's `entityManager`**
   - Call `repository.save({ event, subject })`
   - Assert INSERT was executed on `entityManager.query()`

3. **When `transactionContext` with unknown type is provided, INSERT falls back to constructor's `entityManager`**
   - Create a `TransactionContext` with `type: 'unknown'`
   - Call `repository.save({ event, subject, transactionContext })`
   - Assert INSERT used `entityManager.query()`

4. **`ensureTable()` always uses `entityManager` regardless of `transactionContext`**
   - First call with `transactionContext`
   - Assert `CREATE TABLE` was called on `entityManager`, not on `queryRunner`

```typescript
import { PostgresOutboxRepository } from './postgres-outbox.repository';
import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { TypeormQueryRunnerContext, TransactionContext } from './transaction-context.interface';

function createTestEnvelope(id: string): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id,
    type: 'test.created',
    version: '1.0.0',
    produced_at: new Date().toISOString(),
    producer: 'test-service',
    company_id: '00000000-0000-0000-0000-000000000001',
    actor_type: ActorType.SYSTEM,
    actor_id: 'actor-1',
    correlation_id: '00000000-0000-0000-0000-000000000002',
    data: { value: 'test' },
  });
}

describe('PostgresOutboxRepository - transaction context', () => {
  let entityManager: { query: jest.Mock };
  let repository: PostgresOutboxRepository;

  beforeEach(() => {
    entityManager = { query: jest.fn().mockResolvedValue(undefined) };
    repository = new PostgresOutboxRepository(entityManager);
  });

  it('uses queryRunner from transactionContext for INSERT when type is typeorm-query-runner', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };
    const context: TypeormQueryRunnerContext = { type: 'typeorm-query-runner', queryRunner };
    const envelope = createTestEnvelope('evt_txn_001');

    await repository.save({ event: envelope, subject: 'test.created', transactionContext: context });

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      expect.any(Array),
    );
    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE'),
      expect.any(Array),
    );
    expect(entityManager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      expect.any(Array),
    );
  });

  it('uses entityManager for INSERT when no transactionContext is provided', async () => {
    const envelope = createTestEnvelope('evt_no_txn');

    await repository.save({ event: envelope, subject: 'test.created' });

    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      expect.any(Array),
    );
  });

  it('falls back to entityManager when transactionContext has an unknown type', async () => {
    const context: TransactionContext = { type: 'unknown-orm' };
    const envelope = createTestEnvelope('evt_unknown');

    await repository.save({ event: envelope, subject: 'test.created', transactionContext: context });

    expect(entityManager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      expect.any(Array),
    );
  });

  it('uses entityManager for ensureTable even when transactionContext is provided', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };
    const context: TypeormQueryRunnerContext = { type: 'typeorm-query-runner', queryRunner };
    const envelope = createTestEnvelope('evt_ddl');

    await repository.save({ event: envelope, subject: 'test.created', transactionContext: context });

    const entityManagerCreateCalls = entityManager.query.mock.calls.filter(
      (call: [string]) => call[0].includes('CREATE TABLE'),
    );
    expect(entityManagerCreateCalls.length).toBeGreaterThanOrEqual(1);
    const queryRunnerCreateCalls = queryRunner.query.mock.calls.filter(
      (call: [string]) => call[0].includes('CREATE TABLE'),
    );
    expect(queryRunnerCreateCalls.length).toBe(0);
  });
});
```

---

### Step 11: Update `outbox.service.fixture.ts` — NO CHANGES NEEDED

The `OutboxMocks` interface and `createOutboxMocks()` function use `jest.Mocked<OutboxRepository>`, which will automatically pick up the new `transactionContext` field in `SaveOutboxEntryParams`. TypeScript's `jest.Mocked` infers the correct types from the updated interface.

---

### Step 12: Create documentation — `docs/outbox-transactional-usage.md` (NEW)

Content sections:

1. **Overview** — What is transactional outbox and why it matters for `ms-db-gateway`
2. **`saveToOutbox` vs `saveInTransaction`** — Table comparing the two methods
3. **TypeORM Transaction Example** — Full code sample showing QueryRunner creation, business data + outbox event in same transaction
4. **TransactionContext Interface** — API reference
5. **TypeormQueryRunnerContext** — Specifics for TypeORM
6. **SQLite Consideration** — API uniformity, no full transactional atomicity
7. **Error Handling** — What happens if transaction rolls back

Key comparison table:

| Aspect | `saveToOutbox` | `saveInTransaction` |
|--------|---------------|---------------------|
| Transaction scope | Independent INSERT in outbox table | INSERT within caller's active transaction |
| Atomicity | Event persisted even if business logic fails | Event rolled back with business logic on failure |
| Use case | Fire-and-forget events, SQLite services | `ms-db-gateway` and services with PostgreSQL |
| `transactionContext` | Not applicable | Required — provides TypeORM `QueryRunner` |
| Backend support | PostgreSQL, SQLite | PostgreSQL (TypeORM); SQLite accepts but ignores context |

TypeORM example to include:

```typescript
import { DataSource } from 'typeorm';
import { OutboxService, TypeormQueryRunnerContext } from '@cobranza-apps/events-toolkit';

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
      await queryRunner.manager.query(
        'UPDATE payments SET status = $1 WHERE id = $2',
        ['processed', paymentId],
      );

      const event = new EventEnvelope<PaymentProcessedData>({
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

      const subject = this.subjectBuilder.build({
        companyId: event.company_id,
        domain: 'payment',
        entity: 'processed',
        action: 'completed',
        version: '1',
      });

      const transactionContext: TypeormQueryRunnerContext = {
        type: 'typeorm-query-runner',
        queryRunner: queryRunner,
      };

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

---

### Step 13: Update `docs/outbox-configuration.md`

Add a new section after "Usage After Configuration" (after line ~180):

```markdown
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
```

---

### Step 14: Update `README.md`

Find the existing "Outbox Module" mention in the "What it provides" section and add a note about `saveInTransaction`. Add a link to the transactional outbox docs.

---

### Step 15: Update `.agent/project-structure.md`

Update the `outbox/` entry to mention transaction context:

```markdown
- outbox/ - OutboxModule, SqliteOutboxRepository, PostgresOutboxRepository, transaction context types, shared types (barrel: index.ts)
```

---

### Step 16: Update `.agent/project-info/context.md`

Add a recent change entry documenting the transactional outbox feature.

---

## Verification Steps

### Build & Type Check

```bash
npm run build
npm run typecheck
```

### Lint

```bash
npm run lint
```

### Run Tests

```bash
npm run test -- --testPathPattern="outbox"
```

Specifically:
- `outbox.service.spec.ts` — verify existing `saveToOutbox` tests still pass
- `outbox.service.transactional.spec.ts` — new `saveInTransaction` tests
- `postgres-outbox.repository.transactional.spec.ts` — transaction context handling tests
- `sqlite-outbox.repository.spec.ts` — verify existing tests still pass (no changes to SQLite repo)

### Manual Verification

- Confirm `SaveOutboxEntryParams` with no `transactionContext` still works for both `PostgresOutboxRepository` and `SqliteOutboxRepository`
- Confirm `PostgresOutboxRepository.save()` with `TypeormQueryRunnerContext` routes INSERT through `queryRunner.query()`
- Confirm `SqliteOutboxRepository.save()` with `transactionContext` still works (ignores it)

---

## Git Commit Strategy

1. `feat(outbox): add TransactionContext, SaveInTransactionParams, and saveInTransaction method` — Steps 1, 2, 3, 6, 7
2. `feat(outbox): update PostgresOutboxRepository with transaction context resolution` — Step 4
3. `test(outbox): add unit tests for transactional outbox (service + postgres repo)` — Steps 9, 10
4. `docs: add transactional outbox usage guide and update configuration docs` — Steps 12, 13, 14
5. `chore: update project structure and context docs` — Steps 15, 16

---

## Files Summary

| # | File | Action | Lines Changed (est.) |
|---|------|--------|----------------------|
| 1 | `src/outbox/transaction-context.interface.ts` | NEW | ~15 |
| 2 | `src/outbox/save-in-transaction-params.interface.ts` | NEW | ~12 |
| 3 | `src/outbox/outbox.types.ts` | MODIFY | ~3 |
| 4 | `src/outbox/postgres-outbox.repository.ts` | MODIFY | ~12 |
| 5 | `src/outbox/outbox.service.ts` | MODIFY | ~8 |
| 6 | `src/outbox/index.ts` | MODIFY | ~2 |
| 7 | `src/outbox/outbox.service.transactional.spec.ts` | NEW | ~50 |
| 8 | `src/outbox/postgres-outbox.repository.transactional.spec.ts` | NEW | ~65 |
| 9 | `docs/outbox-transactional-usage.md` | NEW | ~120 |
| 10 | `docs/outbox-configuration.md` | MODIFY | ~20 |
| 11 | `README.md` | MODIFY | ~5 |
| 12 | `.agent/project-structure.md` | MODIFY | ~1 |
| 13 | `.agent/project-info/context.md` | MODIFY | ~10 |

**No changes to:** `sqlite-outbox.repository.ts`, `outbox.module.ts`, `outbox-service-deps.interface.ts`, `outbox-service-options.interface.ts`, `outbox.service.fixture.ts`.
