# Plan: Task 4 — Outbox Integration with Request-Reply

## Pre-Analysis

### Current State

- `OutboxService` already provides `saveToOutbox(event, subject)` which persists any `EventEnvelope` (including those with `reply_to`) via the repository. The serialized `eventData` JSON preserves all envelope fields, including `reply_to`.
- The background processor reads pending entries, calls `producerService.publish(entry.subject, parseEnvelope(entry))`, and `parseEnvelope` deserializes the full `EventEnvelope` including `reply_to`. So **normal outbox processing already preserves `reply_to`**.
- **Bug found**: `createDlqEnvelope` in `outbox.utils.ts` constructs a new envelope for DLQ but does **NOT** copy the `reply_to` field. When a request-reply event is routed to DLQ after max retries, the `reply_to` field is lost, making it impossible to correlate the DLQ entry back to the original request flow.
- `OutboxService` currently has no convenience method for request-reply specific outbox usage. Developers must remember to set `reply_to` on the envelope before calling `saveToOutbox`.
- `outbox.service.ts` is at 195 lines (limit: 200). Adding more than 5 lines would exceed the limit.

### Design Decisions

1. **New `sendRequestThroughOutbox(event, subject)` method**: Validated convenience wrapper over `saveToOutbox` that:
   - Asserts `event.reply_to` is present (throws `OutboxRequestReplyException` if missing)
   - Delegates to `saveToOutbox` for persistence
   - Self-documenting: the method name makes intent clear

2. **New `OutboxRequestReplyException` class**: Follows existing exception pattern (`EventConsumerException`, `RequestReplyException`) — class + Options interface, in its own file to keep service file thin.

3. **`ensureReplyToPresent` helper function**: Pure validation utility in a new helpers file. Keeps `OutboxService` under 200 lines.

4. **Fix `createDlqEnvelope`**: Add `reply_to: envelope.reply_to` to preserve the field in DLQ entries.

5. **Documentation**: Add request-reply outbox guidance in `docs/outbox-configuration.md` and `README.md`.

---

## Implementation Steps

### Step 1: Create `src/outbox/outbox-request-reply.exception.ts`

Create a new exception class following the existing pattern (same structure as `EventConsumerException` and `RequestReplyException`).

**File**: `src/outbox/outbox-request-reply.exception.ts`

```typescript
/**
 * Thrown when a request-reply outbox operation receives an event
 * that lacks the required `reply_to` field.
 */
export class OutboxRequestReplyException extends Error {
  /** Event ID of the event missing `reply_to`. */
  readonly eventId: string;

  /** Event type (dot-notation) of the event missing `reply_to`. */
  readonly eventType: string;

  /**
   * Creates an OutboxRequestReplyException indicating that a request-reply
   * event could not be processed through the outbox due to a missing `reply_to`.
   */
  constructor(options: OutboxRequestReplyExceptionOptions) {
    super(options.message);
    this.name = 'OutboxRequestReplyException';
    this.eventId = options.eventId;
    this.eventType = options.eventType;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OutboxRequestReplyException);
    }
  }
}

/** Options for constructing an {@link OutboxRequestReplyException}. */
export interface OutboxRequestReplyExceptionOptions {
  /** Human-readable error message. */
  message: string;
  /** Event ID of the event missing `reply_to`. */
  eventId: string;
  /** Event type (dot-notation) of the event. */
  eventType: string;
}
```

**Estimated lines**: ~35 — well under 200 limit.

---

### Step 2: Create `src/outbox/outbox-request-reply.helpers.ts`

Pure validation helper to keep `OutboxService` thin and under the 200-line limit.

**File**: `src/outbox/outbox-request-reply.helpers.ts`

```typescript
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { OutboxRequestReplyException } from './outbox-request-reply.exception';

/** Asserts that `event.reply_to` is present; throws otherwise. */
export function ensureReplyToPresent(event: EventEnvelope<unknown>): asserts event is EventEnvelope<unknown> & { reply_to: string } {
  if (!event.reply_to) {
    throw new OutboxRequestReplyException({
      message: `sendRequestThroughOutbox requires event with reply_to; event ${event.id} (${event.type}) is missing reply_to`,
      eventId: event.id,
      eventType: event.type,
    });
  }
}
```

**Estimated lines**: ~13 — well under limits.

---

### Step 3: Modify `src/outbox/outbox.service.ts`

Add the `sendRequestThroughOutbox` method to `OutboxService`.

**Changes**:
1. Add import for `ensureReplyToPresent` from `./outbox-request-reply.helpers`
2. Add the public `sendRequestThroughOutbox` method (3 lines of code)

**Exact insertion** — Add import at line 2-3 area (before `OutboxLogContext` import):

