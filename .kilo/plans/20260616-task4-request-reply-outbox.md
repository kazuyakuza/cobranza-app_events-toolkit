# Task 4: Request-Reply + Outbox Integration Plan

## Pre-Analysis

### Current State

1. **`OutboxService.sendRequestThroughOutbox(event, subject)`** — takes a pre-built `EventEnvelope<unknown>` and `subject` string. Validates `reply_to` via `ensureReplyToPresent()`, then delegates to `saveToOutbox()`. Low-level API requiring callers to manually build the envelope.

2. **`RequestReplyService.sendRequest(options: SendRequestOptions<T>)`** — takes `subject`, `payload`, and `context` (with `replyTo`). Builds the envelope internally via `buildEnvelope()` (which is equivalent to `createEvent()`), publishes via `ProducerService`, and returns `{ correlationId }`. This is the higher-level API pattern we want to mirror for the outbox.

3. **`createEvent(data, context)`** in `src/common/utils/event-factory.ts` — shared helper that builds an `EventEnvelope` from payload + `EventContext`. This is identical in function to `buildEnvelope()` in `request-reply.helpers.ts`. No duplication needed.

4. **`buildEnvelope()`** in `src/request-reply/request-reply.helpers.ts` — same logic as `createEvent()`, used by `RequestReplyService`. Both map `EventContext` fields (camelCase) to `EventEnvelope` fields (snake_case).

5. **`EventContext.replyTo`** is currently optional (`string | undefined`). For the outbox async request method, `replyTo` must be required.

### Key Design Decision

Use `createEvent()` from `src/common/utils/event-factory.ts` as the envelope builder inside `OutboxService.sendAsyncRequestThroughOutbox()`. This avoids:
- Circular dependencies (`OutboxService` does not depend on `RequestReplyService`)
- Logic duplication (no copying `buildEnvelope` logic)
- Creating unnecessary helper classes

The `common/` module is already a shared dependency of both `outbox/` and `request-reply/`.

### Naming Decision

Method name: `sendAsyncRequestThroughOutbox` — clearly distinguishes from the existing lower-level `sendRequestThroughOutbox(event, subject)` and communicates the async (fire-and-forget-to-outbox) nature.

No `<R>` type parameter needed since this is a one-way outbox operation (no synchronous response type).

---

## Implementation Plan

### Step 1: Create `AsyncRequestEventContext` type

**File:** `src/outbox/async-request-event-context.interface.ts` (NEW)

```typescript
import type { EventContext } from '../common/envelope/event-context.interface';

/**
 * EventContext with `replyTo` required.
 *
 * Used by async request-reply operations through the outbox where
 * the reply subject must always be present for response routing.
 */
export interface AsyncRequestEventContext extends EventContext {
  /** NATS subject for async request-reply response routing. */
  replyTo: string;
}
```

### Step 2: Create `SendAsyncRequestThroughOutboxOptions` type

**File:** `src/outbox/send-async-request-through-outbox-options.interface.ts` (NEW)

```typescript
import type { AsyncRequestEventContext } from './async-request-event-context.interface';

/**
 * Options for {@link OutboxService.sendAsyncRequestThroughOutbox}.
 *
 * Accepts subject, payload, and context (with required `replyTo`)
 * to build and persist a request-reply event through the outbox.
 */
export interface SendAsyncRequestThroughOutboxOptions<T> {
  /** NATS subject to publish the request event to. */
  subject: string;
  /** Domain-specific business payload for the request event. */
  payload: T;
  /** Metadata for the event envelope. Must include replyTo for async responses. */
  context: AsyncRequestEventContext;
}
```

### Step 3: Create `SendAsyncRequestThroughOutboxResult` type

**File:** `src/outbox/send-async-request-through-outbox-result.interface.ts` (NEW)

```typescript
/**
 * Result of an async request sent through the outbox.
 *
 * Carries the correlation tracking identifier for linking
 * async responses back to the original request.
 */
export interface SendAsyncRequestThroughOutboxResult {
  /** correlation_id of the persisted request event. */
  correlationId: string;
}
```

### Step 4: Add `sendAsyncRequestThroughOutbox` method to `OutboxService`

**File:** `src/outbox/outbox.service.ts` (MODIFY)

**Changes:**

1. Add import for `createEvent` at the top:
```typescript
import { createEvent } from '../common/utils/event.factory';
```

2. Add imports for the new types:
```typescript
import { SendAsyncRequestThroughOutboxOptions } from './send-async-request-through-outbox-options.interface';
import { SendAsyncRequestThroughOutboxResult } from './send-async-request-through-outbox-result.interface';
```

