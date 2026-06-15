# Global Plan – Advanced Request-Reply Patterns + Outbox Integration

**Date:** 2026-06-14
**TODO:** `.agent/todos/20260614/20260614-todo-0.md`
**Branch:** `feat/request-reply-patterns`
**Goal:** Add robust sync and async request-reply patterns, `@OnRequestReply` decorator, outbox integration, documentation, and tests.

---

## Pre-Analysis

- The existing `RequestReplyService` only supports synchronous `request<T, R>()`.
- The `ConsumerService` / `OnEventExplorer` already supports decorator-based handler registration.
- `OutboxService` supports `saveToOutbox()` but lacks request-reply helpers.
- No `@OnRequestReply` decorator exists for async response handling.
- No documentation covers the distinction between sync and async request-reply or outbox integration.

## Task List (from TODO)

1. RequestReplyService Enhancements
2. Decorator-Based Response Handling (`@OnRequestReply`)
3. Request-Reply Documentation
4. Outbox Integration with Request-Reply
5. Response Event Conventions
6. Testing & Examples
7. Guidelines for Developers & AI Agents

---

## Step 2: Git Feature Branch Setup

- Check current branch, commit any unstaged changes.
- Switch to `main` and merge if needed.
- Create and switch to `feat/request-reply-patterns`.

**Agent:** implementer

---

## Step 3: Version Update

- Bump minor version in `package.json` (feature addition).
- Commit: `chore: bump version to x.y.z`.

**Agent:** implementer

---

## Task 1: RequestReplyService Enhancements

### 4.1 Analysis & Planning

- Analyze `request-reply.service.ts` and `request-reply.types.ts`.
- Define `AsyncRequestOptions` interface (extends `RequestReplyRequestOptions` with `correlationId`, `replyToSubject`, etc.).
- Plan `sendRequest<T, R>()` method that:
  - Builds an envelope with `reply_to`.
  - Publishes via `ProducerService` (fire-and-forget, no waiting).
  - Returns the generated `correlationId` so the caller can track it.

**Agent:** architect

### 4.2 Implementation

- Add `AsyncRequestOptions` to `request-reply.types.ts`.
- Add `sendRequest<T, R>()` to `request-reply.service.ts`.
- Add response envelope helper `buildResponseEnvelope()` to preserve `correlation_id` / `causation_id`.
- Update `request-reply/index.ts` exports.

**Agent:** implementer

### 4.3 Code Review

- Verify method signatures, type safety, error handling, logging.
- Check max 50 lines per method, max 2 params, max 2 depth.

**Agent:** code-reviewer

### 4.4 Documentation

- Add JSDoc to new methods and types.

**Agent:** docs-specialist

### 4.5 Verification

- Verify plan adherence, check exports, run tests.

**Agent:** architect

### 4.6 Task Completion

- Mark Task 1 as `[DONE]` in TODO.

**Agent:** implementer

---

## Task 2: Decorator-Based Response Handling

### 4.1 Analysis & Planning

- Analyze `@OnEvent()` / `OnEventExplorer` pattern.
- Design `@OnRequestReply(eventType: string)` decorator:
  - Stores metadata with event type and optional `companyId` filter.
  - `OnRequestReplyExplorer` scans providers/controllers.
  - Registers handlers with a new `RequestReplyConsumerService` that:
    - Listens on response subjects (`*.response.v1`).
    - Correlates by `correlation_id`.
    - Dispatches to matching `@OnRequestReply` handlers.
- Plan files:
  - `src/consumer/decorators/on-request-reply.decorator.ts`
  - `src/consumer/decorators/on-request-reply.explorer.ts`
  - `src/consumer/request-reply-consumer.service.ts`

**Agent:** architect

### 4.2 Implementation

- Create `@OnRequestReply` decorator.
- Create `OnRequestReplyExplorer` (similar to `OnEventExplorer`).
- Create `RequestReplyConsumerService` (registry + dispatch by correlation_id).
- Update `ConsumerModule` to register explorer + service.
- Update `consumer/index.ts` exports.

**Agent:** implementer

### 4.3 Code Review

- Verify decorator metadata, explorer logic, dispatch filtering.

**Agent:** code-reviewer

### 4.4 Documentation

- Add JSDoc to decorator, explorer, service.
- Update README with `@OnRequestReply` examples.

**Agent:** docs-specialist

### 4.5 Verification

- Verify integration with `ConsumerModule`, run tests.

**Agent:** architect

### 4.6 Task Completion

- Mark Task 2 as `[DONE]`.

**Agent:** implementer

---

## Task 3: Request-Reply Documentation

### 4.1 Analysis & Planning

- Review existing docs (`event-messaging-convention.md`, `README.md`).
- Plan new doc: `docs/request-reply-patterns.md` covering:
  - Sync vs Async decision tree
  - Pros/cons, correlation_id, timeout, idempotency
  - How to send success/error responses
  - Outbox integration guidelines

**Agent:** architect

### 4.2 Implementation

- Update `docs/event-messaging-convention.md` with Request-Reply subsection.
- Create `docs/request-reply-patterns.md`.
- Update `README.md` with links and examples.

**Agent:** implementer

### 4.3 Code Review

- Verify markdown formatting, link validity, clarity.

**Agent:** code-reviewer

