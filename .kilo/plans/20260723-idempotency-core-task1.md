# Plan — Idempotency Core Module (Task 1)

- **TODO file**: `.agent/todos/20260722/20260722-todo-2.md`
- **Scope**: TODO items 1–3 (Idempotency Module Setup, Repository Pattern, IdempotencyService).
- **Out of scope**: TODO items 4–7 (consumer integration, discovery capability, testing mocks, docs/changelog) — handled by later tasks.
- **Plan date**: 20260723
- **Reference pattern**: `src/outbox/` (transactional outbox module — pair-token DI, repository abstraction, SQLite + Postgres backends).
- **Branch**: current feature branch created in Step 2 (no git actions in this planning step).

## 1. High-Level Approach

The idempotency subsystem mirrors the transactional outbox module so that its configuration, DI wiring, and persistence abstraction are consistent with the existing toolkit. The module exposes a single global `IdempotencyModule` with `forRoot` / `forRootAsync` that registers a backend-selected `IdempotencyRepository` provider plus an `IdempotencyService`. The service consumes the repository through a deps interface and a pair-token DI split (`IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN` for infra deps, `IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN` for repository + options), exactly as `OutboxModule` splits `OutboxServiceDeps`.

Keys are built deterministically from the event envelope as `${event.id}:${event.correlation_id}` via a small utility, keeping the repository API string-based and backends generic. TTL is optional: `markAsProcessed(key, ttlSeconds?)` stores an `expires_at` ISO timestamp; `clearExpired()` removes expired rows. SQLite uses `INSERT OR IGNORE` and `better-sqlite3`; Postgres uses `ON CONFLICT (key) DO NOTHING` via the existing `EntityManagerLike`. A `MemoryIdempotencyRepository` is included for tests only (TODO item 3, repository pattern bullet). Top-level configuration is added to `EventsToolkitModuleOptions.idempotency` and wired into `EventsToolkitModule.forRoot` / `forRootAsync`.

## 2. File-by-File Plan

All new files live in `src/idempotency/`. Line targets follow project rules (max 200, ideally <125). Each file mirrors the listed Outbox counterpart.

### 2.1 `src/idempotency/idempotency-key.util.ts` *(new)*
- **Mirrors**: none (new helper; parallels style of `src/common/utils/date.utils.ts`).
- **Target lines**: <25.
- **Outline**: single pure function `buildIdempotencyKey(event)` returning the composite key string.
- **Snippet**:
  ```ts
  import type { AnyEventEnvelope } from '../common/envelope/envelope-types';

  const KEY_SEPARATOR = ':';

  export function buildIdempotencyKey(event: AnyEventEnvelope<unknown>): string {
    return `${event.id}${KEY_SEPARATOR}${event.correlation_id}`;
  }
  ```
- **Notes**: imported by service and tests; no class-validator needed (envelope already validated upstream).

### 2.2 `src/idempotency/idempotency.types.ts` *(new)*
- **Mirrors**: `src/outbox/outbox.types.ts`.
- **Target lines**: <90.
- **Outline**:
  - `IDEMPOTENCY_REPOSITORY_TOKEN` (string const).
  - `IdempotencyEntry` interface (`key`, `createdAt`, `expiresAt?`).
  - `IdempotencyRepository` interface with `isProcessed(key)`, `markAsProcessed(key, ttlSeconds?)`, `clearExpired()`.
  - Re-export / import `EntityManagerLike` from `../outbox/outbox.types` (do NOT duplicate — follow DRY; outbox already defines it).
  - `IdempotencyModuleOptions` (synchronous) and `IdempotencyModuleAsyncOptions`.
