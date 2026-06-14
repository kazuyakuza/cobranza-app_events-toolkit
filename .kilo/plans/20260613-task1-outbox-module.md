# Implementation Plan — Task 1: Outbox Module (Configurable Design)

**Plan file**: `.kilo/plans/20260613-task1-outbox-module.md`
**Date**: 2026-06-13
**Task**: Outbox Module – Configurable Design with strategy pattern
**Branch**: `feat/outbox-logging-polish-finalization`

---

## Pre-Analysis

### Context Summary

The `events-toolkit` is a NestJS library providing standardized NATS+JetStream event handling. The existing codebase uses `DynamicModule` patterns with `forRoot()`/`forRootAsync()` (see `ProducerModule` and `ConsumerModule`). The outbox module needs to support multiple storage backends via the strategy pattern: `better-sqlite3` (default for most microservices) and TypeORM/PostgreSQL (for `ms-db-gateway`).

Key constraints:
- Max 200 lines/file (ideal <=125 excluding blanks/comments/imports)
- Max 50 lines/method body
- Max 2 levels indentation
- Max 2 params/method (encapsulate more in object/class)
- Prefer private members
- Self-documenting code (clear names over comments)
- Single-section boolean conditions
- No commented-out code
- TypeORM is NOT a dependency — Postgres repo assumes TypeORM is provided by consumer

### Design Decisions

1. **Parameter Object for `save`**: The `OutboxRepository.save()` method has 3 params (`event`, `subject`, `metadata`), violating the max-2-params rule. Solution: encapsulate in `SaveOutboxEntryParams` object.

2. **Separate types file**: `outbox.types.ts` holds the `OutboxRepository` interface, `OutboxEntry`, `SaveOutboxEntryParams`, module option interfaces, and the injection token — keeping each file focused and under line limits.

3. **Shared Table Schema**: Both SQLite and Postgres use an identical logical schema:
   - `id` TEXT PRIMARY KEY (event ID from envelope)
   - `event_data` TEXT NOT NULL (JSON-serialized EventEnvelope)
   - `subject` TEXT NOT NULL (NATS subject)
   - `metadata` TEXT (nullable, JSON)
   - `status` TEXT NOT NULL DEFAULT 'pending'
   - `attempts` INTEGER NOT NULL DEFAULT 0
   - `last_error` TEXT (nullable)
   - `created_at` TEXT NOT NULL (ISO 8601)
   - `updated_at` TEXT NOT NULL (ISO 8601)

4. **SQLite WAL mode**: Enabled for better concurrent read performance in production.

5. **Postgres**: Uses raw SQL via TypeORM `EntityManager.query()`. No TypeORM entities or decorators — lightweight, no dependency on TypeORM at the package level.

6. **Module pattern**: Follows `ProducerModule` structure — simpler than `ConsumerModule` since there are no explorers or pair providers needed. Uses `OUTBOX_REPOSITORY_TOKEN` as the injection token.

---

## Step-by-Step Plan

### Step 1: Create `src/outbox/outbox.types.ts`

**Purpose**: Define all shared types, interfaces, and constants for the outbox module.

**Content**:

```typescript
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { Type, DynamicModule, ForwardReference } from '@nestjs/common';

/** Injection token for the OutboxRepository provider selected by the module configuration. */
export const OUTBOX_REPOSITORY_TOKEN = 'OUTBOX_REPOSITORY';

/** Represents a single row in the outbox persistence table. */
export interface OutboxEntry {
  id: string;
  eventData: string;
  subject: string;
  metadata: string | null;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Parameters for persisting an event to the outbox. */
export interface SaveOutboxEntryParams {
  event: EventEnvelope<unknown>;
  subject: string;
  metadata?: unknown;
}

/** Persistence contract for the outbox module. */
export interface OutboxRepository {
  save(params: SaveOutboxEntryParams): Promise<void>;
  getPending(limit?: number): Promise<OutboxEntry[]>;
  markAsSent(id: string): Promise<void>;
  markAsFailed(id: string, error: string): Promise<void>;
}

/** Synchronous options for OutboxModule.forRoot. */
export interface OutboxModuleOptions {
  type: 'sqlite' | 'postgres';
  sqlite?: { dbPath: string };
  postgres?: { entityManager: import('typeorm').EntityManager };
}

/** Asynchronous options for OutboxModule.forRootAsync. */
export interface OutboxModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<OutboxModuleOptions> | OutboxModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}
```

