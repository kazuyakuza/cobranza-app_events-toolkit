# Plan: Task 3 — DLQ Improvements

**TODO Reference:** `.agent/todos/20260616/20260616-todo-0.md` — Task 3: DLQ Improvements

---

## Pre-Analysis

### Current State

1. **`buildDlqSubject`** exists in two places but NOT in `subject.builder.ts`:
   - `src/outbox/outbox.utils.ts`: `buildDlqSubject(subject)` → `dlq.${subject}`
   - `src/consumer/subscribe-options.interface.ts`: `defaultDlqSubjectBuilder(subject)` → `dlq.${subject}`
   - Both are simple `dlq.` prefix functions with identical behavior.

2. **`EventConsumerException`** (`src/common/errors/event-consumer.exception.ts`):
   - Has: `eventId`, `eventType`, `correlationId?`, `cause?`
   - Missing: `dlqReason`, `originalSubject`, `retryCount`

3. **`JetStreamConsumerService`** (`src/consumer/jetstream-consumer.service.ts`):
   - Routes `EventConsumerException` to DLQ **immediately** (no retry counting) via `routeToDlq()`.
   - This is correct for business errors (they should NOT be retried).
   - Generic errors get `nak()` (NATS will retry per consumer config).
   - No `moveToDlq()` public method exists.
   - DLQ payload includes `originalSubject`, `originalPayload`, `error`, `failedAt` but NOT `dlqReason` or `retryCount`.

4. **`EventErrorLogContext`** (`src/logging/event-logger.service.ts`):
   - Has: `eventId`, `eventType`, `subject`, `correlationId?`, `error`, `stack?`
   - Does NOT include `dlqReason` or `retryCount`.

5. **Documentation** (`docs/event-messaging-convention.md`):
   - Section 4.3 has minimal DLQ info (just subject pattern and "after max retries" note).
   - No retention policy recommendation.

### Design Decisions

- **`buildDlqSubject` in `subject.builder.ts`**: Centralize DLQ subject construction. The function will simply prefix `dlq.` to match existing behavior (no subject format validation, since DLQ subjects can also be built from wildcard subscription subjects).
- **`EventConsumerException` new fields**: All optional. `dlqReason` for explicit DLQ reason, `originalSubject` for the original NATS subject, `retryCount` for tracking attempts.
- **Immediate DLQ routing for `EventConsumerException`**: Keep current behavior. Business errors should go to DLQ immediately, not after retries. The `retryCount` field is metadata that consumers can set if they're doing their own retry counting.
- **`moveToDlq()` method**: Public method on `JetStreamConsumerService` for manual DLQ routing. Accepts a `MoveToDlqOptions` object (following max-arguments-per-method rule).
- **`defaultDlqSubjectBuilder`**: Update to delegate to `buildDlqSubject` from `subject.builder.ts` for DRY.
- **Outbox `buildDlqSubject`**: Keep as-is since it's in the outbox domain. The centralized `buildDlqSubject` in `subject.builder.ts` becomes the canonical implementation used by `defaultDlqSubjectBuilder`.

---

## Implementation Plan

### Step 1: Add `DLQ_SUBJECT_PREFIX` constant and `buildDlqSubject` to `subject.builder.ts`

**File:** `src/common/utils/subject.builder.ts`

Add after the `RESPONSE_SUFFIX` constant (line 56):

```ts
/** Prefix prepended to subjects when deriving Dead Letter Queue (DLQ) subjects. */
export const DLQ_SUBJECT_PREFIX = 'dlq.';
```

Add after `buildResponseSubject` (at end of file):

```ts
/**
 * Builds a Dead Letter Queue (DLQ) subject by prepending {@link DLQ_SUBJECT_PREFIX}
 * to the original subject.
 *
 * Follows the convention defined in Section 4.3 of the event-messaging convention:
 * - Original: `company.{id}.{domain}.{entity}.{action}.v{version}`
 * - DLQ:      `dlq.company.{id}.{domain}.{entity}.{action}.v{version}`
 *
 * Works with any subject string, including wildcard patterns used in subscriptions.
 *
 * @param originalSubject - The original NATS subject (or pattern) to derive the DLQ subject from.
 * @returns DLQ subject string with `dlq.` prefix.
 *
 * @example
 * ```ts
 * buildDlqSubject('company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1');
 * // => 'dlq.company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1'
 *
 * buildDlqSubject('company.*.payment.proof.uploaded.v1');
 * // => 'dlq.company.*.payment.proof.uploaded.v1'
 * ```
 *
 * @see docs/event-messaging-convention.md — Section 4.3 (Dead Letter Queue)
 */
export function buildDlqSubject(originalSubject: string): string {
  return `${DLQ_SUBJECT_PREFIX}${originalSubject}`;
}
```