- **Key snippets**:
  ```ts
  import { Type, DynamicModule, ForwardReference } from '@nestjs/common';
  import { EntityManagerLike } from '../outbox/outbox.types';
  import { IdempotencyServiceOptions } from './idempotency-service-options.interface';

  export const IDEMPOTENCY_REPOSITORY_TOKEN = 'IDEMPOTENCY_REPOSITORY';

  export interface IdempotencyEntry {
    key: string;
    createdAt: string;
    expiresAt?: string | null;
  }

  export interface IdempotencyRepository {
    isProcessed(key: string): Promise<boolean>;
    markAsProcessed(key: string, ttlSeconds?: number): Promise<void>;
    clearExpired(): Promise<void>;
  }

  export interface IdempotencyModuleOptions {
    type: 'sqlite' | 'postgres' | 'memory';
    sqlite?: { dbPath: string };
    postgres?: { entityManager: EntityManagerLike };
    serviceOptions?: IdempotencyServiceOptions;
  }

  export interface IdempotencyModuleAsyncOptions {
    imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
    useFactory: (...args: unknown[]) => Promise<IdempotencyModuleOptions> | IdempotencyModuleOptions;
    inject?: Array<string | symbol | Type<unknown>>;
  }
  ```
- **Decision**: TTL passed as optional `number` arg (≤2 params rule respected — single param only). Expiry computed in repositories via `new Date(Date.now() + ttlSeconds * 1000).toISOString()` when `ttlSeconds != null`.

### 2.3 `src/idempotency/idempotency-service-options.interface.ts` *(new)*
- **Mirrors**: `src/outbox/outbox-service-options.interface.ts`.
- **Target lines**: <25.
- **Outline**: interface `IdempotencyServiceOptions` + token `IDEMPOTENCY_SERVICE_OPTIONS_TOKEN`.
- **Fields**: `defaultTtlSeconds?: number` (applied when `markAsProcessed`/`executeIfNotProcessed` callers omit ttl). Keep intentionally minimal; no processor toggles needed (no background poller in this task).
- **Snippet**:
  ```ts
  import { InjectionToken } from '@nestjs/common';
  export const IDEMPOTENCY_SERVICE_OPTIONS_TOKEN: InjectionToken = 'IDEMPOTENCY_SERVICE_OPTIONS';
  export interface IdempotencyServiceOptions {
    defaultTtlSeconds?: number;
  }
  ```

### 2.4 `src/idempotency/idempotency-service-deps.interface.ts` *(new)*
- **Mirrors**: `src/outbox/outbox-service-deps.interface.ts`.
- **Target lines**: <30.
- **Outline**: `IDEMPOTENCY_SERVICE_DEPS_TOKEN` + `IdempotencyServiceDeps` (`repository`, `logger`, `options?`).
- **Decision**: `IdempotencyService` needs `EventLoggerService` for trace logs (mirrors outbox logger dep); does NOT need `ProducerService` (no publishing). Single logger import.
- **Snippet**:
  ```ts
  import { InjectionToken } from '@nestjs/common';
  import { IdempotencyRepository } from './idempotency.types';
  import { EventLoggerService } from '../logging/event-logger.service';
  import { IdempotencyServiceOptions } from './idempotency-service-options.interface';

  export const IDEMPOTENCY_SERVICE_DEPS_TOKEN: InjectionToken = 'IDEMPOTENCY_SERVICE_DEPS';

  export interface IdempotencyServiceDeps {
    repository: IdempotencyRepository;
    logger: EventLoggerService;
    options?: IdempotencyServiceOptions;
  }
  ```

### 2.5 `src/idempotency/sqlite-idempotency.repository.ts` *(new)*
- **Mirrors**: `src/outbox/sqlite-outbox.repository.ts`.
- **Target lines**: <90.
- **Outline**: `SqliteIdempotencyRepository implements IdempotencyRepository`. DDL `CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT)`. Constructs with `dbPath`, enables WAL, runs DDL eagerly (matches outbox SQLite).
- **SQL constants**:
  - `INSERT_SQL`: `INSERT OR IGNORE INTO idempotency_keys (key, created_at, expires_at) VALUES (?, ?, ?)`.
  - `SELECT_EXISTS_SQL`: `SELECT 1 FROM idempotency_keys WHERE key = ? AND (expires_at IS NULL OR expires_at >= ?) LIMIT 1`.
  - `DELETE_EXPIRED_SQL`: `DELETE FROM idempotency_keys WHERE expires_at IS NOT NULL AND expires_at < ?`.