**Line count**: ~50 lines (well under 125)

---

### Step 2: Create `src/outbox/sqlite-outbox.repository.ts`

**Purpose**: Concrete `OutboxRepository` implementation using `better-sqlite3`. This is the default backend for most microservices.

**Design notes**:
- Uses synchronous `better-sqlite3` API (no async overhead needed since SQLite is local)
- Enables WAL journal mode in constructor
- Creates table with `IF NOT EXISTS` in constructor
- All public methods are `async` to match `OutboxRepository` contract (wrapping sync DB calls)
- Row mapping between DB column format (snake_case) and `OutboxEntry` interface (camelCase) via private method
- Uses `generateUuidV7()` and `nowIso()` from common utils
- Uses `encodeEvent` for serialization consistency

```typescript
import Database from 'better-sqlite3';
import { OutboxRepository, OutboxEntry, SaveOutboxEntryParams } from './outbox.types';
import { generateUuidV7 } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    event_data TEXT NOT NULL,
    subject TEXT NOT NULL,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const INSERT_SQL = `
  INSERT INTO outbox (id, event_data, subject, metadata, status, attempts, last_error, created_at, updated_at)
  VALUES (@id, @event_data, @subject, @metadata, 'pending', 0, NULL, @created_at, @updated_at)
`;

const SELECT_PENDING_SQL = `
  SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?
`;

const UPDATE_SENT_SQL = `
  UPDATE outbox SET status = 'sent', updated_at = @updated_at WHERE id = @id
`;

const UPDATE_FAILED_SQL = `
  UPDATE outbox
  SET status = 'failed', attempts = attempts + 1, last_error = @last_error, updated_at = @updated_at
  WHERE id = @id
`;

export class SqliteOutboxRepository implements OutboxRepository {
  private readonly database: Database.Database;

  constructor(dbPath: string) {
    this.database = new Database(dbPath);
    this.database.pragma('journal_mode = WAL');
    this.database.exec(CREATE_TABLE_SQL);
  }

  async save(params: SaveOutboxEntryParams): Promise<void> {
    const timestamp = nowIso();
    this.database.prepare(INSERT_SQL).run({
      id: params.event.id,
      event_data: JSON.stringify(params.event),
      subject: params.subject,
      metadata: this.serializeMetadata(params.metadata),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  async getPending(limit = 100): Promise<OutboxEntry[]> {
    const rows = this.database.prepare(SELECT_PENDING_SQL).all(limit);
    return (rows as Array<Record<string, unknown>>).map(this.mapRowToEntry);
  }

  async markAsSent(id: string): Promise<void> {
    this.database.prepare(UPDATE_SENT_SQL).run({ id, updated_at: nowIso() });
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    this.database.prepare(UPDATE_FAILED_SQL).run({ id, last_error: error, updated_at: nowIso() });
  }

  private serializeMetadata(metadata: unknown): string | null {
    return metadata != null ? JSON.stringify(metadata) : null;
  }

  private mapRowToEntry(row: Record<string, unknown>): OutboxEntry {
    return {
      id: row.id as string,
      eventData: row.event_data as string,
      subject: row.subject as string,
      metadata: row.metadata as string | null,
      status: row.status as OutboxEntry['status'],
      attempts: row.attempts as number,
      lastError: row.last_error as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
```

**Line count**: ~95 lines (within 125 excluding blanks)

---

### Step 3: Create `src/outbox/postgres-outbox.repository.ts`

**Purpose**: Concrete `OutboxRepository` implementation for `ms-db-gateway` using TypeORM's `EntityManager`. Assumes TypeORM is installed and configured by the consuming microservice.