After the existing import block, add:
```typescript
import { ensureReplyToPresent } from './outbox-request-reply.helpers';
```

**New method** — Insert after `saveToOutbox` method (after line 58):

```typescript
  /** Persists a request-reply event to the outbox after validating `reply_to` is present. */
  async sendRequestThroughOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    ensureReplyToPresent(event);
    await this.saveToOutbox(event, subject);
  }
```

**Line count impact**: +1 import line + 4 method lines = +5 lines. Current: 195 → 200. Exactly at limit. If it goes over, compress one existing blank line between methods.

---

### Step 4: Fix `src/outbox/outbox.utils.ts` — Preserve `reply_to` in DLQ envelope

**Change**: In the `createDlqEnvelope` function, add `reply_to: envelope.reply_to` to the envelope construction.

**Current** (lines 42-59):
```typescript
export function createDlqEnvelope(
  envelope: EventEnvelope<unknown>,
  dlqPayload: Record<string, unknown>,
): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id: envelope.id,
    produced_at: new Date().toISOString(),
    type: envelope.type,
    version: envelope.version,
    producer: envelope.producer,
    company_id: envelope.company_id,
    actor_type: envelope.actor_type,
    actor_id: envelope.actor_id,
    correlation_id: envelope.correlation_id,
    causation_id: envelope.causation_id,
    trace_id: envelope.trace_id,
    data: dlqPayload,
  });
}
```

**Updated**: Add `reply_to: envelope.reply_to` after the `trace_id` line:

```typescript
    trace_id: envelope.trace_id,
    reply_to: envelope.reply_to,
    data: dlqPayload,
```

**Line count**: +1 line (60 → 61). Under limits.

---

### Step 5: Update `src/outbox/index.ts` — Export new types

Add exports for the new exception and helper.

**Current file** (20 lines), add after the existing exports:

```typescript
export { OutboxRequestReplyException, OutboxRequestReplyExceptionOptions } from './outbox-request-reply.exception';
```

---

### Step 6: Add tests for `sendRequestThroughOutbox`

**File**: `src/outbox/outbox.service.request-reply.spec.ts` (new file)

Test cases:
1. `sendRequestThroughOutbox` saves the event to the outbox when `reply_to` is present
2. `sendRequestThroughOutbox` throws `OutboxRequestReplyException` when `reply_to` is missing
3. `sendRequestThroughOutbox` delegates to `saveToOutbox` with correct arguments
4. `sendRequestThroughOutbox` calls `logOutboxSaved` with expected context

**File**: `src/outbox/outbox.service.request-reply.spec.ts`

```typescript
import { OutboxService } from './outbox.service';
import { createTestEnvelope, createOutboxMocks, createService, resetMocks } from './outbox.service.fixture';
import { OutboxRequestReplyException } from './outbox-request-reply.exception';

describe('OutboxService — sendRequestThroughOutbox', () => {
  let mocks: ReturnType<typeof createOutboxMocks>;
  let service: OutboxService;

  beforeEach(() => {
    mocks = createOutboxMocks();
    service = createService(mocks);
    resetMocks(mocks);
  });

  it('saves event to outbox when reply_to is present', async () => {
    const envelope = createTestEnvelope();
    envelope.reply_to = 'company.550e8400...credit.check.requested.response.v1';
    const subject = 'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1';

    await service.sendRequestThroughOutbox(envelope, subject);

    expect(mocks.repository.save).toHaveBeenCalledWith({ event: envelope, subject });
  });

  it('throws OutboxRequestReplyException when reply_to is missing', async () => {
    const envelope = createTestEnvelope();
    // createTestEnvelope does not set reply_to — it's undefined

    await expect(
      service.sendRequestThroughOutbox(envelope, 'some.subject'),
    ).rejects.toThrow(OutboxRequestReplyException);
  });

  it('throws with correct event metadata in exception', async () => {
    const envelope = createTestEnvelope();

    try {
      await service.sendRequestThroughOutbox(envelope, 'some.subject');
      fail('Expected OutboxRequestReplyException');
    } catch (error) {
      expect(error).toBeInstanceOf(OutboxRequestReplyException);
      const ex = error as OutboxRequestReplyException;
      expect(ex.eventId).toBe(envelope.id);
      expect(ex.eventType).toBe(envelope.type);
    }
  });

  it('logs outbox saved with correct context', async () => {
    const envelope = createTestEnvelope();
    envelope.reply_to = 'company.550e8400...credit.check.requested.response.v1';
    const subject = 'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1';

    await service.sendRequestThroughOutbox(envelope, subject);

    expect(mocks.logger.logOutboxSaved).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: envelope.id, subject }),
    );
  });
});
```

**Estimated lines**: ~50 lines — under limits.

