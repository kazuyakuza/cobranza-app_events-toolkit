# Task 6 — Testing & Examples: Implementation Plan

## Overview

Add comprehensive examples and additional test cases for both sync and async request-reply patterns. Update README.md with links to the new example files.

## Pre-Analysis

### Current State

**Existing test files with request-reply coverage:**

| File | Coverage |
|------|----------|
| `request-reply.service.request.spec.ts` | Sync `request()`: send/receive, timeout, custom timeout, config default, auto-envelope, logging, malformed reply, correlationId in exception |
| `request-reply.service.sendRequest.spec.ts` | Async `sendRequest()`: missing replyTo throws, empty replyTo throws, publish via ProducerService, auto-envelope, no NATS request call |
| `request-reply.service.sendResponse.spec.ts` | `sendResponse()`: publish to reply_to, no extra log, missing reply_to throws |
| `request-reply.service.isRequestReplyMessage.spec.ts` | `isRequestReplyMessage()`: true with reply_to, false undefined, false empty |
| `request-reply.service.buildResponseEnvelope.spec.ts` | `buildResponseEnvelope()`: preserve correlation_id, set causation_id, populate all fields |
| `request-reply-consumer.service.spec.ts` | Handler registration, dispatch, DLQ routing, message processing |
| `on-request-reply.decorator.spec.ts` | Metadata storage, eventType, companyId |
| `on-request-reply.explorer.spec.ts` | Discovery, registration, bound handlers |
| `outbox.service.request-reply.spec.ts` | `sendRequestThroughOutbox()`: saves with reply_to, throws without reply_to, exception metadata, log context |
| `outbox.service.processor.spec.ts` | Processor interval, publish, mark sent, logs — but NO request-reply specific flow |

**Example files:** None. `docs/examples/` directory does not exist.

**README.md:** Has inline code examples for both patterns but no links to standalone example files.

### Gaps Identified

1. **No example files** — `docs/examples/` directory missing entirely
2. **README lacks example file links** — No references to standalone example files
3. **Missing request-reply error scenarios in tests:**
   - `request.spec.ts` missing: re-throw of already-typed `RequestReplyException`, non-Error thrown from NATS (string/number), null response data
4. **Missing outbox+request-reply integration-like tests:**
   - No test verifying that pending request-reply events (with `reply_to`) are correctly published by the outbox processor (reply_to preserved through outbox round-trip)
   - No test verifying the full `sendRequestThroughOutbox → saveToOutbox → processPendingEvents → publish(subject, envelope)` flow with reply_to field intact

---

## Step-by-Step Plan

### Step 1: Create `docs/examples/` directory

Command: `mkdir -p docs/examples` (or equivalent PowerShell: `New-Item -ItemType Directory -Path docs/examples -Force`)

### Step 2: Create `docs/examples/sync-request-reply.example.ts`

Create a complete, self-contained sync request-reply example file. Shows a `VerificationService` that uses `RequestReplyService.request()` to send a verification request and receive a typed response.

**File content structure:**
- Imports from `@cobranza-apps/events-toolkit`
- `VerificationRequestedData` class with validation decorators
- `VerificationResultData` class with validation decorators
- `VerificationService` class with `requestVerificationStatus()` method
- Shows: subject building, payload creation, calling `request()` with timeout, error handling with `RequestReplyException`, and response data extraction