**Verification:** Function signature matches `buildDlqSubject(originalSubject: string): string`. Works with both concrete subjects and wildcard patterns.

---

### Step 2: Export `buildDlqSubject` and `DLQ_SUBJECT_PREFIX` from barrel

**File:** `src/common/utils/index.ts`

Update the existing export line from `subject.builder`:

```ts
export { SubjectBuilder, buildSubject, buildResponseSubject, RESPONSE_SUFFIX, buildDlqSubject, DLQ_SUBJECT_PREFIX } from './subject.builder';
```

Since `src/common/index.ts` already re-exports `./utils`, and `src/index.ts` re-exports `./common`, both symbols will automatically be available in the public API.

**Verification:** `buildDlqSubject` and `DLQ_SUBJECT_PREFIX` are importable from `@cobranza-apps/events-toolkit`.

---

### Step 3: Update `defaultDlqSubjectBuilder` to delegate to `buildDlqSubject`

**File:** `src/consumer/subscribe-options.interface.ts`

Replace the current inline implementation:

```ts
// Before:
export function defaultDlqSubjectBuilder(subject: string): string {
  return `dlq.${subject}`;
}

// After:
import { buildDlqSubject } from '../common/utils/subject.builder';

/** Builds a DLQ subject by delegating to the centralized {@link buildDlqSubject}. */
export function defaultDlqSubjectBuilder(subject: string): string {
  return buildDlqSubject(subject);
}
```

**Verification:** `defaultDlqSubjectBuilder` still returns `dlq.${subject}` but now uses the canonical implementation.

---

### Step 4: Add unit tests for `buildDlqSubject` and `DLQ_SUBJECT_PREFIX`

**File:** `src/common/utils/subject.builder.spec.ts`

Update the import line at the top:

```ts
import { SubjectBuilder, buildSubject, buildResponseSubject, RESPONSE_SUFFIX, buildDlqSubject, DLQ_SUBJECT_PREFIX } from './subject.builder';
```

Add new `describe` blocks after the `RESPONSE_SUFFIX` tests (after line 179):

```ts
describe('buildDlqSubject()', () => {
  it('prefixes a standard subject with dlq.', () => {
    const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
    expect(buildDlqSubject(subject)).toBe(
      'dlq.company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1',
    );
  });

  it('prefixes a wildcard subscription subject with dlq.', () => {
    const subject = 'company.*.payment.proof.uploaded.v1';
    expect(buildDlqSubject(subject)).toBe('dlq.company.*.payment.proof.uploaded.v1');
  });

  it('prefixes any arbitrary string with dlq.', () => {
    expect(buildDlqSubject('test.subject')).toBe('dlq.test.subject');
  });

  it('produces double dlq. when input already has dlq. prefix', () => {
    expect(buildDlqSubject('dlq.company.abc.payment.proof.uploaded.v1')).toBe(
      'dlq.dlq.company.abc.payment.proof.uploaded.v1',
    );
  });
});

describe('DLQ_SUBJECT_PREFIX', () => {
  it('equals dlq.', () => {
    expect(DLQ_SUBJECT_PREFIX).toBe('dlq.');
  });
});
```

**Verification:** All new tests pass.

---

### Step 5: Enhance `EventConsumerException` with new optional fields

**File:** `src/common/errors/event-consumer.exception.ts`

Replace the entire file content with:

```ts
/**
 * Thrown by event consumers when message processing fails and the message
 * should be routed to the Dead Letter Queue (DLQ).
 *
 * JetStreamConsumerService catches this exception and forwards the failed
 * message to the corresponding DLQ subject:
 *   dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}
 *
 * Optional metadata fields (`dlqReason`, `originalSubject`, `retryCount`)
 * are included in the DLQ payload for observability and debugging.
 *
 * @see docs/event-messaging-convention.md — Section 4.3 (Dead Letter Queue)
 */
export class EventConsumerException extends Error {
  /** Event ID of the message that failed processing. */
  readonly eventId: string;

  /** Event type (dot-notation) of the message that failed processing. */
  readonly eventType: string;

  /** Correlation ID for tracing the failed request chain. Optional. */
  readonly correlationId?: string;

  /** The underlying error that caused the failure. Optional. */
  readonly cause?: Error;

  /** Human-readable reason for DLQ routing. Optional; provides context beyond the error message. */
  readonly dlqReason?: string;

  /** Original NATS subject the message was consumed from. Optional; populated by the consumer service. */
  readonly originalSubject?: string;

  /** Number of delivery attempts before routing to DLQ. Optional. */
  readonly retryCount?: number;

  /**
   * Creates an EventConsumerException with DLQ routing context.
   *
   * @param options - Exception options including event metadata, the underlying cause, and optional DLQ metadata.
   */
  constructor(options: EventConsumerExceptionOptions) {
    super(options.message);
    this.name = 'EventConsumerException';
    this.eventId = options.eventId;
    this.eventType = options.eventType;
    this.correlationId = options.correlationId;
    this.cause = options.cause;
    this.dlqReason = options.dlqReason;
    this.originalSubject = options.originalSubject;
    this.retryCount = options.retryCount;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EventConsumerException);
    }
  }
}

/** Options for constructing an {@link EventConsumerException}. */
export interface EventConsumerExceptionOptions {
  /** Human-readable error message describing the failure. */
  message: string;
  /** Event ID of the message that failed processing. */
  eventId: string;
  /** Event type (dot-notation) of the message that failed processing. */
  eventType: string;
  /** Correlation ID for tracing the failed request chain. Optional. */
  correlationId?: string;
  /** The underlying error that caused the failure. Optional. */
  cause?: Error;
  /** Human-readable reason for DLQ routing. Optional. */
  dlqReason?: string;
  /** Original NATS subject the message was consumed from. Optional. */
  originalSubject?: string;
  /** Number of delivery attempts before routing to DLQ. Optional. */
  retryCount?: number;
}
```

**Verification:** New fields are all optional, backward-compatible. Existing `new EventConsumerException({ message, eventId, eventType })` calls still work.

---

### Step 6: Create unit tests for new `EventConsumerException` fields

**File:** `src/common/errors/event-consumer.exception.spec.ts` (NEW FILE)

```ts
import { EventConsumerException } from './event-consumer.exception';

describe('EventConsumerException', () => {
  it('creates exception with required fields only', () => {
    const exception = new EventConsumerException({
      message: 'Test error',
      eventId: 'evt_123',
      eventType: 'payment.proof.uploaded',
    });

    expect(exception.message).toBe('Test error');
    expect(exception.name).toBe('EventConsumerException');
    expect(exception.eventId).toBe('evt_123');
    expect(exception.eventType).toBe('payment.proof.uploaded');
    expect(exception.correlationId).toBeUndefined();
    expect(exception.cause).toBeUndefined();
    expect(exception.dlqReason).toBeUndefined();
    expect(exception.originalSubject).toBeUndefined();
    expect(exception.retryCount).toBeUndefined();
  });

  it('creates exception with all optional fields', () => {
    const cause = new Error('root cause');
    const exception = new EventConsumerException({
      message: 'Business rule violation',
      eventId: 'evt_456',
      eventType: 'debt.schedule.generated',
      correlationId: 'corr_789',
      cause,
      dlqReason: 'Invalid schedule parameters',
      originalSubject: 'company.abc.debt.schedule.generated.v1',
      retryCount: 3,
    });

    expect(exception.message).toBe('Business rule violation');
    expect(exception.eventId).toBe('evt_456');
    expect(exception.eventType).toBe('debt.schedule.generated');
    expect(exception.correlationId).toBe('corr_789');
    expect(exception.cause).toBe(cause);
    expect(exception.dlqReason).toBe('Invalid schedule parameters');
    expect(exception.originalSubject).toBe('company.abc.debt.schedule.generated.v1');
    expect(exception.retryCount).toBe(3);
  });

  it('preserves stack trace when Error.captureStackTrace is available', () => {
    const exception = new EventConsumerException({
      message: 'Stack test',
      eventId: 'evt_stack',
      eventType: 'test.event',
    });
    expect(exception.stack).toBeDefined();
  });

  it('allows retryCount without dlqReason', () => {
    const exception = new EventConsumerException({
      message: 'Max retries exceeded',
      eventId: 'evt_retry',
      eventType: 'notification.sent',
      retryCount: 5,
    });
    expect(exception.retryCount).toBe(5);
    expect(exception.dlqReason).toBeUndefined();
  });
});
```

