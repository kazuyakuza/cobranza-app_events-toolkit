# Global Plan — TODO List #5: Testing, Outbox Polish & DLQ Improvements

**TODO File:** `.agent/todos/20260616/20260616-todo-0.md`  
**Date:** 2026-06-16  
**Branch:** `feat/testing-outbox-dlq-docs` (to be created)  
**Version Bump:** 0.4.0 → 0.5.0 (minor — new features: testing module, transactional outbox, DLQ improvements, docs)

---

## Global Pre-Analysis

The project is a mature NestJS library (`@cobranza-apps/events-toolkit` v0.4.0) providing NATS+JetStream event infrastructure. It already has:

- **Producer/Consumer/Request-Reply/Outbox/Logging** modules with extensive unit tests
- **SQLite & PostgreSQL** outbox backends
- **DLQ routing** via `EventConsumerException` in `JetStreamConsumerService`
- **Request-reply** sync (`request()`) and async (`sendRequest()` + `@OnRequestReply`) patterns
- **Comprehensive docs** in `docs/` and a detailed README

### Gaps Identified by the TODO

1. **No testing module** — Consumers must manually mock `ProducerService`, `ConsumerService`, `OutboxService`, etc. No centralized test utilities.
2. **No transactional outbox API** — `OutboxService.saveToOutbox()` is non-transactional. `ms-db-gateway` needs `saveInTransaction()` with TypeORM `QueryRunner`.
3. **DLQ improvements needed** — `buildDlqSubject` exists in `outbox.utils.ts` but not in `subject.builder.ts`; `EventConsumerException` lacks `dlqReason`, `originalSubject`, `retryCount`; `JetStreamConsumerService` routes to DLQ immediately on `EventConsumerException` without retry count.
4. **Request-Reply + Outbox integration gap** — `sendRequestThroughOutbox()` exists but lacks a generic `AsyncRequestOptions` signature; docs need updating with combined patterns.
5. **Documentation gaps** — No "Outbox Usage Guidelines" doc; request-reply docs lack decision tree performance trade-offs; some docs need indexes and copy-pasteable examples.

---

## Step 2: Git Feature Branch Setup

**Agent:** `implementer`  
**Instructions:**
- Run `git status` and commit any unstaged files.
- Ensure on `main` branch (already there per `.git/HEAD`).
- Create and switch to `feat/testing-outbox-dlq-docs`.

---

## Step 3: Version Update

**Agent:** `implementer`  
**Instructions:**
- Bump `package.json` version from `0.4.0` to `0.5.0`.
- Commit: `chore: bump version to 0.5.0`.

---

## Task 1: Testing Utilities

### Task 1 Pre-Analysis

The library currently has no dedicated testing utilities. Consumers of the library (microservice developers) need to mock `ProducerService`, `ConsumerService`, `OutboxService`, `RequestReplyService`, and `JetStreamConsumerService` in their own unit tests. The task requires:

- `MockProducerService` — records all published events for assertions
- `MockConsumerService` — simulates incoming messages
- `EventsToolkitTestModule.forRoot()` — a NestJS dynamic module that replaces real services with mocks
- Assertion helpers — e.g., `expectEventPublished(mockProducer, subject, envelopeMatcher)`
- Example test cases in docs

**Key design decisions:**
- `MockProducerService` will implement the same interface as `ProducerService` (publish, emit) but store events in-memory.
- `MockConsumerService` will simulate `dispatch()` calls.
- `EventsToolkitTestModule` will use NestJS `overrideProvider` pattern or provide mock implementations with the same injection tokens.
- All testing utilities go under `src/testing/` with a barrel export.
- Must follow existing rules: max 200 lines per file, max 50 lines per method, max 2 depth, max 2 params, prefer private members, self-documenting code, no commented code.

### Task 1: 4.1 Analysis & Planning

**Agent:** `architect`  
**Output:** `.kilo/plans/20260616-task1-testing-utilities.md`