3. Add the new method to the class, after the existing `sendRequestThroughOutbox` method:

```typescript
/**
 * Builds an event envelope from payload and context, validates replyTo,
 * and persists it to the outbox for asynchronous request-reply delivery.
 *
 * Unlike sendRequestThroughOutbox which takes a pre-built envelope,
 * this method constructs the envelope internally, providing a
 * higher-level API that mirrors RequestReplyService.sendRequest().
 *
 * @typeParam T - Request payload type.
 */
async sendAsyncRequestThroughOutbox<T>(
  options: SendAsyncRequestThroughOutboxOptions<T>,
): Promise<SendAsyncRequestThroughOutboxResult> {
  const envelope = createEvent(options.payload, options.context);
  await this.saveToOutbox(envelope, options.subject);
  return { correlationId: envelope.correlation_id };
}
```

**Rationale:** Uses `createEvent()` from the common module — no logic duplication. The `AsyncRequestEventContext` type ensures `replyTo` is required at compile time, so no runtime assertion is needed (TypeScript enforces it). The method delegates to `saveToOutbox()` which already handles persistence and logging.

### Step 5: Export new types from `src/outbox/index.ts`

**File:** `src/outbox/index.ts` (MODIFY)

Add the following exports:

```typescript
export { AsyncRequestEventContext } from './async-request-event-context.interface';
export { SendAsyncRequestThroughOutboxOptions } from './send-async-request-through-outbox-options.interface';
export { SendAsyncRequestThroughOutboxResult } from './send-async-request-through-outbox-result.interface';
```

These should be added after the existing exports, grouped logically with the other outbox types.

### Step 6: Create unit tests for `sendAsyncRequestThroughOutbox`

**File:** `src/outbox/outbox.service.send-async-request.spec.ts` (NEW)

Test suite structure:

```typescript
import { OutboxService } from './outbox.service';
import { ActorType } from '../common/envelope/actor-type.enum';
import {
  createOutboxMocks,
  createService,
  resetMocks,
} from './outbox.service.fixture';
import { SendAsyncRequestThroughOutboxOptions } from './send-async-request-through-outbox-options.interface';
import { AsyncRequestEventContext } from './async-request-event-context.interface';

describe('OutboxService — sendAsyncRequestThroughOutbox', () => {
  let mocks: ReturnType<typeof createOutboxMocks>;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
    resetMocks(mocks);
  });

  it('builds envelope from payload and context, saves to outbox, and returns correlationId', async () => {
    // Verify the method builds the correct envelope and delegates to saveToOutbox
  });

  it('sets reply_to on the envelope from context.replyTo', async () => {
    // Verify the envelope has reply_to set correctly
  });

  it('returns the correct correlationId from the built envelope', async () => {
    // Verify correlationId in result matches the one in context
  });

  it('passes the correct subject to saveToOutbox', async () => {
    // Verify saveToOutbox receives the correct subject
  });

  it('populates all EventEnvelope fields from the context', async () => {
    // Verify all envelope fields are correctly mapped
  });

  it('works with different payload types', async () => {
    // Test with a custom payload type
  });
});
```

Test details for each case:

1. **Builds envelope and saves to outbox** — Call `sendAsyncRequestThroughOutbox` with a `SendAsyncRequestThroughOutboxOptions`, verify `repository.save` was called with `{ event, subject }`, verify the event has `reply_to` set, verify returned `correlationId` matches `context.correlationId`.

2. **Sets reply_to from context.replyTo** — Verify the built envelope's `reply_to` field equals `context.replyTo`.

3. **Returns correct correlationId** — Verify `result.correlationId === context.correlationId`.

4. **Passes correct subject** — Verify `repository.save` was called with the correct `subject`.

5. **Populates all fields** — Verify `id`, `type`, `version`, `producer`, `company_id`, `actor_type`, `actor_id`, `correlation_id`, `causation_id`, `trace_id`, `reply_to`, `data` are all correctly set on the saved envelope.

6. **Works with different payload types** — Test with `{ amount: 100, currency: 'USD' }` payload and verify `data` field.

### Step 7: Update `README.md` — "Request-Reply Through the Outbox" section

**File:** `README.md` (MODIFY)

Replace the current "Request-Reply Through the Outbox" section (starting at line 520) with expanded content that shows both APIs:

1. **Low-level API** (`sendRequestThroughOutbox`) — existing example, unchanged.
2. **High-level API** (`sendAsyncRequestThroughOutbox`) — new example showing the simpler approach.

Add a new subsection for the high-level API:

```typescript
#### High-Level API — `sendAsyncRequestThroughOutbox`

For a simpler API that builds the envelope for you, use `sendAsyncRequestThroughOutbox`:

import {
  OutboxService, SubjectBuilder, EventContext,
  ActorType, generateUuidV7,
} from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<string> {
    const requestSubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'requested', version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'completed', version: '1',
    });

    const result = await this.outboxService.sendAsyncRequestThroughOutbox({
      subject: requestSubject,
      payload: { clientId },
      context: {
        type: 'credit.check.requested',
        version: '1.0.0',
        producer: 'debt-service',
        companyId,
        actorType: ActorType.SYSTEM,
        actorId: 'debt-service',
        correlationId: generateUuidV7(),
        replyTo: replySubject,
      },
    });

    return result.correlationId;
  }
}
```

Also add a new subsection "Recommended Patterns":

```markdown
#### Recommended Patterns

| Pattern | Approach |
|---------|----------|
| **Sync Request-Reply** (`request()`) | Bypass the outbox for the request — you're waiting for the response anyway. Use the outbox only for side effects triggered by the response. |
| **Async Request-Reply** (`sendRequest()` / `sendAsyncRequestThroughOutbox`) | Route the initial request through the outbox to guarantee delivery, even if the service restarts. Use `sendAsyncRequestThroughOutbox` for the simplest API, or `sendRequestThroughOutbox` if you need to build the envelope manually. |
```

### Step 8: Update `docs/outbox-configuration.md` — "Request-Reply with the Outbox" section

**File:** `docs/outbox-configuration.md` (MODIFY — section starting at line 197)

Add a new subsection after the existing "Async Request Through Outbox" section showing the high-level API:

```markdown
### High-Level API — `sendAsyncRequestThroughOutbox`

The `sendAsyncRequestThroughOutbox` method provides a simpler API that builds the envelope internally:

const result = await this.outboxService.sendAsyncRequestThroughOutbox({
  subject: requestSubject,
  payload: { clientId },
  context: {
    type: 'credit.check.requested',
    version: '1.0.0',
    producer: 'debt-service',
    companyId,
    actorType: ActorType.SYSTEM,
    actorId: 'debt-service',
    correlationId: generateUuidV7(),
    replyTo: replySubject,
  },
});

// Use result.correlationId to track the async response

The `context` parameter requires `replyTo` (enforced by TypeScript via `AsyncRequestEventContext`). This ensures request-reply events always have a response routing subject.

The method returns a `SendAsyncRequestThroughOutboxResult` with the event's `correlationId`, which can be used to correlate the async response when it arrives.
```

Update the "When to use the Outbox with Request-Reply" table to reference the new method:

```markdown
| Pattern | Outbox for Request? | Outbox for Response? |
|---------|---------------------|----------------------|
| Sync `request()` | ❌ No — uses NATS built-in reply | ❌ No — NATS handles the reply inbox |
| Async `sendRequest()` | ✅ Yes — use `sendAsyncRequestThroughOutbox` for guaranteed delivery | ⚠️ Only if handler has side effects needing transactional safety |
| Async `sendRequest()` (fire-and-forget OK) | No — use `RequestReplyService.sendRequest()` directly | No |
```

### Step 9: Update `docs/request-reply-patterns.md` — Add combined outbox section

**File:** `docs/request-reply-patterns.md` (MODIFY)

Add a new section after Section 8 ("Sending Success vs Error Responses"):

