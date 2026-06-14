# Global Plan — Outbox, Logging, Polish & Finalization

**TODO File**: `.agent/todos/20260612/20260612-todo-0.md`
**Date**: 2026-06-13
**Library**: `@cobranza-apps/events-toolkit`

---

## Global Pre-Analysis

The `events-toolkit` library is an existing NestJS library with well-structured modules (Producer, Consumer, Request-Reply, Logging, Common). The codebase follows strict rules (max 200 lines/file, max 50 lines/method, max 2 params, max 2 depth, self-documenting code, no commented code, prefer private members).

**Current State**: The `src/outbox/` directory is empty (only `.gitkeep`). The `EventLoggerService` exists but lacks outbox-specific logging methods. The `index.ts` exports are comprehensive but will need updates for new outbox and DLQ exports. No `createEvent` factory exists yet. The `EventContext` interface exists but the `createEvent()` factory mentioned in `brief.md` is missing.

**Key Dependencies**: `better-sqlite3` is already in `package.json`. Winston is already present. TypeORM is not a dependency (Postgres outbox assumes TypeORM is provided by the consuming microservice).

**Architecture Notes**:
- All modules are DynamicModules with `forRoot()` / `forRootAsync()` patterns.
- The producer module uses `JETSTREAM_TOKEN` injection.
- The consumer module uses complex dependency injection with multiple tokens.
- The library is a peer dependency pattern — consuming microservices provide NATS connections.

---

## Step 2: Git Feature Branch Setup

**Sub-agent**: `implementer`
- Switch to `main` branch.
- Commit any unstaged changes (if needed).
- Create feature branch: `feat/outbox-logging-polish-finalization`.
- Switch to the new branch.

---

## Step 3: Version Update

**Sub-agent**: `implementer`
- Current version: `0.2.0` in `package.json`.
- Bump to `0.3.0` (minor — new features: outbox, logging enhancements, DLQ helpers).
- Commit: `chore: bump version to 0.3.0`.

---

## Task 1: Outbox Module – Configurable Design

### Pre-Analysis
Implement the core outbox infrastructure with strategy pattern for multiple storage backends. The interface must be clean and the module must be configurable via `forRoot()`. SQLite is the default; Postgres is optional for `ms-db-gateway`.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Research NestJS DynamicModule patterns for strategy-based configuration.
- Design the `OutboxRepository` interface and `OutboxEntry` entity.
- Design `OutboxModuleOptions` with `type: 'sqlite' | 'postgres'`.
- Plan file structure: `outbox.module.ts`, `outbox-repository.interface.ts`, `outbox-entry.interface.ts`, `sqlite-outbox.repository.ts`, `postgres-outbox.repository.ts`.
- Generate implementation plan with detailed steps and code snippets.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/outbox/outbox-repository.interface.ts`.
- Create `src/outbox/outbox-entry.interface.ts`.
- Create `src/outbox/outbox.module.ts` (DynamicModule with `forRoot` / `forRootAsync`).
- Create `src/outbox/sqlite-outbox.repository.ts`.
- Create `src/outbox/postgres-outbox.repository.ts` (lightweight, assumes TypeORM EntityManager).
- Commit with meaningful messages.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review for rule compliance (max lines, max depth, max params, no comments).
- Check NestJS DynamicModule patterns.
- Verify SQLite WAL mode and transaction safety.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Add JSDoc comments to all public interfaces, classes, and methods.
- Document configuration options.

### 4.5 Verification
**Sub-agent**: `implementer`
- Check plan adherence.
- Run `npm run build` to verify compilation.
- Commit any fixes.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 1 in TODO file.
- Commit.

---

## Task 2: Outbox Service

### Pre-Analysis
Build the main `OutboxService` that orchestrates saving events and running the background processor. The processor must publish pending events via `ProducerService`, handle retries, and move to DLQ on final failure.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design `OutboxService` with `saveToOutbox()` and `startProcessor()` / `stopProcessor()`.
- Design processor loop with configurable interval.
- Design retry logic with exponential backoff.
- Design DLQ routing on max retries.
- Plan graceful shutdown integration.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/outbox/outbox.service.ts`.
- Update `src/outbox/outbox.module.ts` to export `OutboxService`.
- Add `buildDlqSubject(subject)` helper.
- Add processor enable/disable via config.
- Ensure WAL mode is enabled for SQLite.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review processor loop for memory leaks and error handling.
- Verify retry logic and DLQ routing.
- Check graceful shutdown patterns.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Add JSDoc to `OutboxService` and processor methods.

### 4.5 Verification
**Sub-agent**: `implementer`
- Check plan adherence.
- Run `npm run build`.
- Commit.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 2 in TODO file.
- Commit.