- **Methods** (each ≤50 lines, max depth 2):
  - `isProcessed(key)`: run SELECT with `nowIso()` for expiry comparison; return `row !== undefined`.
  - `markAsProcessed(key, ttlSeconds?)`: compute `expiresAt = ttlSeconds == null ? null : computeExpiry(ttlSeconds)`; run INSERT.
  - `clearExpired()`: run DELETE_EXPIRED with `nowIso()`.
- **Private helpers**: `computeExpiry(ttlSeconds: number): string` → `new Date(Date.now() + ttlSeconds * 1000).toISOString()`.
- **Notes**: `better-sqlite3` already a dependency (used by outbox). Use `import Database from 'better-sqlite3'` and `Database.Database` typing.

### 2.6 `src/idempotency/postgres-idempotency.repository.ts` *(new)*
- **Mirrors**: `src/outbox/postgres-outbox.repository.ts`.
- **Target lines**: <100.
- **Outline**: `PostgresIdempotencyRepository implements IdempotencyRepository`. Constructor takes `EntityManagerLike`. Defers DDL until first query (mirrors outbox lazy `ensureTable()` + `tableEnsured` flag).
- **SQL constants** (parameterized `$1..$n`):
  - `CREATE_TABLE_SQL`: `CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT)`.
  - `INSERT_SQL`: `INSERT INTO idempotency_keys (key, created_at, expires_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`.
  - `SELECT_EXISTS_SQL`: `SELECT 1 FROM idempotency_keys WHERE key = $1 AND (expires_at IS NULL OR expires_at >= $2) LIMIT 1`.
  - `DELETE_EXPIRED_SQL`: `DELETE FROM idempotency_keys WHERE expires_at IS NOT NULL AND expires_at < $1`.
- **Methods**: `isProcessed`, `markAsProcessed`, `clearExpired` — each calls `await this.ensureTable()` then queries. `ensureTable()` private method (mirrors outbox).
- **`isProcessed` body** (≤5 lines, depth 1): query rows, return `Array.isArray(rows) && rows.length > 0`.

### 2.7 `src/idempotency/memory-idempotency.repository.ts` *(new)*
- **Mirrors**: none (test-only repo; parallels outbox which has no in-memory backend).
- **Target lines**: <60.
- **Outline**: `MemoryIdempotencyRepository implements IdempotencyRepository`. Holds `private readonly store = new Map<string, { createdAt: string; expiresAt?: string | null }>()`.
- **Methods**:
  - `isProcessed(key)`: lookup; if missing → `false`; if present and `isExpired(entry, nowIso())` → `false` (treat expired as not processed); else `true`.
  - `markAsProcessed(key, ttlSeconds?)`: `store.set(key, { createdAt, expiresAt: ttlSeconds == null ? null : computeExpiry(ttlSeconds) })` — **no conflict logic** in memory (overwrite allowed, matches "first write wins only for durable backends"; for memory tests overwrite is acceptable and simpler). Document this behaviour inline.
  - `clearExpired()`: iterate entries, delete expired.
- **Private helpers**: `isExpired(entry, now)`, `computeExpiry(ttlSeconds)`.
- **Single-section rule**: `isProcessed` uses `if (isExpired(...))` (extracted method) rather than `if (entry && entry.expiresAt && entry.expiresAt < now)`.