---

### Step 7: Add DLQ `reply_to` preservation test

**File**: `src/outbox/outbox.service.retry-dlq.spec.ts`

Add a new test inside the `"processing — DLQ routing"` describe block:

```typescript
    it('preserves reply_to in the DLQ envelope when original event has reply_to', async () => {
      const envelopeWithReplyTo = createTestEnvelope();
      envelopeWithReplyTo.reply_to = 'company.550e8400...credit.check.requested.response.v1';
      const entryWithReplyTo = createTestEntry({
        eventData: JSON.stringify(envelopeWithReplyTo),
        attempts: 3,
      });
      mocks.repository.getPending.mockResolvedValue([entryWithReplyTo]);
      mocks.producerService.publish.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      jest.useFakeTimers();
      service.startProcessor();
      await jest.advanceTimersByTimeAsync(5000);

      const dlqCall = mocks.producerService.publish.mock.calls[1];
      const dlqEnvelope = dlqCall[1] as EventEnvelope<unknown>;
      expect(dlqEnvelope.reply_to).toBe('company.550e8400...credit.check.requested.response.v1');
      jest.useRealTimers();
    });
```

Also add `EventEnvelope` to the imports at the top of the file (check if it's already imported — it is on line 1).

---

### Step 8: Update `src/outbox/outbox.utils.spec.ts` — Test `createDlqEnvelope` preserves `reply_to`

Add a test to the existing `outbox.utils.spec.ts`:

```typescript
  describe('createDlqEnvelope', () => {
    it('preserves reply_to from the original envelope', () => {
      const envelopeWithReplyTo = { ...defaultEnvelope, reply_to: 'company.123.response.v1' } as EventEnvelope<unknown>;
      const payload = { error: 'test' };
      // ... existing pattern
      const result = createDlqEnvelope(envelopeWithReplyTo, payload);
      expect(result.reply_to).toBe('company.123.response.v1');
    });

    it('omits reply_to when original envelope does not have it', () => {
      const result = createDlqEnvelope(defaultEnvelope, { error: 'test' });
      expect(result.reply_to).toBeUndefined();
    });
  });
```

Exact structure depends on the existing test file. Read and adapt.

---

### Step 9: Update `docs/outbox-configuration.md` — Add request-reply guidance section

Add a new section before the "Migration from 0.x API" section. Insert after line ~180 (after the "Usage After Configuration" section).

**New section**:

```markdown
## Request-Reply with the Outbox

The Outbox module works transparently with request-reply events. When a request event includes `reply_to`, the outbox processor preserves it through the entire publish-retry-DLQ pipeline.

### When to use the Outbox with Request-Reply

| Pattern | Outbox for Request? | Outbox for Response? |
| ------- | ------------------- | -------------------- |
| Sync (`request()`) | ❌ No — uses NATS built-in reply | ❌ No — NATS handles the reply inbox |
| Async (`sendRequest()`) | ✅ Yes — saves request to outbox, processor publishes with `reply_to` intact | ⚠️ Only if handler has side effects that need transactional safety |

### Async Request Through Outbox

Use `sendRequestThroughOutbox` for async request-reply flows where the request must survive service restarts:

```typescript
import { OutboxService, SubjectBuilder, EventContext, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<void> {
    const requestSubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'requested', version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'requested.response', version: '1',
    });

    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const event = new CreditCheckRequestedEvent({ clientId }, context);

    // Outbox ensures the request is published even if NATS is temporarily down
    await this.outboxService.sendRequestThroughOutbox(event, requestSubject);
  }
}
```

### Response Handling

Response handlers typically do **not** need the outbox pattern unless they perform other side effects that require transactional safety. Use `RequestReplyService.sendResponse()` or `ProducerService.publish()` directly:

```typescript
@OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })
async onCreditCheckRequested(event: EventEnvelope<CreditCheckRequestedData>): Promise<void> {
  if (!this.requestReply.isRequestReplyMessage(event)) { return; }

  const result = await this.performCheck(event.data);
  const responseEvent = this.requestReply.buildResponseEnvelope({
    requestEvent: event,
    responseContext: { /* ... */ },
    responseData: result,
  });

  // Direct publish — no outbox needed for responses
  await this.requestReply.sendResponse(event.correlation_id, responseEvent);
}
```

### Why `sendRequestThroughOutbox` instead of `saveToOutbox`?

- `sendRequestThroughOutbox` validates that `reply_to` is set before saving. Calling `saveToOutbox` with an event missing `reply_to` would result in a fire-and-forget event, silently breaking the request-reply flow.
- `sendRequestThroughOutbox` is self-documenting: the method name clearly communicates that the event is part of a request-reply exchange.

### DLQ Preservation

If a request-reply event exceeds `maxRetries` and is routed to the Dead Letter Queue, its `reply_to` field is preserved in the DLQ envelope. This allows DLQ monitoring systems to trace the original request context and understand which request flow was affected.
```

