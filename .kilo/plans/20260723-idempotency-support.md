# Global Plan — Idempotency Support (20260722-todo-2)

## Objective

Provide consistent, configurable idempotency helpers that follow the same design patterns as the Outbox module (repository pattern, PostgreSQL and SQLite support, configurable via `forRoot()`).

## Global Pre-Analysis

### Reference Pattern: Outbox Module

The existing `src/outbox/` module is the canonical reference:

- `outbox.types.ts` — token, interfaces (`OutboxRepository`, `OutboxEntry`, `OutboxModuleOptions`), `EntityManagerLike`
- `outbox.module.ts` — `forRoot` / `forRootAsync` with pair-token DI pattern (`OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN`, `OUTBOX_SERVICE_CONFIG_PAIR_TOKEN`)
- `outbox.service.ts` — `@Injectable()`, injects `OUTBOX_SERVICE_DEPS_TOKEN`, convenience methods
- `sqlite-outbox.repository.ts` — `better-sqlite3`, WAL mode, `CREATE TABLE IF NOT EXISTS`, named params
- `postgres-outbox.repository.ts` — `EntityManagerLike`, deferred table creation, positional params, `ON CONFLICT (id) DO NOTHING`
- `outbox-service-deps.interface.ts` / `outbox-service-options.interface.ts` — separate files per rule
- `index.ts` — barrel re-exports

### Toolkit Integration Pattern

- `EventsToolkitModuleOptions` in `events-toolkit-options.interface.ts` adds a subsystem options block
- `EventsToolkitModule.forRoot()` / `forRootAsync()` in `events-toolkit.module.ts` conditionally imports the sub-module via `buildSyncImports` / `buildAsyncImports`
- `events-toolkit-module.providers.ts` has a builder function (e.g., `buildOutboxModuleOptions`) that maps toolkit-level options to module-level options

### Consumer Decorator Pattern

- `OnEventOptions` / `OnEventMetadata` in `on-event.decorator.ts` store metadata via `SetMetadata`
- `OnEventExplorer` scans instances at `OnModuleInit`, reads metadata via `Reflector`, registers handlers with `ConsumerService`
- `OnEventExplorerDeps` provides `discovery`, `reflector`, `consumerService`

### Discovery Manifest Pattern

- `ServiceManifestDto` in `dto/service-manifest.dto.ts` has `name`, `version`, `description`, `instanceId`, `consumes`, `produces`
- No `capabilities` field exists yet — must be added
- `DiscoveryModuleOptions` in `discovery.module.ts` is the resolved shape; `EventsToolkitDiscoveryOptions` in `discovery-service-options.interface.ts` is the user-facing shape
- `ManifestService.generateManifest(serviceInfo)` builds the base manifest; `ManifestContributorMerger.merge()` merges contributor entries

### Testing Pattern

- `EventsToolkitTestModule.forRoot()` registers mock pairs (`MockXxxService` + `{ provide: RealService, useExisting: MockXxxService }`)
- `MockOutboxService` mirrors `OutboxService` public API, records in-memory
- `src/testing/index.ts` barrel exports mocks (not re-exported from main `src/index.ts`)

### Key Design Decisions

1. **Idempotency Key**: `${event.id}:${event.correlation_id}` — uses the event's UUIDv7 id plus correlation_id for cross-chain deduplication.
2. **TTL Support**: `markAsProcessed` accepts optional `ttlSeconds`. Repositories store an `expires_at` timestamp; `clearExpired()` removes stale entries.
3. **Table Schema** (SQLite/Postgres): `idempotency_keys` table with columns `key TEXT PRIMARY KEY`, `created_at TEXT NOT NULL`, `expires_at TEXT`.
4. **Automatic Consumer Integration**: `@OnEvent('type', { idempotent: true })` flag. `OnEventExplorer` wraps the handler with idempotency check when flag is set and `IdempotencyService` is available.
5. **Discovery Capabilities**: Add `capabilities?: string[]` to `ServiceManifestDto`, `DiscoveryModuleOptions`, and `EventsToolkitDiscoveryOptions`. `EventsToolkitModule` injects `['idempotency']` when idempotency is enabled.
6. **Memory Repository**: `MemoryIdempotencyRepository` uses a `Map<string, { createdAt, expiresAt? }>` for unit testing.

---

## Step 2: Git Feature Branch Setup

**Agent**: implementer
**Scope**: 
- Run `git status`, commit any unstaged files
- Switch to `main`, merge if needed
- Create branch `feat/idempotency-support`

---

## Step 3: Version Update

**Agent**: implementer
**Scope**: 
- Read `package.json`, increment minor version (new feature)
- Commit as `chore: bump version to x.y.z`

---

## Task 1: Core Idempotency Module

**Covers TODO tasks**: 1 (Module Setup), 2 (Repository Pattern), 3 (IdempotencyService)