### 2.8 `src/idempotency/idempotency.service.ts` *(new)*
- **Mirrors**: `src/outbox/outbox.service.ts` (deps-token constructor, private readonly fields, no processor).
- **Target lines**: <110.
- **Outline**:
  ```ts
  @Injectable()
  export class IdempotencyService {
    private readonly repository;
    private readonly logger;
    private readonly defaultTtlSeconds?: number;

    constructor(@Inject(IDEMPOTENCY_SERVICE_DEPS_TOKEN) deps: IdempotencyServiceDeps) { ... }

    async isDuplicate(event: AnyEventEnvelope<unknown>): Promise<boolean>;
    async markAsProcessed(event: AnyEventEnvelope<unknown>, ttlSeconds?: number): Promise<void>;
    async executeIfNotProcessed<T>(event, handler, ttlSeconds?): Promise<T | undefined>;
  }
  ```
- **Logic**:
  - `isDuplicate(event)`: `const key = buildIdempotencyKey(event)`; `const processed = await this.repository.isProcessed(key)`; return `processed`.
  - `markAsProcessed(event, ttlSeconds?)`: resolve effective ttl via `resolveTtl(ttlSeconds)` helper (returns `ttlSeconds ?? this.defaultTtlSeconds`); `await this.repository.markAsProcessed(key, resolvedTtl)`; log via `this.logger`.
  - `executeIfNotProcessed<T>(event, handler, ttlSeconds?)`: if `await this.isDuplicate(event)` → return `undefined`; else `const result = await handler()`; `await this.markAsProcessed(event, ttlSeconds)` (only after handler success); return `result`.
- **Private helpers** (≤2 params each):
  - `resolveTtl(explicit: number | undefined): number | undefined`.
  - handler success marking keeps depth ≤2.
- **Note**: do NOT mark processed if handler throws — handler errors propagate and leave the event unprocessed for retry. Document inline.

### 2.9 `src/idempotency/idempotency.module.ts` *(new)*
- **Mirrors**: `src/outbox/outbox.module.ts` (pair-token DI, resolveRepository, forRoot / forRootAsync).
- **Target lines**: <190.
- **Tokens** (private, module-scoped):
  - `IDEMPOTENCY_MODULE_OPTIONS_TOKEN = 'IDEMPOTENCY_MODULE_OPTIONS'`
  - `IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN = 'IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR'`
  - `IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN = 'IDEMPOTENCY_SERVICE_CONFIG_PAIR'`
  - `type IdempotencyServiceBaseDepsPair = Pick<IdempotencyServiceDeps, 'logger'>`
  - `type IdempotencyServiceConfigPair = Pick<IdempotencyServiceDeps, 'repository' | 'options'>`
- **`resolveRepository(options)`** private function:
  - `if options.type === 'postgres'` → require `options.postgres?.entityManager`; throw clear error if missing; return `new PostgresIdempotencyRepository(entityManager)`.
  - `if options.type === 'memory'` → return `new MemoryIdempotencyRepository()`.
  - else (sqlite) → `const dbPath = options.sqlite?.dbPath ?? ':memory:'`; return `new SqliteIdempotencyRepository(dbPath)`.
- **`forRoot(options)`**: builds repository, `serviceOptionsProvider` (useValue `options.serviceOptions ?? {}`), `baseDepsPairProvider` (inject `[EventLoggerService]`, returns `{ logger }`), `configPairProvider` (inject `[IDEMPOTENCY_REPOSITORY_TOKEN, IDEMPOTENCY_SERVICE_OPTIONS_TOKEN]`, returns `{ repository, options: serviceOpts }`), `depsProvider` (spread base + config). Returns `DynamicModule` exporting `[IDEMPOTENCY_REPOSITORY_TOKEN, IdempotencyService]`.
- **`forRootAsync(asyncOptions)`**: identical structure to outbox `forRootAsync` (moduleOptionsProvider → repositoryProvider → serviceOptionsProvider → baseDepsPairProvider → configPairProvider → depsProvider → IdempotencyService).
- **Note**: `IdempotencyService` base deps is only `logger` (no producer) — differs from outbox base deps (`producerService`, `logger`). Keep the pair split identical in shape.