---

### Step 10: Update `README.md` — Add request-reply outbox example

In the "Outbox Pattern" section (around line 458-514), add a subsection after the PostgreSQL configuration example and before the "Subject Builder" section.

**Insert after line 514** (after the PostgreSQL configuration block):

```markdown
#### Request-Reply Through the Outbox

For async request-reply patterns, use `sendRequestThroughOutbox` to persist the request event with `reply_to` intact:

```typescript
import {
  OutboxService, SubjectBuilder, EventContext,
  ActorType, generateUuidV7,
} from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<void> {
    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: this.subjectBuilder.build({
        companyId, domain: 'credit', entity: 'check',
        action: 'requested.response', version: '1',
      }),
    };

    const event = new CreditCheckRequestedEvent({ clientId }, context);
    await this.outboxService.sendRequestThroughOutbox(
      event,
      this.subjectBuilder.build({
        companyId, domain: 'credit', entity: 'check',
        action: 'requested', version: '1',
      }),
    );
  }
}
```

See [Request-Reply Patterns](docs/request-reply-patterns.md) for full async pattern documentation and [Outbox Configuration](docs/outbox-configuration.md) for request-reply outbox guidance.
```

---

### Step 11: Update barrel export — `src/outbox/index.ts`

Add the new exception export after the existing `OutboxServiceOptions` line:

```typescript
export { OutboxRequestReplyException, OutboxRequestReplyExceptionOptions } from './outbox-request-reply.exception';
```

Then verify `src/index.ts` already re-exports from `./outbox` (it does via `export * from './outbox'`), so no changes needed at the root barrel.

---

### Step 12: Update `.agent/project-structure.md`

No structural folder changes — the new files go into existing `src/outbox/`. No update needed.

---

### Step 13: Run Tests & Build

```bash
npm run build
npm test
```

Verify:
- All existing tests pass
- New `sendRequestThroughOutbox` tests pass
- New `createDlqEnvelope` `reply_to` test passes
- New DLQ `reply_to` preservation integration test passes
- No type errors

---

### Step 14: Lint Check

```bash
npm run lint
```

Fix any lint errors.

---

## Summary of File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/outbox/outbox-request-reply.exception.ts` | **NEW** | Custom exception for outbox request-reply validation (~35 lines) |
| `src/outbox/outbox-request-reply.helpers.ts` | **NEW** | Validation helper `ensureReplyToPresent` (~13 lines) |
| `src/outbox/outbox.service.request-reply.spec.ts` | **NEW** | Unit tests for `sendRequestThroughOutbox` (~50 lines) |
| `src/outbox/outbox.service.ts` | **MODIFY** | Add import + `sendRequestThroughOutbox` method (~5 lines added) |
| `src/outbox/outbox.utils.ts` | **MODIFY** | Add `reply_to: envelope.reply_to` in `createDlqEnvelope` (+1 line) |
| `src/outbox/outbox.utils.spec.ts` | **MODIFY** | Add tests for `createDlqEnvelope` preserving `reply_to` |
| `src/outbox/outbox.service.retry-dlq.spec.ts` | **MODIFY** | Add test for DLQ preserving `reply_to` |
| `src/outbox/outbox.service.spec.ts` | **MODIFY** | No changes needed (existing `saveToOutbox` tests cover delegation) |
| `src/outbox/index.ts` | **MODIFY** | Add export for `OutboxRequestReplyException` |
| `docs/outbox-configuration.md` | **MODIFY** | Add request-reply guidance section |
| `README.md` | **MODIFY** | Add request-reply outbox example in Outbox section |

## Constraints Verification

- ✅ Max 200 lines per file: `outbox.service.ts` → 200 lines exactly (at limit)
- ✅ Max 50 lines per method: `sendRequestThroughOutbox` → 3 lines
- ✅ Max 2 params per method: `sendRequestThroughOutbox(event, subject)` → 2 params
- ✅ Self-documenting code: method name and JSDoc make intent clear
- ✅ No commented-out code
- ✅ Max 2 levels of indentation: all new code is flat
- ✅ Prefer private members: `ensureReplyToPresent` is a module-level helper, new public method is necessary for API

## Risks

1. **Line count in `outbox.service.ts`**: Adding imports and method pushes to exactly 200. If import formatting or blank lines push over, compress existing blank lines between methods.
2. **DLQ `reply_to` test**: The DLQ envelope creation in the test requires creating an envelope with `reply_to` set and asserting it's preserved. Must verify the mock setup allows this.