### 4.1 Analysis & Planning

**Agent**: architector
**Scope**: 
- Confirm exact file paths and interface shapes mirroring outbox
- Define `IdempotencyRepository` interface methods
- Define table schemas for SQLite and Postgres
- Plan `IdempotencyService` public API
- Save plan to `.kilo/plans/20260723-idempotency-core-task1.md`

**Expected output files**:
- `src/idempotency/idempotency.types.ts`
- `src/idempotency/idempotency-service-options.interface.ts`
- `src/idempotency/idempotency-service-deps.interface.ts`
- `src/idempotency/idempotency.module.ts`
- `src/idempotency/idempotency.service.ts`
- `src/idempotency/sqlite-idempotency.repository.ts`
- `src/idempotency/postgres-idempotency.repository.ts`
- `src/idempotency/memory-idempotency.repository.ts`
- `src/idempotency/index.ts`

### 4.2 Implementation

**Agent**: implementer
**Scope**: 
- Create all 9 files in `src/idempotency/` following the outbox pattern exactly
- Ensure `IdempotencyModule.forRoot` / `forRootAsync` use pair-token DI
- Ensure `IdempotencyService` provides `isDuplicate`, `markAsProcessed`, `executeIfNotProcessed`
- Ensure repositories implement `isProcessed`, `markAsProcessed`, `clearExpired`
- Commit with meaningful messages

### 4.3 Code Review & Simplification

**Agents**: code-reviewer + code-simplifier (concurrent)
**Scope**: 
- Review for correctness, pattern adherence, and rule compliance (max 200 lines/file, max 50 lines/method, max 2 params, max 2 depth)
- Simplify where possible
- Generate fix/simplification plans in `.kilo/plans/20260723-idempotency-core-task1-review.md`

**Plan Agent**: review both plans, assign fixes to implementer if needed.

### 4.4 Documentation

**Agent**: docs-specialist
**Scope**: 
- Add JSDoc/TSDoc to all new `src/idempotency/` files
- Add cross-links in JSDoc to outbox equivalents
- Ensure all public symbols have documentation comments

### 4.5 Verification

**Agent**: architector
**Scope**: 
- Check implementation against 4.1 plan
- Verify file sizes, method lengths, param counts
- Verify all interfaces match outbox patterns
- Report any deviations

### 4.6 Task Completion

**Agent**: implementer
**Scope**: 
- Mark TODO tasks 1, 2, 3 as `[DONE]` in `.agent/todos/20260722/20260722-todo-2.md`
- Commit completion

---

## Task 2: Toolkit Integration, Consumer, Discovery & Testing

**Covers TODO tasks**: 4 (Consumer Integration), 5 (Discovery Integration), 6 (Test & Testing Support), plus wiring into `EventsToolkitModule`

### 4.1 Analysis & Planning

**Agent**: architector
**Scope**: 
- Plan all file modifications needed for integration
- Define exact changes to `OnEventOptions` / `OnEventMetadata`
- Plan `OnEventExplorer` idempotency wrapping logic
- Plan `ServiceManifestDto` capabilities extension
- Plan `EventsToolkitDiscoveryOptions` / `DiscoveryModuleOptions` capabilities field
- Plan `EventsToolkitModuleOptions` idempotency block
- Plan `EventsToolkitModule` conditional import wiring
- Plan `EventsToolkitTestModule` and `MockIdempotencyService`
- Save plan to `.kilo/plans/20260723-idempotency-integration-task2.md`

**Expected files to modify/create**:
- `src/events-toolkit-options.interface.ts` — add `EventsToolkitIdempotencyOptions`
- `src/events-toolkit.module.ts` — add idempotency conditional import
- `src/events-toolkit-module.providers.ts` — add `buildIdempotencyModuleOptions`
- `src/consumer/decorators/on-event.decorator.ts` — add `idempotent?: boolean` to options
- `src/consumer/decorators/on-event.explorer.ts` — wrap handlers when idempotent + IdempotencyService available
- `src/consumer/decorators/on-event-explorer-deps.interface.ts` — add optional `idempotencyService`
- `src/consumer/consumer-module.providers.ts` — inject IdempotencyService into explorer deps
- `src/discovery/dto/service-manifest.dto.ts` — add `capabilities?: string[]`
- `src/discovery/discovery-service-options.interface.ts` — add `capabilities?: string[]`
- `src/discovery/discovery.module.ts` — pass capabilities through `DiscoveryModuleOptions`
- `src/discovery/discovery.service.ts` — inject capabilities into manifest
- `src/discovery/manifest-contributor.merger.ts` — merge capabilities from contributors (optional)
- `src/testing/mock-idempotency.service.ts` — new mock
- `src/testing/events-toolkit-test.module.ts` — register mock pair
- `src/testing/events-toolkit-test-options.interface.ts` — add idempotency test options if needed
- `src/testing/index.ts` — export mock
- `src/index.ts` — add `export * from './idempotency';`