### 2.10 `src/idempotency/index.ts` *(new — barrel)*
- **Mirrors**: `src/outbox/index.ts`.
- **Target lines**: <30.
- **Exports**: `IdempotencyModule`, `IDEMPOTENCY_REPOSITORY_TOKEN`, `IdempotencyRepository`, `IdempotencyEntry`, `IdempotencyModuleOptions`, `IdempotencyModuleAsyncOptions`, `SqliteIdempotencyRepository`, `PostgresIdempotencyRepository`, `MemoryIdempotencyRepository`, `IdempotencyService`, `IdempotencyServiceDeps`, `IDEMPOTENCY_SERVICE_DEPS_TOKEN`, `IdempotencyServiceOptions`, `IDEMPOTENCY_SERVICE_OPTIONS_TOKEN`, `buildIdempotencyKey`.

### 2.11 Top-level barrel `src/index.ts` *(edit — append)*
- Append `export * from './idempotency';` (follow existing per-module export style in `src/index.ts`).

### 2.12 `src/events-toolkit-options.interface.ts` *(edit)*
- **Mirrors**: `EventsToolkitOutboxOptions` + `EventsToolkitModuleOptions.outbox`.
- Add new interface `EventsToolkitIdempotencyOptions`:
  ```ts
  export interface EventsToolkitIdempotencyOptions {
    enabled?: boolean;                 // default: true; when false, skip wiring IdempotencyModule
    type: 'postgres' | 'sqlite' | 'memory';
    sqlitePath?: string;               // mirrors EventsToolkitOutboxOptions.sqlitePath naming
    postgres?: { entityManager: EntityManagerLike };
    serviceOptions?: IdempotencyServiceOptions;
  }
  ```
- Add field `idempotency?: EventsToolkitIdempotencyOptions;` to `EventsToolkitModuleOptions`.
- Import `IdempotencyServiceOptions` from `./idempotency/idempotency-service-options.interface`.