---

## Task 3: Logging Integration

### Pre-Analysis
Enhance `EventLoggerService` with outbox-specific methods. Ensure structured logging covers all critical paths: publish, consume, validation, outbox operations, DLQ moves.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design additional logging methods: `logOutboxSaved`, `logOutboxPublished`, `logOutboxFailed`, `logOutboxDlq`.
- Ensure Winston format includes timestamps, JSON, and context.
- Plan minimal changes to existing logger.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Update `src/logging/event-logger.service.ts` with new methods.
- Add `OutboxLogContext` interface.
- Ensure existing methods remain unchanged.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review logging consistency.
- Verify no breaking changes to existing API.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Update JSDoc for new methods.

### 4.5 Verification
**Sub-agent**: `implementer`
- Check plan adherence.
- Run `npm run build`.
- Commit.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 3 in TODO file.
- Commit.

---

## Task 4: Event Context & Helpers

### Pre-Analysis
Finalize `EventContext` and implement the missing `createEvent()` factory function. The factory should auto-fill metadata like `id`, `produced_at`, `producer`, etc.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design `createEvent()` factory signature.
- Plan auto-fill behavior for `id`, `produced_at`.
- Ensure type safety with generics.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/common/utils/event.factory.ts`.
- Implement `createEvent<T>()` with auto-filled metadata.
- Add `company_id` validation helper.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review factory implementation.
- Verify validation rules.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Add JSDoc to `createEvent`.

### 4.5 Verification
**Sub-agent**: `implementer`
- Check plan adherence.
- Run `npm run build`.
- Commit.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 4 in TODO file.
- Commit.

---

## Task 5: Final Polish & Configuration

### Pre-Analysis
Create a unified `EventsToolkitModule.forRoot()` that wraps all sub-modules with comprehensive configuration. Add DLQ helpers, shutdown hooks, and security checks.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Design `EventsToolkitModule` with `forRoot(options)`.
- Design options interface covering NATS, outbox, logging.
- Plan graceful shutdown integration using NestJS `OnModuleDestroy`.
- Plan `buildDlqSubject()` helper.
- Plan input sanitization utilities.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create `src/events-toolkit.module.ts`.
- Implement `forRoot()` with comprehensive options.
- Add `buildDlqSubject()` helper.
- Add shutdown hooks for outbox processor.
- Add input sanitization utilities.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review module composition.
- Verify shutdown patterns.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document configuration options.

### 4.5 Verification
**Sub-agent**: `implementer`
- Check plan adherence.
- Run `npm run build`.
- Commit.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 5 in TODO file.
- Commit.

---

## Task 6: Documentation & DX

### Pre-Analysis
Update README.md with installation, setup, and clear examples. Add documentation for both SQLite and Postgres outbox configurations. Update docs folder.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Plan README sections: installation, module registration, producer/consumer examples, outbox usage, request-reply, AI agent guidelines.
- Plan new docs folder file: `docs/outbox-configuration.md`.
- Ensure README links to new docs.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Update `README.md` with comprehensive content.
- Create `docs/outbox-configuration.md`.
- Create `docs/ai-agent-guidelines.md` if needed.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review documentation for accuracy.
- Verify code examples compile.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Final proofreading and formatting.

### 4.5 Verification
**Sub-agent**: `implementer`
- Check plan adherence.
- Verify all links work.
- Commit.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 6 in TODO file.
- Commit.

---

## Task 7: Exports & Public API

### Pre-Analysis
Clean up `src/index.ts` and create barrel files for a clean public API. Ensure all new exports are included and organized.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Plan barrel files: `common/index.ts`, `producer/index.ts`, `consumer/index.ts`, `outbox/index.ts`, `logging/index.ts`.
- Plan `src/index.ts` reorganization.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Create barrel files.
- Update `src/index.ts`.
- Ensure no circular dependencies.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review export completeness.
- Check for circular dependencies.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document public API organization.

### 4.5 Verification
**Sub-agent**: `implementer`
- Check plan adherence.
- Run `npm run build`.
- Commit.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 7 in TODO file.
- Commit.

---

## Task 8: Testing & Build

### Pre-Analysis
Add unit tests for critical parts, ensure build works cleanly, verify linting/formatting setup.

### 4.1 Analysis & Planning
**Sub-agent**: `architect`
- Plan test files: `outbox.service.spec.ts`, `sqlite-outbox.repository.spec.ts`, `event.factory.spec.ts`, `subject.builder.spec.ts` (if missing), `envelope.validation.spec.ts`.
- Verify existing test suite runs.
- Verify lint/format scripts work.

### 4.2 Implementation
**Sub-agent**: `implementer`
- Write unit tests for new components.
- Ensure `npm run build` passes.
- Add any missing linting/formatting config.
- Commit.

### 4.3 Code Review
**Sub-agent**: `code-reviewer`
- Review test coverage.
- Verify test quality.

### 4.4 Documentation
**Sub-agent**: `docs-specialist`
- Document test running instructions.

### 4.5 Verification
**Sub-agent**: `implementer`
- Run full test suite.
- Run `npm run build`.
- Run `npm run lint`.
- Commit fixes.

### 4.6 Task Completion
**Sub-agent**: `implementer`
- Append `[DONE]` to Task 8 in TODO file.
- Commit.

---

## Step 5: TODO File Completion

**Sub-agent**: `implementer`
- Rename TODO file: `20260612-todo-0.md` → `20260612-todo-0-DONE.md`.
- Ensure all files are committed in feature branch.
- Switch to `main`.
- Merge feature branch.
- Delete feature branch.
- Push `main` to `origin`.

---

## Summary of Sub-agent Delegations

| Step | Task | Sub-agent | Description |
|------|------|-----------|-------------|
| 2 | — | implementer | Git branch setup |
| 3 | — | implementer | Version bump |
| 4.1 | Task 1 | architect | Outbox Module design |
| 4.2 | Task 1 | implementer | Outbox Module implementation |
| 4.3 | Task 1 | code-reviewer | Review Task 1 |
| 4.4 | Task 1 | docs-specialist | Document Task 1 |
| 4.5 | Task 1 | implementer | Verify Task 1 |
| 4.6 | Task 1 | implementer | Mark Task 1 done |
| 4.1 | Task 2 | architect | Outbox Service design |
| 4.2 | Task 2 | implementer | Outbox Service implementation |
| 4.3 | Task 2 | code-reviewer | Review Task 2 |
| 4.4 | Task 2 | docs-specialist | Document Task 2 |
| 4.5 | Task 2 | implementer | Verify Task 2 |
| 4.6 | Task 2 | implementer | Mark Task 2 done |
| 4.1 | Task 3 | architect | Logging design |
| 4.2 | Task 3 | implementer | Logging implementation |
| 4.3 | Task 3 | code-reviewer | Review Task 3 |
| 4.4 | Task 3 | docs-specialist | Document Task 3 |
| 4.5 | Task 3 | implementer | Verify Task 3 |
| 4.6 | Task 3 | implementer | Mark Task 3 done |
| 4.1 | Task 4 | architect | Event Context & Helpers design |
| 4.2 | Task 4 | implementer | Event Context & Helpers implementation |
| 4.3 | Task 4 | code-reviewer | Review Task 4 |
| 4.4 | Task 4 | docs-specialist | Document Task 4 |
| 4.5 | Task 4 | implementer | Verify Task 4 |
| 4.6 | Task 4 | implementer | Mark Task 4 done |
| 4.1 | Task 5 | architect | Final Polish & Configuration design |
| 4.2 | Task 5 | implementer | Final Polish & Configuration implementation |
| 4.3 | Task 5 | code-reviewer | Review Task 5 |
| 4.4 | Task 5 | docs-specialist | Document Task 5 |
| 4.5 | Task 5 | implementer | Verify Task 5 |
| 4.6 | Task 5 | implementer | Mark Task 5 done |
| 4.1 | Task 6 | architect | Documentation & DX design |
| 4.2 | Task 6 | implementer | Documentation & DX implementation |
| 4.3 | Task 6 | code-reviewer | Review Task 6 |
| 4.4 | Task 6 | docs-specialist | Document Task 6 |
| 4.5 | Task 6 | implementer | Verify Task 6 |
| 4.6 | Task 6 | implementer | Mark Task 6 done |
| 4.1 | Task 7 | architect | Exports & Public API design |
| 4.2 | Task 7 | implementer | Exports & Public API implementation |
| 4.3 | Task 7 | code-reviewer | Review Task 7 |
| 4.4 | Task 7 | docs-specialist | Document Task 7 |
| 4.5 | Task 7 | implementer | Verify Task 7 |
| 4.6 | Task 7 | implementer | Mark Task 7 done |
| 4.1 | Task 8 | architect | Testing & Build design |
| 4.2 | Task 8 | implementer | Testing & Build implementation |
| 4.3 | Task 8 | code-reviewer | Review Task 8 |
| 4.4 | Task 8 | docs-specialist | Document Task 8 |
| 4.5 | Task 8 | implementer | Verify Task 8 |
| 4.6 | Task 8 | implementer | Mark Task 8 done |
| 5 | — | implementer | TODO completion & merge |