### 4.2 Implementation

**Agent**: implementer
**Scope**: 
- Make all modifications per the 4.1 plan
- Ensure backward compatibility (all new fields optional)
- Ensure `EventsToolkitModule.forRoot` and `forRootAsync` both wire idempotency
- Ensure `MockIdempotencyService` mirrors `IdempotencyService` API
- Commit with meaningful messages after each subsystem

### 4.3 Code Review & Simplification

**Agents**: code-reviewer + code-simplifier (concurrent)
**Scope**: 
- Review integration code for correctness and pattern adherence
- Check that existing modules (consumer, discovery) are not broken
- Simplify complex conditions and extractions per rules
- Generate fix/simplification plans in `.kilo/plans/20260723-idempotency-integration-task2-review.md`

**Plan Agent**: review and assign fixes.

### 4.4 Documentation

**Agent**: docs-specialist
**Scope**: 
- Add JSDoc to all modified files
- Update any affected existing documentation references
- Ensure `MockIdempotencyService` has usage documentation

### 4.5 Verification

**Agent**: architector
**Scope**: 
- Verify integration plan adherence
- Run typecheck/lint if available
- Check that no existing tests are broken
- Report deviations

### 4.6 Task Completion

**Agent**: implementer
**Scope**: 
- Mark TODO tasks 4, 5, 6 as `[DONE]` in `.agent/todos/20260722/20260722-todo-2.md`
- Commit completion

---

## Task 3: Documentation & Examples

**Covers TODO task**: 7 (Documentation & Examples)

### 4.1 Analysis & Planning

**Agent**: architector
**Scope**: 
- Plan documentation structure mirroring `docs/outbox-configuration.md`
- Define sections: Why Idempotency, Configuration (Postgres/SQLite/Memory), Usage Patterns (manual/auto), Best Practices for Key Generation, Examples
- Plan README updates (new section, onboarding flow step reference)
- Plan CHANGELOG entry format following existing style
- Save plan to `.kilo/plans/20260723-idempotency-docs-task3.md`

**Expected files**:
- `docs/idempotency.md` — main documentation
- `README.md` — add idempotency section and onboarding flow step
- `CHANGELOG.md` — add entry for new version

### 4.2 Implementation

**Agent**: implementer
**Scope**: 
- Write `docs/idempotency.md` with full sections, TOC, code examples
- Update `README.md` with idempotency quick-reference and onboarding flow step
- Update `CHANGELOG.md` with detailed feature description
- Commit

### 4.3 Code Review & Simplification

**Agents**: code-reviewer + code-simplifier (concurrent)
**Scope**: 
- Review docs for clarity, accuracy, and completeness
- Check code examples for correctness
- Simplify verbose explanations
- Generate fix plans in `.kilo/plans/20260723-idempotency-docs-task3-review.md`

**Plan Agent**: review and assign fixes.

### 4.4 Documentation

**Agent**: docs-specialist
**Scope**: 
- Add cross-links between `docs/idempotency.md` and related docs (`outbox-configuration.md`, `event-messaging-convention.md`, `testing-utilities.md`)
- Ensure README links are correct
- Add JSDoc examples to key public methods if not already present

### 4.5 Verification

**Agent**: architector
**Scope**: 
- Verify docs against acceptance criteria
- Check all links work
- Verify CHANGELOG format matches project style
- Report deviations

### 4.6 Task Completion

**Agent**: implementer
**Scope**: 
- Mark TODO task 7 as `[DONE]` in `.agent/todos/20260722/20260722-todo-2.md`
- Commit completion

---

## Step 5: TODO File Completion

**Agent**: implementer
**Scope**: 
- Rename `.agent/todos/20260722/20260722-todo-2.md` to `.agent/todos/20260722/20260722-todo-2-DONE.md`
- Ensure all files committed in feature branch
- Switch to `main`, merge `feat/idempotency-support`
- On success: delete feature branch
- If `origin` remote set: push `main` to `origin`

---

## Acceptance Criteria Checklist

- [ ] Idempotency works consistently with PostgreSQL and SQLite (same as Outbox)
- [ ] Configuration is done via `EventsToolkitModule.forRoot()`
- [ ] `IdempotencyService` provides both low-level (`isDuplicate`, `markAsProcessed`) and high-level (`executeIfNotProcessed`) methods
- [ ] `@OnEvent` decorator supports optional `{ idempotent: true }` flag
- [ ] Service manifest includes `idempotency` in `capabilities` when enabled
- [ ] Documentation clearly explains when and how to use it
- [ ] Tests can easily mock idempotency checks via `MockIdempotencyService`
- [ ] No breaking changes to existing APIs
- [ ] All new code follows project rules (max 200 lines/file, max 50 lines/method, max 2 depth, max 2 params)