**Constraints:** Keep under 200 lines (it's a doc example, not in `src/`).

### Step 3: Create `docs/examples/async-request-reply.example.ts`

Create a complete, self-contained async request-reply example file. Shows:
- **Requester side**: `DebtService` using `sendRequest()` with `reply_to`
- **Responder side**: `CreditCheckConsumer` using `@OnEvent()` + `buildResponseEnvelope()` + `sendResponse()`
- **Response handler**: `DebtServiceResponseHandler` using `@OnRequestReply()` decorator
- Shows both naming conventions for reply subjects (preferred past-tense and alternative `.response` suffix)

**File content structure:**
- Imports
- `CreditCheckRequestedData` and `CreditCheckResultData` classes
- `DebtService` with `requestCreditCheck()` — sends async request with reply_to
- `CreditCheckConsumer` with `@OnEvent()` — receives request, checks `isRequestReplyMessage`, sends response
- `DebtServiceResponseHandler` with `@OnRequestReply()` — handles async response
- Module wiring showing `ConsumerModule.forRoot()` with request-reply consumer setup

**Constraints:** Keep under 200 lines (it's a doc example, not in `src/`).

### Step 4: Update `README.md`

Add a new "Examples" subsection under the "Request-Reply Pattern" section (around line 338) with links to the new example files.

**Exact change location:** After line 338 (`#### Sync — \`request()\``) section heading area, add a callout box linking to the example files.

**Content to add:**
```markdown
> **Full examples:** See [Sync Request-Reply Example](docs/examples/sync-request-reply.example.ts) and [Async Request-Reply Example](docs/examples/async-request-reply.example.ts) for complete, runnable code samples.
```

Also, in the "Related Documentation" section at the bottom (around line 674-679), add a link:

```markdown
- [Request-Reply Examples](docs/examples/) — Complete code examples for sync and async patterns
```

### Step 5: Add timeout/error scenario tests to `request-reply.service.request.spec.ts`

Add the following test cases to the existing `describe('request')` block:

1. **Re-throw existing RequestReplyException** — Verify that when the NATS request throws a `RequestReplyException`, it is re-thrown as-is without double-wrapping. Tests the `wrapRequestError` path where `error instanceof RequestReplyException` is true.

2. **Non-Error thrown from NATS request** — Verify that when NATS request rejects with a non-Error value (e.g., a string like `'connection lost'`), the thrown `RequestReplyException` has `message` set to the string value.

3. **Error wrapped from native Error** — Verify that when NATS request rejects with a native `Error`, the `RequestReplyException.cause` is set to the original error.

4. **Multiple sequential requests** — Verify that the service can handle two sequential `request()` calls on the same service instance, each returning the correct typed data.

**Implementation approach:** These will be added as new `it()` blocks within the existing `describe('request')` block. The file is currently 162 lines; adding ~60-80 lines keeps it under 200 lines per the rule.

### Step 6: Add outbox request-reply flow tests to `outbox.service.request-reply.spec.ts`

Add a new `describe` block for the full request-reply outbox flow:

1. **Processor publishes request-reply event with reply_to intact** — Create a pending outbox entry with `reply_to` in the event data, verify that `OutboxService.processPendingEvents` (or the processor) publishes the event with the original `reply_to`.

2. **Processor round-trip preserves reply_to through serialization** — Verify that after the outbox save-process-publish cycle, the published envelope's `reply_to` field matches the original value.

3. **sendRequestThroughOutbox followed by processor publish** — End-to-end test: call `sendRequestThroughOutbox` with an envelope that has `reply_to`, then simulate the processor cycle, verify the full save-process-publish flow.

**Implementation approach:** Add a new `describe('OutboxService — request-reply processor flow')` block after the existing tests. Reuse `createTestEnvelope` and `createOutboxMocks` from `outbox.service.fixture.ts`. These tests verify the integration between `sendRequestThroughOutbox`, `saveToOutbox`, and the processor's publish logic for request-reply events.

The current file is 58 lines. Adding ~80 lines stays well under 200.

### Step 7: Run the test suite

Command: `npm test`

Verify all existing tests pass and new tests pass.

### Step 8: Run lint and typecheck

Commands:
```
npm run lint
npm run build
```

Ensure no type errors or lint failures.

### Step 9: Verify .gitignore compliance

Run `git status` and ensure no `.gitignore`-matching files are staged.

### Step 10: Commit changes

Stage all new and modified files, commit with message:

```
feat: add request-reply examples and test coverage

- Add docs/examples/sync-request-reply.example.ts
- Add docs/examples/async-request-reply.example.ts
- Update README.md with example file links
- Add timeout/error scenario tests to request-reply.service.request.spec.ts
- Add outbox request-reply processor flow tests
```

---

## Files to Create/Modify

| Action | File | Lines (est.) |
|--------|------|-------------|
| CREATE | `docs/examples/sync-request-reply.example.ts` | ~120 |
| CREATE | `docs/examples/async-request-reply.example.ts` | ~180 |
| MODIFY | `README.md` | +6 |
| MODIFY | `src/request-reply/request-reply.service.request.spec.ts` | +70 |
| MODIFY | `src/outbox/outbox.service.request-reply.spec.ts` | +80 |

## Verification Checklist

- [ ] All example files have no syntax errors (may need `// @ts-nocheck` or illustrative-only note)
- [ ] README links are valid relative paths
- [ ] New tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] Build passes (`npm run build`)
- [ ] No `.gitignore`-matching files staged
- [ ] All files under 200 lines (source in `src/`) or sub-200 (docs examples)
- [ ] No commented-out code
- [ ] Self-documenting code (no unnecessary comments)