**Design notes**:
- Receives TypeORM `EntityManager` via constructor
- Uses parameterized raw SQL queries via `entityManager.query()`
- Uses `POSTGRES_ERROR_CODES.UNIQUE_VIOLATION` for idempotency on duplicate IDs
- Parameters use positional `$1, $2, ...` Postgres style
- Lazy table creation on first operation (avoids issues with transaction boundaries)
- Defines a local `EntityManagerLike` interface to avoid importing from `typeorm` package

```typescript
import { OutboxRepository, OutboxEntry, SaveOutboxEntryParams } from './outbox.types';
import { nowIso } from '../common/utils/date.utils';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    event_data TEXT NOT NULL,
    subject TEXT NOT NULL,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const INSERT_SQL = `
  INSERT INTO outbox (id, event_data, subject, metadata, status, attempts, last_error, created_at, updated_at)
  VALUES ($1, $2, $3, $4, 'pending', 0, NULL, $5, $6)
  ON CONFLICT (id) DO NOTHING
`;

const SELECT_PENDING_SQL = `
  SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1
`;

const UPDATE_SENT_SQL = `
  UPDATE outbox SET status = 'sent', updated_at = $2 WHERE id = $1
`;

const UPDATE_FAILED_SQL = `
  UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = $2, updated_at = $3 WHERE id = $1
`;

interface EntityManagerLike {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export class PostgresOutboxRepository implements OutboxRepository {
  private tableEnsured = false;

  constructor(private readonly entityManager: EntityManagerLike) {}

  private async ensureTable(): Promise<void> {
    if (this.tableEnsured) {
      return;
    }
    await this.entityManager.query(CREATE_TABLE_SQL);
    this.tableEnsured = true;
  }

  async save(params: SaveOutboxEntryParams): Promise<void> {
    await this.ensureTable();
    const timestamp = nowIso();
    await this.entityManager.query(INSERT_SQL, [
      params.event.id,
      JSON.stringify(params.event),
      params.subject,
      params.metadata != null ? JSON.stringify(params.metadata) : null,
      timestamp,
      timestamp,
    ]);
  }

  async getPending(limit = 100): Promise<OutboxEntry[]> {
    await this.ensureTable();
    const rows = await this.entityManager.query(SELECT_PENDING_SQL, [limit]);
    return (rows as Array<Record<string, unknown>>).map(this.mapRowToEntry);
  }

  async markAsSent(id: string): Promise<void> {
    await this.entityManager.query(UPDATE_SENT_SQL, [id, nowIso()]);
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    await this.entityManager.query(UPDATE_FAILED_SQL, [id, error, nowIso()]);
  }

  private mapRowToEntry(row: Record<string, unknown>): OutboxEntry {
    return {
      id: row.id as string,
      eventData: row.event_data as string,
      subject: row.subject as string,
      metadata: row.metadata as string | null,
      status: row.status as OutboxEntry['status'],
      attempts: row.attempts as number,
      lastError: row.last_error as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
```

**Line count**: ~105 lines (within 125 excluding blanks)

---

### Step 4: Create `src/outbox/outbox.module.ts`

**Purpose**: NestJS `DynamicModule` that registers the appropriate `OutboxRepository` implementation based on configuration.

**Design notes**:
- Follows `ProducerModule` pattern (simpler than `ConsumerModule`)
- `forRoot(options)` — sync configuration, creates repository instance from options
- `forRootAsync(options)` — async configuration (for DI-dependent setups)
- `OUTBOX_REPOSITORY_TOKEN` is the injection token that consumers use with `@Inject()`
- Module is `global: true` so consumers don't need to import it in every sub-module
- Defaults to in-memory SQLite when no `sqlite.dbPath` provided (safe default for tests)