**Scope:**
- Design `MockProducerService` with `getPublishedEvents()`, `clear()`, `getLastEvent()`, `getEventsBySubject(subject)`.
- Design `MockConsumerService` with `simulateEvent(subject, envelope)`, `getHandledEvents()`, `clear()`.
- Design `EventsToolkitTestModule.forRoot()` as a `DynamicModule` that overrides `ProducerService`, `ConsumerService`, `OutboxService`, `RequestReplyService`, `JetStreamConsumerService` with mocks.
- Design assertion helpers: `expectEventPublished()`, `expectEventWithSubject()`, `expectEventWithData()`.
- Create `src/testing/` directory with index barrel.
- Add example doc file `docs/testing-utilities.md` with copy-pasteable test examples.
- Write unit tests for the testing utilities themselves.

### Task 1: 4.2 Implementation

**Agent:** `implementer`  
**Plan:** Execute steps from `20260616-task1-testing-utilities.md`.

### Task 1: 4.3 Code Review

**Agent:** `code-reviewer`  
**Output:** `.kilo/plans/20260616-task1-testing-utilities-fix.md` (if needed)  
**Fix Agent:** `implementer`

### Task 1: 4.4 Documentation

**Agent:** `docs-specialist`  
**Scope:**
- Add JSDoc comments to all testing utilities.
- Write `docs/testing-utilities.md` with complete examples.
- Update README to link to testing utilities doc.

### Task 1: 4.5 Verification

**Agent:** `architect`  
**Scope:** Verify all testing utilities are exported, tests pass, and README links are correct.

### Task 1: 4.6 Task Completion

**Agent:** `implementer`  
**Scope:** Add `[DONE]` to Task 1 in TODO file and commit.

---

## Task 2: Outbox Transactional Hook

### Task 2 Pre-Analysis

The current `OutboxService.saveToOutbox()` saves the event immediately using the repository. For `ms-db-gateway` (PostgreSQL + TypeORM), the event must be saved inside the same database transaction as the business logic. The task requires:

- A `TransactionContext` interface supporting TypeORM `QueryRunner` and future extensibility
- `OutboxService.saveInTransaction(event, subject, transactionContext)` that delegates to the repository
- The repository must support transactional inserts when a `QueryRunner` is provided
- For SQLite services, the API should still work (the SQLite backend is single-file, so full atomicity is less critical but the API stays uniform)