### 4.4 Documentation

- Final polish, ensure consistency with existing docs.

**Agent:** docs-specialist

### 4.5 Verification

- Verify all links resolve, check spelling.

**Agent:** architect

### 4.6 Task Completion

- Mark Task 3 as `[DONE]`.

**Agent:** implementer

---

## Task 4: Outbox Integration with Request-Reply

### 4.1 Analysis & Planning

- Analyze `OutboxService` and `OutboxModule`.
- Design `sendRequestThroughOutbox()` helper:
  - Saves request event to outbox.
  - Ensures background processor preserves `reply_to`.
- Verify existing processor already preserves `reply_to` (it publishes full envelope).

**Agent:** architect

### 4.2 Implementation

- Add `sendRequestThroughOutbox(event, subject)` to `OutboxService`.
- Add `saveRequestToOutbox()` alias if needed.
- Update `docs/outbox-configuration.md` with request-reply guidance.
- Update README outbox section with request-reply example.

**Agent:** implementer

### 4.3 Code Review

- Verify helper method signature, logging, error handling.

**Agent:** code-reviewer

### 4.4 Documentation

- Add JSDoc to new helper.

**Agent:** docs-specialist

### 4.5 Verification

- Verify outbox processor still handles `reply_to` correctly.

**Agent:** architect

### 4.6 Task Completion

- Mark Task 4 as `[DONE]`.

**Agent:** implementer

---

## Task 5: Response Event Conventions

### 4.1 Analysis & Planning

- Define naming convention:
  - Request: `debt.calculate.v1`
  - Response: `debt.calculated.v1` (preferred) or `debt.calculate.response.v1`
- Plan helper: `buildResponseSubject(requestSubject)` or `buildResponseEnvelope(requestEnvelope, responseData)`.
- Update `event-messaging-convention.md`.

**Agent:** architect

### 4.2 Implementation

- Add `buildResponseSubject()` to `subject.builder.ts` or `request-reply.utils.ts`.
- Add `buildResponseEnvelope()` to `request-reply.service.ts`.
- Update `common/index.ts` or `request-reply/index.ts` exports.

**Agent:** implementer

### 4.3 Code Review

- Verify convention logic, edge cases (version parsing).

**Agent:** code-reviewer

### 4.4 Documentation

- Document response naming convention in `docs/request-reply-patterns.md`.

**Agent:** docs-specialist

### 4.5 Verification

- Verify helper produces correct subjects.

**Agent:** architect

### 4.6 Task Completion

- Mark Task 5 as `[DONE]`.

**Agent:** implementer

---

## Task 6: Testing & Examples

### 4.1 Analysis & Planning

- Plan test files:
  - `request-reply.service.spec.ts` — sync `request()`, async `sendRequest()`, timeout, error.
  - `on-request-reply.decorator.spec.ts` — decorator metadata.
  - `on-request-reply.explorer.spec.ts` — explorer registration.
  - `request-reply-consumer.service.spec.ts` — dispatch by correlation_id.
  - `outbox.service.request-reply.spec.ts` — outbox + request-reply flow.
- Plan docs examples:
  - `docs/examples/sync-request-reply.example.ts`
  - `docs/examples/async-request-reply.example.ts`

**Agent:** architect

### 4.2 Implementation

- Write unit tests for all new components.
- Write example files.
- Update `README.md` with example links.

**Agent:** implementer

### 4.3 Code Review

- Verify test coverage, edge cases (timeout, error, correlation mismatch).

**Agent:** code-reviewer

### 4.4 Documentation

- Ensure test files are self-documenting.
- Update example comments.

**Agent:** docs-specialist

### 4.5 Verification

- Run `npm test`, verify all pass.

**Agent:** architect

### 4.6 Task Completion

- Mark Task 6 as `[DONE]`.

**Agent:** implementer

---

## Task 7: Guidelines for Developers & AI Agents

### 4.1 Analysis & Planning

- Plan `docs/request-reply-guidelines.md` with:
  - Decision tree (sync vs async)
  - When to use outbox
  - Timeout recommendations
  - Idempotency requirements
  - Correlation_id best practices

**Agent:** architect

### 4.2 Implementation

- Create `docs/request-reply-guidelines.md`.
- Update `README.md` with link.
- Update `docs/ai-agent-guidelines.md` with request-reply rules.

**Agent:** implementer

### 4.3 Code Review

- Verify clarity, accuracy, consistency.

**Agent:** code-reviewer

### 4.4 Documentation

- Final polish.

**Agent:** docs-specialist

### 4.5 Verification

- Verify all links, check consistency.

**Agent:** architect

### 4.6 Task Completion

- Mark Task 7 as `[DONE]`.

**Agent:** implementer

---

## Step 5: TODO File Completion

- Rename TODO to `20260614-todo-0-DONE.md`.
- Ensure all files committed in `feat/request-reply-patterns`.
- Merge to `main`, delete branch.
- Push to `origin`.

**Agent:** implementer

---

## Global Constraints

- Follow max 200 lines per file, max 50 lines per method, max 2 params, max 2 depth.
- Prefer private members.
- Self-documenting code, minimal comments.
- No commented-out code.
- Single-section boolean conditions.
- All new files must be in `src/`.
- Update `.agent/project-structure.md` if new folders created.