```markdown
---

## 9. Combining Request-Reply with the Outbox

### Sync Request-Reply + Outbox

For synchronous request-reply (`request()`), the outbox is typically **not needed for the request itself** because NATS handles the reply inbox. However, if the response handler triggers side effects that need transactional safety, use the outbox for those side effects:

// Sync request — no outbox needed for the request
const response = await this.requestReply.request<ReqData, ResData>(
  subject, payload, { context, timeoutMs: 10000 },
);

// Side effects triggered by the response — use outbox for reliability
const sideEffectEvent = createEvent(response.data, sideEffectContext);
await this.outboxService.saveToOutbox(sideEffectEvent, sideEffectSubject);

### Async Request-Reply + Outbox

For asynchronous request-reply, **route the initial request through the outbox** to guarantee delivery even if the service restarts:

// High-level API — builds envelope automatically
const result = await this.outboxService.sendAsyncRequestThroughOutbox({
  subject: requestSubject,
  payload: { clientId },
  context: {
    type: 'credit.check.requested',
    version: '1.0.0',
    producer: 'debt-service',
    companyId,
    actorType: ActorType.SYSTEM,
    actorId: 'debt-service',
    correlationId: generateUuidV7(),
    replyTo: replySubject,
  },
});

// Use result.correlationId to track the async response

Or use the low-level API with a pre-built envelope:

// Low-level API — for cases where you need to build the envelope manually
const event = createEvent({ clientId }, context);
await this.outboxService.sendRequestThroughOutbox(event, subject);

### Why sendAsyncRequestThroughOutbox over sendRequestThroughOutbox?

| Aspect | `sendAsyncRequestThroughOutbox` | `sendRequestThroughOutbox` |
|--------|----------------------------------|---------------------------|
| Envelope | Built automatically | Pre-built by caller |
| replyTo validation | TypeScript-enforced via `AsyncRequestEventContext` | Runtime-only via `ensureReplyToPresent()` |
| API style | High-level (subject + payload + context) | Low-level (envelope + subject) |
| Use when | You have raw payload and context | You already have an `EventEnvelope` |
| Returns | `{ correlationId }` for response tracking | `void` |
```

Also update Section 9 heading to "10. API Reference" and Section 10 heading to "11. Related Documentation".

### Step 10: Update `docs/request-reply-guidelines.md` — Outbox guidance

**File:** `docs/request-reply-guidelines.md` (MODIFY)

Update the "When to Use the Outbox with Request-Reply" table (around line 40) to reference the new method:

```markdown
| Pattern | Outbox for Request? | Outbox for Response? |
|---------|---------------------|----------------------|
| Sync `request()` | No | No | NATS handles reply inbox internally |
| Async `sendRequest()` | Yes — use `sendAsyncRequestThroughOutbox` | Only for side effects | Outbox ensures request delivery |
| Async `sendRequest()` (fire-and-forget OK) | No | No | Use `RequestReplyService.sendRequest()` directly |
```

Add a new subsection after the table:

```markdown
### Using `sendAsyncRequestThroughOutbox`

Prefer `sendAsyncRequestThroughOutbox` over manually building envelopes:

- **TypeScript enforces `replyTo`**: The `AsyncRequestEventContext` type requires `replyTo`, catching errors at compile time.
- **Automatic envelope construction**: No need to manually call `createEvent` — the method handles it.
- **Returns `correlationId`**: Useful for tracking async responses.
- **Same reliability**: Delegates to `saveToOutbox` internally, benefiting from the same retry and DLQ pipeline.
```

### Step 11: Create new example file for outbox + request-reply

**File:** `docs/examples/outbox-request-reply.example.ts` (NEW)

```typescript
// @ts-nocheck
/**
 * Outbox + Request-Reply Example
 *
 * Demonstrates how to combine the outbox pattern with async request-reply
 * for guaranteed delivery of request events.
 *
 * Shows both high-level and low-level APIs.
 */
import {
  OutboxService,
  SubjectBuilder,
  ActorType,
  generateUuidV7,
  AsyncRequestEventContext,
} from '@cobranza-apps/events-toolkit';
import { IsUUID, IsString } from 'class-validator';

// ── Data Types ──────────────────────────────────────────────────────

class CreditCheckRequestedData {
  @IsUUID()
  clientId: string;

  @IsString()
  fullName: string;
}

interface RequestCreditCheckParams {
  clientId: string;
  fullName: string;
  companyId: string;
}

// ── 1. High-level API (recommended) ─────────────────────────────────

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(params: RequestCreditCheckParams): Promise<string> {
    const { clientId, fullName, companyId } = params;

    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'completed',
      version: '1',
    });

    // sendAsyncRequestThroughOutbox builds the envelope and validates replyTo
    const result = await this.outboxService.sendAsyncRequestThroughOutbox({
      subject: requestSubject,
      payload: { clientId, fullName },
      context: {
        type: 'credit.check.requested',
        version: '1.0.0',
        producer: 'debt-service',
        companyId,
        actorType: ActorType.SYSTEM,
        actorId: 'debt-service',
        correlationId: generateUuidV7(),
        replyTo: replySubject,
      },
    });

    return result.correlationId;
  }
}

// ── 2. Low-level API (pre-built envelope) ───────────────────────────

import { createEvent, EventEnvelope } from '@cobranza-apps/events-toolkit';

class DebtServiceLowLevel {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(params: RequestCreditCheckParams): Promise<void> {
    const { clientId, fullName, companyId } = params;

    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'completed',
      version: '1',
    });

    const context = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const event = createEvent({ clientId, fullName }, context);

    // sendRequestThroughOutbox validates replyTo at runtime only
    await this.outboxService.sendRequestThroughOutbox(event, requestSubject);
  }
}
```