**Verification:** All new tests pass.

---

### Step 7: Create `MoveToDlqOptions` interface

**File:** `src/consumer/move-to-dlq-options.interface.ts` (NEW FILE)

Following the max-arguments-per-method rule (encapsulate >2 params in an object):

```ts
import { JsMsg } from 'nats';

/** Options for manually routing a message to the Dead Letter Queue. */
export interface MoveToDlqOptions {
  /** JetStream message to route to the DLQ. */
  message: JsMsg;
  /** Human-readable reason for moving the message to the DLQ. */
  reason: string;
  /** Original NATS subject the message was consumed from. Defaults to `message.subject`. */
  subject?: string;
  /** Original payload of the message. If not provided, an empty object is used. */
  originalPayload?: Record<string, unknown>;
}
```

---

### Step 8: Update `EventErrorLogContext` with new optional fields

**File:** `src/logging/event-logger.service.ts`

Add `dlqReason` and `retryCount` to the `EventErrorLogContext` interface (around line 141):

```ts
/** Metadata context for error and DLQ event log entries. */
export interface EventErrorLogContext extends EventLogContext {
  /** Error message describing the failure. */
  error: string;
  /** Stack trace of the underlying error. Optional. */
  stack?: string;
  /** Human-readable reason for DLQ routing. Optional. */
  dlqReason?: string;
  /** Number of delivery attempts before routing to DLQ. Optional. */
  retryCount?: number;
}
```

---

### Step 9: Update `JetStreamConsumerService` — add `moveToDlq` and update `routeToDlq`

**File:** `src/consumer/jetstream-consumer.service.ts`

#### 9a. Add imports:

Add `MoveToDlqOptions` to the imports:

```ts
import { MoveToDlqOptions } from './move-to-dlq-options.interface';
```

#### 9b. Add `moveToDlq` public method:

Insert after the `processMessage` method (around line 61), before `processSubscription`:

```ts
/**
 * Manually routes a JetStream message to the Dead Letter Queue.
 *
 * Use when a consumer needs to explicitly move a message to the DLQ
 * outside the automatic exception-handling flow (e.g., after custom retry logic).
 *
 * @param options - Message, reason, and optional subject/payload for DLQ routing.
 */
async moveToDlq(options: MoveToDlqOptions): Promise<void> {
  const subject = options.subject ?? options.message.subject;
  const dlqSubject = this.dlqSubjectBuilder(subject);
  const dlqPayload = this.buildManualDlqPayload(subject, options);
  await this.publishDlqOrNak(dlqSubject, dlqPayload, options.message, subject);
}

/** Builds a DLQ payload for manual routing via {@link moveToDlq}. */
private buildManualDlqPayload(subject: string, options: MoveToDlqOptions): Record<string, unknown> {
  return {
    originalSubject: subject,
    originalPayload: options.originalPayload ?? {},
    error: {
      name: 'ManualDLQRouting',
      message: options.reason,
    },
    failedAt: new Date().toISOString(),
  };
}

/** Publishes a DLQ payload; naks the message if publish fails. */
private async publishDlqOrNak(
  dlqSubject: string,
  dlqPayload: Record<string, unknown>,
  msg: JsMsg,
  originalSubject: string,
): Promise<void> {
  try {
    await this.jetStream.publish(dlqSubject, encodeEvent(dlqPayload));
    msg.ack();
  } catch (publishError: unknown) {
    this.logGeneralError(publishError, originalSubject);
    msg.nak();
  }
}
```

#### 9c. Update `routeToDlq` to include new metadata and use `publishDlqOrNak`:

Replace the existing `routeToDlq` method:

```ts
private async routeToDlq(options: DlqRoutingOptions): Promise<void> {
  const { exception, msg, subject, originalPayload } = options;
  const dlqSubject = this.dlqSubjectBuilder(subject);
  const errorCtx = this.exceptionToErrorContext(exception, subject);
  this.logger.logEventDlq(errorCtx);
  const dlqPayload = this.buildExceptionDlqPayload(subject, exception, originalPayload);
  await this.publishDlqOrNak(dlqSubject, dlqPayload, msg, subject);
}

/** Builds a DLQ payload from an {@link EventConsumerException}, including optional metadata. */
private buildExceptionDlqPayload(
  subject: string,
  exception: EventConsumerException,
  originalPayload?: Record<string, unknown>,
): Record<string, unknown> {
  const errorInfo = this.buildErrorInfo(exception);
  return {
    originalSubject: exception.originalSubject ?? subject,
    originalPayload: originalPayload ?? {},
    error: errorInfo,
    failedAt: new Date().toISOString(),
  };
}

/** Extracts error info from an {@link EventConsumerException}, including optional DLQ metadata. */
private buildErrorInfo(exception: EventConsumerException): Record<string, unknown> {
  const info: Record<string, unknown> = {
    name: exception.name,
    message: exception.message,
    eventId: exception.eventId,
    eventType: exception.eventType,
    correlationId: exception.correlationId,
    stack: exception.stack,
  };
  if (exception.dlqReason !== undefined) {
    info.dlqReason = exception.dlqReason;
  }
  if (exception.retryCount !== undefined) {
    info.retryCount = exception.retryCount;
  }
  return info;
}
```

#### 9d. Update `exceptionToErrorContext` to include new fields:

```ts
private exceptionToErrorContext(exception: EventConsumerException, subject: string): EventErrorLogContext {
  return {
    eventId: exception.eventId,
    eventType: exception.eventType,
    subject,
    correlationId: exception.correlationId,
    error: exception.message,
    stack: exception.stack,
    dlqReason: exception.dlqReason,
    retryCount: exception.retryCount,
  };
}
```

**Verification:** Existing DLQ tests still pass. New fields appear in DLQ payload when provided. Method bodies are under 50 lines (extracted `buildExceptionDlqPayload`, `buildErrorInfo`, `publishDlqOrNak`).

---

### Step 10: Export `MoveToDlqOptions` from consumer barrel

**File:** `src/consumer/index.ts`

Add the export:

```ts
export { MoveToDlqOptions } from './move-to-dlq-options.interface';
```

---

### Step 11: Add unit tests for `moveToDlq` and updated `routeToDlq`

**File:** `src/consumer/jetstream-consumer.service.spec.ts`

#### 11a. Add import:

```ts
import { MoveToDlqOptions } from './move-to-dlq-options.interface';
```

#### 11b. Add `moveToDlq` test suite:

Insert after the existing `subscribe` describe block (before the closing `});`):

```ts
describe('moveToDlq', () => {
  it('should publish to DLQ subject and ack the message', async () => {
    const msg = createJsMsg(createValidEventJson(), testSubject);

    await service.moveToDlq({
      message: msg,
      reason: 'Manual DLQ routing',
    });

    expect(jetStream.publish).toHaveBeenCalledTimes(1);
    const [dlqSubject, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
    expect(dlqSubject).toBe(`dlq.${testSubject}`);
    const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
    expect(dlqPayload.originalSubject).toBe(testSubject);
    expect(dlqPayload.error.message).toBe('Manual DLQ routing');
    expect(dlqPayload.error.name).toBe('ManualDLQRouting');
    expect(dlqPayload.failedAt).toBeDefined();

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nak).not.toHaveBeenCalled();
  });

  it('should use custom subject when provided', async () => {
    const customSubject = 'company.550e8400.custom.entity.action.v1';
    const msg = createJsMsg(createValidEventJson(), testSubject);

    await service.moveToDlq({
      message: msg,
      reason: 'Custom subject route',
      subject: customSubject,
    });

    const [dlqSubject] = jetStream.publish.mock.calls[0];
    expect(dlqSubject).toBe(`dlq.${customSubject}`);
  });

  it('should include originalPayload when provided', async () => {
    const msg = createJsMsg(createValidEventJson(), testSubject);
    const payload = { custom: 'data' };

    await service.moveToDlq({
      message: msg,
      reason: 'With payload',
      originalPayload: payload,
    });

    const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
    const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
    expect(dlqPayload.originalPayload).toEqual(payload);
  });

  it('should nack and log error when DLQ publish fails', async () => {
    jetStream.publish.mockRejectedValue(new Error('DLQ publish failed'));
    const msg = createJsMsg(createValidEventJson(), testSubject);

    await service.moveToDlq({
      message: msg,
      reason: 'Failed publish',
    });

    expect(msg.nak).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    expect(mockLogger.logEventError).toHaveBeenCalledTimes(1);
  });
});
```