### 2.13 `src/events-toolkit-module.providers.ts` *(edit — add helper)*
- **Mirrors**: `buildOutboxModuleOptions`.
- Add `buildIdempotencyModuleOptions(opts: EventsToolkitIdempotencyOptions): IdempotencyModuleOptions` that maps `sqlitePath` → `sqlite.dbPath` (preserving outbox's naming-bridge convention) and forwards `type`, `postgres`, `serviceOptions`.

### 2.14 `src/events-toolkit.module.ts` *(edit)*
- **Mirrors**: outbox wiring in `buildSyncImports` / `buildAsyncImports` (gated on `options.outbox`).
- **Sync (`buildSyncImports`)**: after the outbox block, add
  ```ts
  if (options.idempotency?.enabled !== false) {
    imports.push(IdempotencyModule.forRoot(buildIdempotencyModuleOptions(options.idempotency)));
  }
  ```
  (When `options.idempotency` is undefined → `enabled !== false` is true, but the bridge helper would throw on missing `type`; therefore gate strictly on `options.idempotency` presence OR change condition to `if (options.idempotency && options.idempotency.enabled !== false)`.) **Decision**: require explicit `options.idempotency` — use `if (options.idempotency && options.idempotency.enabled !== false)`.
- **Async (`buildAsyncImports`)**: add `buildIdempotencyAsyncImport()` analogous to `buildOutboxAsyncImport()`, gated identically. Default when `opts.idempotency` undefined: skip (do not default to memory — avoid surprising users).
- Import `IdempotencyModule` and `IdempotencyModuleOptions` at top.

## 3. Technical Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Key = `${event.id}:${event.correlation_id}` | TODO item 3 guideline; both fields are validated UUIDs on the envelope. |
| D2 | `EntityManagerLike` reused from outbox | Avoids type duplication; single source of truth for the query-executor contract. |
| D3 | Pair-token DI mirrored exactly | Consistency with OutboxModule; enables future swap/test injection via config pair. |
| D4 | Repositories accept string `key`, not event | Keeps repo envelope-agnostic; key building lives in the service+util layer (single responsibility). |
| D5 | TTL optional; `expires_at` nullable ISO string | Matches outbox timestamp convention (ISO 8601 text columns). |
| D6 | SQLite inserts with `INSERT OR IGNORE` | Mirrors outbox Postgres `ON CONFLICT DO NOTHING` semantics; idempotent on retry. |
| D7 | Postgres DDL lazy (`ensureTable` + flag) | Mirrors outbox Postgres to avoid DDL during module construction (connection may not be ready). |
| D8 | SQLite DDL eager | Mirrors outbox SQLite (local file, always ready). |
| D9 | `MemoryIdempotencyRepository` overwrite-on-write | Simpler; acceptable for tests. Documented inline. |
| D10 | Service does NOT mark processed on handler throw | Allows retries; preserves idempotency guarantee. |
| D11 | `idempotency` gated behind explicit `options.idempotency` (async default skips) | Avoids accidental in-memory repo in prod; users opt in. |
| D12 | No background processor in this task | TODO item 3 lists only high/low-level methods; `clearExpired` is user-invoked. |

## 4. Test Plan (this task)

This Task 1 plan focuses on the core module. Tests follow the existing spec style (Jest `*.spec.ts` co-located). Add:

1. `src/idempotency/idempotency-key.util.spec.ts` — `buildIdempotencyKey` returns `id + ':' + correlation_id` for both `EventEnvelope` and `GlobalEventEnvelope` shapes.
2. `src/idempotency/memory-idempotency.repository.spec.ts` — `isProcessed` returns false initially, true after `markAsProcessed`; TTL expiry causes `isProcessed` to return false; `clearExpired` removes expired only.
3. `src/idempotency/idempotency.service.spec.ts` — using a `MockIdempotencyRepository` (local stub in the spec; NOT the shared `src/testing` mock — that is TODO item 6): `isDuplicate` delegates; `executeIfNotProcessed` runs handler and marks processed when not duplicate; returns `undefined` and does NOT run handler when duplicate; handler throw leaves event unprocessed.
4. `src/idempotency/sqlite-idempotency.repository.spec.ts` — uses `:memory:` DB; covers insert-or-ignore second `markAsProcessed` is a no-op; TTL expiry flips `isProcessed`; `clearExpired` purges.
5. `src/idempotency/postgres-idempotency.repository.spec.ts` — uses a fake `EntityManagerLike` capturing SQL + params; asserts `ON CONFLICT DO NOTHING` text, `$n` param ordering, lazy DDL (first query runs CREATE).
6. `src/idempotency/idempotency.module.spec.ts` — mirror `consumer.module.spec.ts` style: `forRoot({ type: 'postgres' })` without entityManager throws; `forRoot({ type: 'sqlite' })` resolves SqliteOutboxRepository-like provider; `forRoot({ type: 'memory' })` resolves Memory repo; `forRootAsync` resolves repository from factory.
7. Extend `src/events-toolkit.module.spec.ts` — assert `idempotency` option wires `IdempotencyModule` import (grep providers/exports) and absence omits it.

> Note: A shared `MockIdempotencyService` and `EventsToolkitTestModule` extension belong to TODO item 6 (testing support) — do NOT add them here. Spec-local stubs only.

## 5. Verification Checklist

- [ ] All new files ≤200 lines (ideally <125 excluding blanks/comments/imports).
- [ ] No method body >50 lines; no nesting >2 levels.
- [ ] No method with >2 params (TTL uses single optional number; events use single event arg).
- [ ] All boolean conditions are single-section (extract `isExpired`, `shouldWire` helpers).
- [ ] No commented-out code.
- [ ] Private members default (only public API: service methods, module `forRoot`/`forRootAsync`, public repo methods, `buildIdempotencyKey`).
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test -- idempotency` passes for new specs.
- [ ] `.agent/project-structure.md` updated to add `idempotency/` line (Implementer step, not this plan step).
- [ ] Plan re-compared to TODO items 1–3: every bullet covered (module + service + config-in-forRoot; interface + 3 repos; service high/low-level methods). TODO items 4–7 confirmed out of scope.