### Step 12: Verify no circular dependencies

After all changes, run the build to verify no circular import issues:

```bash
npm run build
```

If the build passes, there are no circular dependency issues. `OutboxService` imports `createEvent` from `common/utils/event.factory` — no dependency on `request-reply/` module.

### Step 13: Run existing tests

Ensure all existing tests still pass:

```bash
npm test
```

Focus on:
- `src/outbox/outbox.service.spec.ts`
- `src/outbox/outbox.service.request-reply.spec.ts`
- `src/outbox/outbox.service.processor.spec.ts`
- `src/outbox/outbox.service.retry-dlq.spec.ts`
- `src/request-reply/request-reply.service.sendRequest.spec.ts`

### Step 14: Run new tests

Run the new test file:

```bash
npx jest src/outbox/outbox.service.send-async-request.spec.ts
```

### Step 15: Run linter

```bash
npm run lint
```

### Step 16: Update `.agent/project-structure.md`

All new files are in the existing `src/outbox/` directory, so no changes needed to the project structure file.

### Step 17: Verification checklist

Verify the following before marking completion:

- [ ] `sendAsyncRequestThroughOutbox<T>()` method exists on `OutboxService`
- [ ] `AsyncRequestEventContext` type extends `EventContext` with required `replyTo`
- [ ] `SendAsyncRequestThroughOutboxOptions<T>` type defined with `subject`, `payload`, `context`
- [ ] `SendAsyncRequestThroughOutboxResult` type defined with `correlationId`
- [ ] Method uses `createEvent()` internally (no logic duplication)
- [ ] Method delegates to `saveToOutbox()` for persistence
- [ ] Method returns `{ correlationId }` for response tracking
- [ ] New types exported from `src/outbox/index.ts`
- [ ] All existing tests pass
- [ ] New unit tests cover: envelope building, correlationId, replyTo, subject delegation, full field mapping
- [ ] README.md updated with high-level API example and recommended patterns
- [ ] `docs/outbox-configuration.md` updated with new method and comparison
- [ ] `docs/request-reply-patterns.md` updated with combined section
- [ ] `docs/request-reply-guidelines.md` updated with outbox guidance
- [ ] `docs/examples/outbox-request-reply.example.ts` created
- [ ] No circular dependencies
- [ ] Linter passes
- [ ] Build passes

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/outbox/async-request-event-context.interface.ts` | CREATE | `AsyncRequestEventContext` type — `EventContext` with required `replyTo` |
| `src/outbox/send-async-request-through-outbox-options.interface.ts` | CREATE | `SendAsyncRequestThroughOutboxOptions<T>` type |
| `src/outbox/send-async-request-through-outbox-result.interface.ts` | CREATE | `SendAsyncRequestThroughOutboxResult` type |
| `src/outbox/outbox.service.ts` | MODIFY | Add `sendAsyncRequestThroughOutbox<T>()` method + imports |
| `src/outbox/index.ts` | MODIFY | Export 3 new types |
| `src/outbox/outbox.service.send-async-request.spec.ts` | CREATE | Unit tests for new method |
| `docs/examples/outbox-request-reply.example.ts` | CREATE | Combined outbox + request-reply example |
| `README.md` | MODIFY | Update "Request-Reply Through the Outbox" section with high-level API and recommended patterns |
| `docs/outbox-configuration.md` | MODIFY | Add high-level API docs and update comparison table |
| `docs/request-reply-patterns.md` | MODIFY | Add Section 9: Combining Request-Reply with the Outbox |
| `docs/request-reply-guidelines.md` | MODIFY | Update outbox guidance table and add method guidance |

---

## What Was NOT Done

- No changes to `RequestReplyService` — no circular dependency introduced
- No changes to existing `sendRequestThroughOutbox(event, subject)` — backward-compatible, low-level API preserved
- No changes to `outbox-request-reply.helpers.ts` — the `ensureReplyToPresent` assertion is kept for the low-level API; the high-level API relies on TypeScript enforcement
- No changes to `src/index.ts` — already re-exports all of `./outbox`
- No changes to `.agent/project-structure.md` — all new files are in existing `src/outbox/` directory