**Key design decisions:**
- `TransactionContext` will be a union type: `TypeORMQueryRunnerContext | SqliteTransactionContext | ...`.
- `PostgresOutboxRepository` already uses `EntityManagerLike` (which has `query()`). TypeORM `QueryRunner` also has `query()`, so `EntityManagerLike` is compatible. However, to ensure the insert runs in the same transaction, the repository must use the same `QueryRunner` instance that the business logic is using.
- Add a `saveInTransaction` method to `OutboxRepository` interface, or extend `SaveOutboxEntryParams` with an optional `transactionContext`.
- Alternatively, the `PostgresOutboxRepository` can accept the `entityManager` at method call time (but currently it takes it in constructor). For `ms-db-gateway`, the `QueryRunner` is created per-request. So the `OutboxRepository` needs to accept the transaction context per-save.
- Best approach: Add `transactionContext?: TransactionContext` to `SaveOutboxEntryParams`, and update `PostgresOutboxRepository.save()` to use the transaction context's `queryRunner` if provided, otherwise fall back to the constructor `entityManager`.
- For `SqliteOutboxRepository`, the `transactionContext` is ignored (SQLite doesn't have a separate QueryRunner per request in this context), but the API stays uniform.
- Document the difference between `saveToOutbox` and `saveInTransaction` clearly.

### Task 2: 4.1 Analysis & Planning

**Agent:** `architect`  
**Output:** `.kilo/plans/20260616-task2-transactional-outbox.md`

**Scope:**
- Design `TransactionContext` interface (supporting TypeORM `QueryRunner` via `EntityManagerLike` interface).
- Update `OutboxRepository` interface to accept `transactionContext` in `save`.
- Update `PostgresOutboxRepository.save()` to use transaction context when provided.
- Update `OutboxService.saveToOutbox()` to pass optional transaction context.
- Add `OutboxService.saveInTransaction()` as a convenience method.
- Write tests for transactional save (using a mock QueryRunner).
- Update `docs/outbox-configuration.md` and create `docs/outbox-usage-guidelines.md` with TypeORM examples.

### Task 2: 4.2 Implementation

**Agent:** `implementer`  
**Plan:** Execute steps from `20260616-task2-transactional-outbox.md`.

### Task 2: 4.3 Code Review

**Agent:** `code-reviewer`  
**Output:** `.kilo/plans/20260616-task2-transactional-outbox-fix.md` (if needed)  
**Fix Agent:** `implementer`

### Task 2: 4.4 Documentation

**Agent:** `docs-specialist`  
**Scope:**
- Document `TransactionContext` interface and `saveInTransaction` method.
- Write `docs/outbox-usage-guidelines.md` with:
  - When to use transactional vs normal `saveToOutbox`
  - SQLite vs Postgres configuration
  - Complete TypeORM transaction example
- Update README with `saveInTransaction` example.

### Task 2: 4.5 Verification

**Agent:** `architect`  
**Scope:** Verify transactional behavior, test coverage, and doc completeness.

### Task 2: 4.6 Task Completion

**Agent:** `implementer`  
**Scope:** Add `[DONE]` to Task 2 in TODO file and commit.

---

## Task 3: DLQ Improvements

### Task 3 Pre-Analysis

Current DLQ behavior:
- `buildDlqSubject` exists in `src/outbox/outbox.utils.ts` but is NOT in `src/common/utils/subject.builder.ts`.
- `EventConsumerException` currently has `eventId`, `eventType`, `correlationId`, `cause`. It lacks `dlqReason`, `originalSubject`, `retryCount`.
- `JetStreamConsumerService` routes `EventConsumerException` to DLQ immediately (no retry counting). It ACKs the message after DLQ publish. This is correct for business errors that should not be retried.
- However, the TODO says "automatically route messages that throw `EventConsumerException` to the corresponding DLQ subject after max retries". Currently `JetStreamConsumerService` does not retry `EventConsumerException` — it routes immediately. This is the correct behavior for DLQ (business errors should not be retried). But the TODO wants a `moveToDlq` helper for manual cases and enhanced exception metadata.

**Key design decisions:**
- Add `buildDlqSubject(originalSubject: string): string` to `src/common/utils/subject.builder.ts` (and export it). This is a convenience that just prefixes `dlq.`.
- Enhance `EventConsumerException` with optional `dlqReason`, `originalSubject`, `retryCount`. These are metadata fields for DLQ logging and routing.
- In `JetStreamConsumerService`, preserve the enhanced fields when routing to DLQ. The current behavior (immediate DLQ routing on `EventConsumerException`) is correct — no retry needed for business logic errors.
- Add `moveToDlq(message: JsMsg, reason: string)` helper to `JetStreamConsumerService` for manual DLQ routing.
- Update `JetStreamConsumerService.routeToDlq()` to include `dlqReason` in the DLQ payload if present.
- Document recommended DLQ stream retention policy (e.g., longer retention than main streams).

### Task 3: 4.1 Analysis & Planning

**Agent:** `architect`  
**Output:** `.kilo/plans/20260616-task3-dlq-improvements.md`

**Scope:**
- Add `buildDlqSubject` to `subject.builder.ts` and export via barrel.
- Extend `EventConsumerExceptionOptions` with `dlqReason?: string`, `originalSubject?: string`, `retryCount?: number`.
- Update `JetStreamConsumerService.routeToDlq()` to include new fields in DLQ payload.
- Add `JetStreamConsumerService.moveToDlq(message, reason)` method.
- Write tests for DLQ improvements.
- Update `docs/event-messaging-convention.md` with DLQ retention policy recommendations.

### Task 3: 4.2 Implementation

**Agent:** `implementer`  
**Plan:** Execute steps from `20260616-task3-dlq-improvements.md`.

### Task 3: 4.3 Code Review

**Agent:** `code-reviewer`  
**Output:** `.kilo/plans/20260616-task3-dlq-improvements-fix.md` (if needed)  
**Fix Agent:** `implementer`

### Task 3: 4.4 Documentation

**Agent:** `docs-specialist`  
**Scope:**
- Document `buildDlqSubject` in subject builder docs.
- Document enhanced `EventConsumerException` fields.
- Document `moveToDlq` helper.
- Add DLQ retention policy recommendations.

### Task 3: 4.5 Verification

**Agent:** `architect`  
**Scope:** Verify DLQ routing logic, test coverage, and doc completeness.

### Task 3: 4.6 Task Completion

**Agent:** `implementer`  
**Scope:** Add `[DONE]` to Task 3 in TODO file and commit.

---

## Task 4: Request-Reply + Outbox Integration

### Task 4 Pre-Analysis

The current `OutboxService` has `sendRequestThroughOutbox(event, subject)` which validates `reply_to` is present and then calls `saveToOutbox`. The TODO asks for a new helper:

```ts
sendRequestThroughOutbox<T, R>(subject: string, payload: T, options: AsyncRequestOptions)
```

This is a higher-level helper that combines `RequestReplyService.sendRequest` logic with outbox persistence. However, looking at the current `OutboxService`, it doesn't have access to `RequestReplyService` dependencies (it only has `ProducerService`, `Repository`, `Logger`). Adding a full request-reply builder in `OutboxService` would require injecting `RequestReplyService` or duplicating its logic.

**Key design decisions:**
- The TODO's signature `sendRequestThroughOutbox<T, R>(subject: string, payload: T, options: AsyncRequestOptions)` implies building the envelope inside the method. This requires `EventContext` and `RequestReplyService` capabilities.
- Better approach: Keep the existing `sendRequestThroughOutbox(event, subject)` as the low-level API, and add a higher-level convenience method in `RequestReplyService` or `OutboxService` that builds the envelope and saves it.
- Since `OutboxService` already has `sendRequestThroughOutbox(event, subject)`, we can add a new method `sendAsyncRequestThroughOutbox<T>(options: AsyncRequestThroughOutboxOptions<T>)` that builds the envelope using `RequestReplyService` helpers and then saves it.
- However, `OutboxService` doesn't currently depend on `RequestReplyService`. To avoid circular dependencies, we can add a `buildEnvelope` helper in the outbox module or make the new method accept a pre-built envelope (which is the current approach).
- Actually, the existing `sendRequestThroughOutbox` already does what the TODO asks for at the low level. The TODO wants a higher-level helper that takes `payload` and `options` instead of a pre-built `event`. We can add this to `RequestReplyService` as a new method that builds the envelope and delegates to `OutboxService`, or add it to `OutboxService` by injecting a lightweight envelope builder.
- Cleanest approach: Add `sendRequestThroughOutbox<T>(options: SendRequestThroughOutboxOptions<T>)` to `OutboxService` that accepts `subject`, `payload`, and `context`, builds the envelope internally (using a helper), and saves it. This avoids circular deps.
- For documentation: Update README and `docs/request-reply-patterns.md` with clear guidance on when to use outbox with request-reply (async only, for durability).

### Task 4: 4.1 Analysis & Planning

**Agent:** `architect`  
**Output:** `.kilo/plans/20260616-task4-request-reply-outbox.md`

**Scope:**
- Design `SendRequestThroughOutboxOptions<T>` interface (subject, payload, context).
- Add `OutboxService.sendAsyncRequestThroughOutbox<T>(options)` that builds envelope and saves to outbox.
- Ensure `reply_to` validation is performed.
- Write tests for the new method.
- Update README request-reply section with outbox integration examples.
- Update `docs/request-reply-patterns.md` and `docs/outbox-configuration.md` with combined patterns.

### Task 4: 4.2 Implementation

**Agent:** `implementer`  
**Plan:** Execute steps from `20260616-task4-request-reply-outbox.md`.

### Task 4: 4.3 Code Review

**Agent:** `code-reviewer`  
**Output:** `.kilo/plans/20260616-task4-request-reply-outbox-fix.md` (if needed)  
**Fix Agent:** `implementer`

### Task 4: 4.4 Documentation

**Agent:** `docs-specialist`  
**Scope:**
- Document `sendAsyncRequestThroughOutbox` in README and docs.
- Explain sync vs async outbox usage patterns.
- Add copy-pasteable examples.

### Task 4: 4.5 Verification

**Agent:** `architect`  
**Scope:** Verify integration logic, test coverage, and doc completeness.

### Task 4: 4.6 Task Completion

**Agent:** `implementer`  
**Scope:** Add `[DONE]` to Task 4 in TODO file and commit.

---

## Task 5: Final Documentation & Decision Guidelines

### Task 5 Pre-Analysis

The docs are already quite comprehensive. The TODO asks for:

- Expand "Request-Reply Patterns" file with decision tree, performance/reliability trade-offs, when to combine with outbox.
- New doc file "Outbox Usage Guidelines" (when to use transactional vs normal, SQLite vs Postgres).
- Review all docs and add missing guidelines:
  - How to create new Event classes
  - Subject naming checklist
  - Best practices for correlation/causation
  - When to throw `EventConsumerException`
- Add indexes to docs for better navigation.
- Verify all docs refer to the library as `@cobranza-apps/events-toolkit` (matching package.json).

**Key design decisions:**
- `docs/request-reply-patterns.md` already has decision tree and comparison (Section 4). Need to expand with performance/reliability trade-offs and outbox combination guidance.
- `docs/ai-agent-guidelines.md` already has event creation steps, naming checklist, validation checklist, and common mistakes. Need to add correlation/causation best practices and `EventConsumerException` guidance.
- Create `docs/outbox-usage-guidelines.md` as a new file.
- Add table of contents / index to long docs.
- Verify all `package.json` references are correct.

### Task 5: 4.1 Analysis & Planning

**Agent:** `architect`  
**Output:** `.kilo/plans/20260616-task5-final-documentation.md`

**Scope:**
- Audit all docs for completeness and package name consistency.
- Plan `docs/outbox-usage-guidelines.md` structure.
- Plan additions to `docs/request-reply-patterns.md` (performance trade-offs, outbox combination).
- Plan additions to `docs/ai-agent-guidelines.md` (correlation/causation, `EventConsumerException` when to throw).
- Plan index additions for all long docs.
- Plan README updates.

### Task 5: 4.2 Implementation

**Agent:** `implementer`  
**Plan:** Execute steps from `20260616-task5-final-documentation.md`.

### Task 5: 4.3 Code Review

**Agent:** `code-reviewer`  
**Output:** `.kilo/plans/20260616-task5-final-documentation-fix.md` (if needed)  
**Fix Agent:** `implementer`

### Task 5: 4.4 Documentation

**Agent:** `docs-specialist`  
**Scope:**
- Ensure all new docs have proper JSDoc, markdown formatting, and cross-links.
- Verify README links are updated.

### Task 5: 4.5 Verification

**Agent:** `architect`  
**Scope:** Verify all docs reference `@cobranza-apps/events-toolkit`, indexes are present, and no broken links.

### Task 5: 4.6 Task Completion

**Agent:** `implementer`  
**Scope:** Add `[DONE]` to Task 5 in TODO file and commit.

---

## Step 5: TODO File Completion

**Agent:** `implementer`  
**Instructions:**
- Rename `.agent/todos/20260616/20260616-todo-0.md` to `.agent/todos/20260616/20260616-todo-0-DONE.md`.
- Ensure all files are committed in feature branch.
- Switch to `main`, merge `feat/testing-outbox-dlq-docs`.
- On success: delete feature branch.
- Push `main` to `origin` only (if remote set).

---

## Step 6: Continuation

Check for remaining TODO files. If none, work finished.