#### 11c. Add test for `EventConsumerException` with new metadata in DLQ payload:

Inside the existing `processMessage — handler throws EventConsumerException` describe block, add:

```ts
it('should include dlqReason and retryCount in DLQ payload when provided on EventConsumerException', async () => {
  const consumerException = new EventConsumerException({
    message: 'Business rule violation',
    eventId: 'evt_test-123',
    eventType: 'payment.proof.uploaded',
    correlationId: '660e8400-e29b-41d4-a716-446655440001',
    dlqReason: 'Invalid payment amount',
    originalSubject: 'company.550e8400.payment.proof.uploaded.v1',
    retryCount: 3,
  });
  const handler = jest.fn().mockRejectedValue(consumerException);
  consumerService.registerHandler(testSubject, handler);

  const validData = createValidEventJson();
  const msg = createJsMsg(validData, testSubject);
  await service.processMessage(msg, testSubject);

  expect(jetStream.publish).toHaveBeenCalledTimes(1);
  const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
  const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
  expect(dlqPayload.error.dlqReason).toBe('Invalid payment amount');
  expect(dlqPayload.error.retryCount).toBe(3);
  expect(dlqPayload.originalSubject).toBe('company.550e8400.payment.proof.uploaded.v1');
});

it('should use consumer subject as originalSubject when exception does not provide one', async () => {
  const consumerException = new EventConsumerException({
    message: 'Business rule violation',
    eventId: 'evt_test-456',
    eventType: 'payment.proof.uploaded',
  });
  const handler = jest.fn().mockRejectedValue(consumerException);
  consumerService.registerHandler(testSubject, handler);

  const msg = createJsMsg(createValidEventJson(), testSubject);
  await service.processMessage(msg, testSubject);

  const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
  const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
  expect(dlqPayload.originalSubject).toBe(testSubject);
  expect(dlqPayload.error.dlqReason).toBeUndefined();
  expect(dlqPayload.error.retryCount).toBeUndefined();
});
```

**Verification:** All new and existing tests pass.

---

### Step 12: Update DLQ documentation in `event-messaging-convention.md`

**File:** `docs/event-messaging-convention.md`

Replace Section 4.3 (lines 195-198) with:

```md
### 4.3 Dead Letter Queue (DLQ)

Failed messages that cannot be processed are forwarded to a Dead Letter Queue subject for inspection and reprocessing.

**Subject pattern:** `dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}`

Built programmatically using `buildDlqSubject()`:

```ts
import { buildDlqSubject } from '@cobranza-apps/events-toolkit';

const dlqSubject = buildDlqSubject('company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1');
// => 'dlq.company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1'
```

Works with wildcard subscription patterns too:

```ts
buildDlqSubject('company.*.payment.proof.uploaded.v1');
// => 'dlq.company.*.payment.proof.uploaded.v1'
```

**Automatic DLQ routing:** When a consumer throws `EventConsumerException`, `JetStreamConsumerService` automatically routes the message to the DLQ subject. This is the recommended pattern for business validation errors that should not be retried.

**Manual DLQ routing:** For cases where you need explicit control, use `moveToDlq()`:

```ts
await this.consumerService.moveToDlq({
  message: jsMsg,
  reason: 'Custom validation failure',
  subject: originalSubject, // optional, defaults to message.subject
  originalPayload: payload, // optional
});
```

**EventConsumerException metadata:**

Optional fields on `EventConsumerException` enrich the DLQ payload for observability:

- `dlqReason`: Human-readable reason for DLQ routing (distinct from error message).
- `originalSubject`: Original NATS subject the message was consumed from.
- `retryCount`: Number of delivery attempts before routing to DLQ.

```ts
throw new EventConsumerException({
  message: 'Business rule violation',
  eventId: envelope.id,
  eventType: envelope.type,
  dlqReason: 'Invalid payment amount',
  originalSubject: subject,
  retryCount: 3,
});
```

**DLQ payload structure:**

```json
{
  "originalSubject": "company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1",
  "originalPayload": { ... },
  "error": {
    "name": "EventConsumerException",
    "message": "Business rule violation",
    "eventId": "evt_123",
    "eventType": "payment.proof.uploaded",
    "correlationId": "req_456",
    "stack": "...",
    "dlqReason": "Invalid payment amount",
    "retryCount": 3
  },
  "failedAt": "2026-06-16T14:30:00.000Z"
}
```

**Stream retention policy recommendation:**

DLQ streams should use longer retention than event streams to ensure failed messages are not lost:

| Stream Type | Retention | Max Age | Max_Msgs Per Subject |
|-------------|-----------|---------|---------------------|
| Event Stream | Limits | 7 days | 10,000 |
| DLQ Stream | Limits | 30 days | 100,000 |

Recommended JetStream stream configuration for DLQ:

```ts
await nc.jetstreamManager.streams.add({
  name: 'DLQ',
  subjects: ['dlq.>'],
  retention: 'limits',
  max_age: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days in nanoseconds
  max_msgs_per_subject: 100_000,
  storage: 'file',
  dedupe_window: 2 * 60 * 1_000_000_000, // 2 minutes in nanoseconds
});
```
```