```typescript
import { DynamicModule, Module, Provider, Type, ForwardReference } from '@nestjs/common';
import {
  OUTBOX_REPOSITORY_TOKEN,
  OutboxRepository,
  OutboxModuleOptions,
  OutboxModuleAsyncOptions,
} from './outbox.types';
import { SqliteOutboxRepository } from './sqlite-outbox.repository';
import { PostgresOutboxRepository } from './postgres-outbox.repository';

const OUTBOX_MODULE_OPTIONS_TOKEN = 'OUTBOX_MODULE_OPTIONS';

function resolveRepository(options: OutboxModuleOptions): OutboxRepository {
  if (options.type === 'postgres') {
    if (!options.postgres?.entityManager) {
      throw new Error(
        'OutboxModule with type "postgres" requires options.postgres.entityManager',
      );
    }
    return new PostgresOutboxRepository(options.postgres.entityManager);
  }
  const dbPath = options.sqlite?.dbPath ?? ':memory:';
  return new SqliteOutboxRepository(dbPath);
}

@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    const repositoryProvider: Provider = {
      provide: OUTBOX_REPOSITORY_TOKEN,
      useValue: resolveRepository(options),
    };

    return {
      module: OutboxModule,
      global: true,
      providers: [repositoryProvider],
      exports: [OUTBOX_REPOSITORY_TOKEN],
    };
  }

  static forRootAsync(asyncOptions: OutboxModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: OUTBOX_MODULE_OPTIONS_TOKEN,
      useFactory: async (...args: unknown[]): Promise<OutboxModuleOptions> =>
        asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };

    const repositoryProvider: Provider = {
      provide: OUTBOX_REPOSITORY_TOKEN,
      useFactory: (moduleOptions: OutboxModuleOptions): OutboxRepository =>
        resolveRepository(moduleOptions),
      inject: [OUTBOX_MODULE_OPTIONS_TOKEN],
    };

    return {
      module: OutboxModule,
      global: true,
      imports: [...(asyncOptions.imports ?? [])],
      providers: [optionsProvider, repositoryProvider],
      exports: [OUTBOX_REPOSITORY_TOKEN],
    };
  }
}
```

**Line count**: ~75 lines (well within 125)

---

### Step 5: Create `src/outbox/index.ts`

**Purpose**: Barrel export file for the outbox module.

**Content**:

```typescript
export { OutboxModule } from './outbox.module';
export {
  OUTBOX_REPOSITORY_TOKEN,
  OutboxRepository,
  OutboxEntry,
  SaveOutboxEntryParams,
  OutboxModuleOptions,
  OutboxModuleAsyncOptions,
} from './outbox.types';
export { SqliteOutboxRepository } from './sqlite-outbox.repository';
export { PostgresOutboxRepository } from './postgres-outbox.repository';
```

---

### Step 6: Update `src/index.ts` — Add outbox exports

**Exact location**: After the `// ── Request-Reply ──` block (after the `resolveRequestReplyConfig` re-export line), and before the file end.

**New code to insert**:

```typescript
// ── Outbox ──
export { OutboxModule } from './outbox/outbox.module';
export {
  OUTBOX_REPOSITORY_TOKEN,
  OutboxRepository,
  OutboxEntry,
  OutboxModuleOptions,
  OutboxModuleAsyncOptions,
} from './outbox/outbox.types';
export { SqliteOutboxRepository } from './outbox/sqlite-outbox.repository';
export { PostgresOutboxRepository } from './outbox/postgres-outbox.repository';
```

---

### Step 7: Create unit test `src/outbox/outbox.module.spec.ts`

**Purpose**: Test the `OutboxModule` dynamic module factory methods.

**Tests to include**:
1. `forRoot` with `type: 'sqlite'` creates `SqliteOutboxRepository`
2. `forRoot` with `type: 'sqlite'` and custom `dbPath`
3. `forRoot` with `type: 'postgres'` creates `PostgresOutboxRepository`
4. `forRoot` with `type: 'postgres'` throws if no entityManager provided
5. `forRootAsync` resolves options from factory
6. `forRootAsync` passes inject dependencies to factory
7. Default SQLite path is `':memory:'` when not specified
8. Module exports `OUTBOX_REPOSITORY_TOKEN`

---

### Step 8: Create unit test `src/outbox/sqlite-outbox.repository.spec.ts`

**Purpose**: Test the SQLite repository CRUD operations with a `':memory:'` database.