---

### Step 13: Run test suite and build

**Commands:**

```bash
npm run test
npm run build
```

**Verification:** All existing and new tests pass. Build succeeds without errors.

---

### Step 14: Commit changes

```bash
git add -A
git status  # Verify only intended files are staged; no gitignored files
git commit -m "feat: add DLQ improvements — buildDlqSubject, EventConsumerException metadata, moveToDlq, retention docs"
```

---

### Step 15: Code review checklist

- [ ] All new fields are optional and backward-compatible
- [ ] No commented-out code
- [ ] File sizes within limits (max 200 lines for src/ files)
- [ ] Method bodies within limits (max 50 lines)
- [ ] Max 2 params per method (encapsulated in options objects where needed)
- [ ] Max depth of 2 nesting levels
- [ ] Self-documenting code (minimal comments, descriptive names)
- [ ] Barrel exports updated for all new symbols
- [ ] New `MoveToDlqOptions` type defined in its own file
- [ ] `DLQ_SUBJECT_PREFIX` constant avoids magic string

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/common/utils/subject.builder.ts` | Modify | Add `buildDlqSubject()`, `DLQ_SUBJECT_PREFIX` |
| `src/common/utils/subject.builder.spec.ts` | Modify | Add tests for `buildDlqSubject()` and `DLQ_SUBJECT_PREFIX` |
| `src/common/utils/index.ts` | Modify | Export `buildDlqSubject` and `DLQ_SUBJECT_PREFIX` |
| `src/common/errors/event-consumer.exception.ts` | Modify | Add `dlqReason`, `originalSubject`, `retryCount` fields |
| `src/common/errors/event-consumer.exception.spec.ts` | Create | Unit tests for new `EventConsumerException` fields |
| `src/consumer/jetstream-consumer.service.ts` | Modify | Add `moveToDlq()` public method; update `routeToDlq()` with new metadata; extract `buildExceptionDlqPayload`, `buildErrorInfo`, `publishDlqOrNak`, `buildManualDlqPayload` |
| `src/consumer/subscribe-options.interface.ts` | Modify | Update `defaultDlqSubjectBuilder` to delegate to `buildDlqSubject` |
| `src/consumer/move-to-dlq-options.interface.ts` | Create | `MoveToDlqOptions` interface |
| `src/consumer/jetstream-consumer.service.spec.ts` | Modify | Add tests for `moveToDlq` and new metadata in DLQ payload |
| `src/consumer/index.ts` | Modify | Export `MoveToDlqOptions` |
| `src/logging/event-logger.service.ts` | Modify | Add `dlqReason` and `retryCount` to `EventErrorLogContext` |
| `docs/event-messaging-convention.md` | Modify | Expand Section 4.3 with DLQ details and retention policy |

---

## Out of Scope

- **Updating `outbox.utils.ts` `buildDlqSubject`**: The outbox-specific `buildDlqSubject` remains as-is. It's a separate concern (outbox DLQ building). The centralized function in `subject.builder.ts` is the canonical implementation; `defaultDlqSubjectBuilder` delegates to it.
- **Retry counting in `JetStreamConsumerService`**: The current behavior routes `EventConsumerException` to DLQ immediately (no retry counting). This is correct for business errors. The `retryCount` field on `EventConsumerException` is metadata that handlers can set if they implement their own retry logic.
- **Changing the DLQ payload format for outbox**: The outbox `buildDlqPayload` function has its own DLQ payload format. This plan only affects the consumer DLQ payload format.