**Tests to include**:
1. Creates the outbox table on construction
2. `save()` inserts a pending record with correct fields
3. `save()` serializes event envelope as JSON in `event_data`
4. `save()` stores metadata as JSON when provided
5. `save()` stores null metadata when not provided
6. `getPending()` returns records ordered by `created_at` ASC
7. `getPending()` respects the limit parameter
8. `getPending()` returns empty array when no pending records exist
9. `markAsSent()` updates status to `sent` and refreshes `updated_at`
10. `markAsFailed()` updates status to `failed`, increments attempts, stores error
11. Table uses WAL journal mode

---

### Step 9: Update `.agent/project-structure.md`

**Current line**:
```
- outbox/ - OutboxModule, SqliteOutboxService, Outbox entity
```

**Replace with**:
```
- outbox/ - OutboxModule, SqliteOutboxRepository, PostgresOutboxRepository, shared types
```

---

### Step 10: Remove `src/outbox/.gitkeep`

**Command**: `Remove-Item -LiteralPath "src/outbox/.gitkeep"`

---

### Step 11: Type-check

**Command**: `npx tsc --noEmit`
**Working directory**: `C:\projects\cobranza-app\events-toolkit`

Verify no type errors across all new files. If errors, fix and re-run.

---

### Step 12: Run tests

**Command**: `npx jest src/outbox/ --no-coverage`
**Working directory**: `C:\projects\cobranza-app\events-toolkit`

Verify all outbox tests pass.

---

## Files Summary

| File | Action | Est. Lines |
|------|--------|-----------|
| `src/outbox/outbox.types.ts` | CREATE | ~50 |
| `src/outbox/sqlite-outbox.repository.ts` | CREATE | ~95 |
| `src/outbox/postgres-outbox.repository.ts` | CREATE | ~105 |
| `src/outbox/outbox.module.ts` | CREATE | ~75 |
| `src/outbox/index.ts` | CREATE | ~15 |
| `src/index.ts` | EDIT (add exports) | +10 |
| `src/outbox/outbox.module.spec.ts` | CREATE | ~100 |
| `src/outbox/sqlite-outbox.repository.spec.ts` | CREATE | ~130 |
| `.agent/project-structure.md` | EDIT (1 line) | 0 net change |
| `src/outbox/.gitkeep` | DELETE | -1 file |

**Total new source code**: ~340 lines across 5 files (excluding tests)
**Total test code**: ~230 lines across 2 files

---

## Compliance Verification

| Rule | Status | Notes |
|------|--------|-------|
| Max 200 lines/file | PASS | Largest file ~105 lines |
| Max 50 lines/method | PASS | Largest method ~15 lines |
| Max 2 indentation levels | PASS | No triple-nested blocks anywhere |
| Max 2 params/method | PASS | `save` uses `SaveOutboxEntryParams` object |
| Prefer private members | PASS | Row mappers, serializers, table initializers are private |
| No commented-out code | PASS | Clean new files |
| Single-section conditions | PASS | Conditions are simple (`!= null`, `!..`) |
| Self-documenting code | PASS | Clear descriptive names throughout |

---

## Implementation Order

1. Create `src/outbox/outbox.types.ts`
2. Create `src/outbox/sqlite-outbox.repository.ts`
3. Create `src/outbox/postgres-outbox.repository.ts`
4. Create `src/outbox/outbox.module.ts`
5. Create `src/outbox/index.ts`
6. Update `src/index.ts` (add outbox exports)
7. Remove `src/outbox/.gitkeep`
8. Type-check: `npx tsc --noEmit`
9. Create `src/outbox/outbox.module.spec.ts`
10. Create `src/outbox/sqlite-outbox.repository.spec.ts`
11. Run tests: `npx jest src/outbox/ --no-coverage`
12. Update `.agent/project-structure.md`

---

## Git Commit Message

```
feat(outbox): add configurable OutboxModule with SQLite and Postgres backends

- Define OutboxRepository interface and shared types (OutboxEntry, SaveOutboxEntryParams)
- Implement SqliteOutboxRepository using better-sqlite3 with WAL mode
- Implement PostgresOutboxRepository using TypeORM EntityManager raw SQL
- Add OutboxModule as NestJS DynamicModule with forRoot/forRootAsync
- Add unit tests for module factory and SQLite repository CRUD
- Update public API barrel exports and project structure docs
```
