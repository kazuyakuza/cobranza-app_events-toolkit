# Plan: Task 1 — RequestReplyService Enhancements

## Objective

Add two new features to `RequestReplyService`:
1. `sendRequest<T>()` — async fire-and-forget method that publishes a request event with `reply_to` set and returns the `correlationId` for response tracking.
2. `buildResponseEnvelope<R>()` — helper that constructs a response envelope preserving `correlation_id` and `causation_id` from the original request event.

---

## Pre-Analysis

### Current State

**`src/request-reply/request-reply.service.ts`** (~114 lines):
- Private fields: `natsConnection`, `producerService`, `logger`, `config`
- Public methods: `request<T,R>()`, `sendResponse()`, `isRequestReplyMessage()`
- Private helpers: `buildEnvelope()`, `ensureReplyTo()`, `logRequestSent()`, `logReplyReceived()`, `logRequestError()`, `toLogContext()`, `toErrorLogContext()`, `wrapRequestError()`

**`src/request-reply/request-reply.types.ts`** (~53 lines):
- Tokens: `NATS_CONNECTION_TOKEN`, `REQUEST_REPLY_CONFIG_TOKEN`, `REQUEST_REPLY_DEPS_TOKEN`
- Interfaces: `RequestReplyConfig`, `RequestReplyRequestOptions`, `RequestReplyResponse<R>`, `RequestReplyDeps`
- Function: `resolveRequestReplyConfig()`

**`src/request-reply/index.ts`**: Barrel exports for service and types.

**`src/request-reply/request-reply.service.spec.ts`** (~200 lines): Existing tests for `request`, `sendResponse`, `isRequestReplyMessage`.

### Design Decisions

1. **`sendRequest` uses `ProducerService.publish()`** — fire-and-forget means we just publish the envelope (no NATS request-reply protocol). This delegates to `ProducerService` which already handles `JetStreamClient.publish()` and logging.

2. **`sendRequest` validates `replyTo`** — enforces that the context includes `replyTo` before publishing, matching the pattern in `sendResponse` which validates `reply_to` on the envelope.

3. **`buildResponseEnvelope` is a public method on `RequestReplyService`** — it's part of the request-reply domain and reuses the private `buildEnvelope()` method. It doesn't need service state but fits cohesively in the service API. This keeps the module boundary intact and avoids creating extra utility files for one function.

4. **Options objects for >2 params** — Both new methods take a single options object parameter, satisfying the max-2-params rule.

5. **`SendRequestResult` wraps `correlationId`** — returns `{ correlationId: string }` instead of bare `string` for extensibility and consistency with the `RequestReplyResponse<R>` pattern.

---

## Files to Modify

### 1. `src/request-reply/request-reply.types.ts`

Add `import type { EventEnvelope } from '../common/envelope/event-envelope.class';` at top.

Add three new exported interfaces after `RequestReplyDeps`:

```typescript
/** Options for the {@link RequestReplyService.sendRequest} fire-and-forget method. */
export interface SendRequestOptions<T> {
  /** NATS subject to publish the request event to. */
  subject: string;
  /** Domain-specific business payload for the request event. */
  payload: T;
  /** Metadata context for the event envelope. Must include replyTo for async responses. */
  context: EventContext;
}

/** Result of a fire-and-forget request, carrying the correlation tracking identifier. */
export interface SendRequestResult {
  /** correlation_id of the sent request, used to correlate async responses. */
  correlationId: string;
}

/** Options for {@link RequestReplyService.buildResponseEnvelope}. */
export interface BuildResponseEnvelopeOptions<R> {
  /** Original request event whose correlation_id and id are preserved in the response. */
  requestEvent: EventEnvelope<unknown>;
  /** Context for the response event. correlationId and causationId are overridden from requestEvent. */
  responseContext: EventContext;
  /** Domain-specific business payload for the response event. */
  responseData: R;
}
```

**Also add import for EventContext** — check if already imported. `RequestReplyDeps` uses `import('../logging/event-logger.service').EventLoggerService` but `EventContext` itself is not imported. Add:
```typescript
import type { EventContext } from '../common/envelope/event-context.interface';
import type { EventEnvelope } from '../common/envelope/event-envelope.class';
```

**Line impact**: +22 lines (imports + interfaces) → ~75 total (under 200 limit)

---

### 2. `src/request-reply/request-reply.service.ts`

#### 2a. Update imports from `./request-reply.types`

Change:
```typescript
import {
  RequestReplyConfig,
  RequestReplyDeps,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  REQUEST_REPLY_DEPS_TOKEN,
} from './request-reply.types';
```

To:
```typescript
import {
  RequestReplyConfig,
  RequestReplyDeps,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  REQUEST_REPLY_DEPS_TOKEN,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
} from './request-reply.types';
```

#### 2b. Add `sendRequest<T>()` public method

Add after the `isRequestReplyMessage` method (before the `private` section):

```typescript
/**
 * Publishes a fire-and-forget request event with a reply_to subject.
 *
 * Builds an envelope from the provided context and payload, publishes
 * it via {@link ProducerService}, and returns the correlationId
 * for the caller to track async responses.
 *
 * @typeParam T - Request payload type.
 */
async sendRequest<T>(options: SendRequestOptions<T>): Promise<SendRequestResult> {
  this.ensureReplyToSet(options.context.replyTo);
  const envelope = this.buildEnvelope(options.context, options.payload);
  await this.producerService.publish(options.subject, envelope);
  return { correlationId: envelope.correlation_id };
}
```

**Line count**: 11 lines — under 50-line method limit.

#### 2c. Add `buildResponseEnvelope<R>()` public method

Add after `sendRequest`:

```typescript
/**
 * Builds a response envelope preserving correlation and causation from a request event.
 *
 * Overrides responseContext.correlationId with requestEvent.correlation_id
 * and sets causationId to requestEvent.id, then delegates to {@link buildEnvelope}.
 *
 * @typeParam R - Response payload type.
 */
buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): EventEnvelope<R> {
  const preservedContext: EventContext = {
    ...options.responseContext,
    correlationId: options.requestEvent.correlation_id,
    causationId: options.requestEvent.id,
  };
  return this.buildEnvelope(preservedContext, options.responseData);
}
```

**Line count**: 11 lines — under 50-line method limit. This method is **public** because external consumers need it to construct proper response events before calling `sendResponse()`.

#### 2d. Add `ensureReplyToSet()` private method

Add after the existing `ensureReplyTo` method:

```typescript
private ensureReplyToSet(replyTo: string | undefined): asserts replyTo is string {
  if (!replyTo) {
    throw new RequestReplyException({
      message: 'sendRequest requires reply_to in context',
      eventId: 'unknown',
      eventType: 'unknown',
      correlationId: 'unknown',
    });
  }
}
```

**Line count**: 9 lines. This is separate from the existing `ensureReplyTo()` because `sendRequest` validates the context's `replyTo` field *before* envelope construction, while `sendResponse` validates the envelope's `reply_to` field *after* construction.

#### 2e. Final line count check

Current service: ~114 lines. Additions: ~33 lines. Total: ~147 lines — under 200-line file limit.

---

### 3. `src/request-reply/index.ts`

Add new type exports:

```typescript
export {
  RequestReplyConfig,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  RequestReplyDeps,
  NATS_CONNECTION_TOKEN,
  REQUEST_REPLY_CONFIG_TOKEN,
  REQUEST_REPLY_DEPS_TOKEN,
  resolveRequestReplyConfig,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
} from './request-reply.types';
```

---

### 4. `src/request-reply/request-reply.service.spec.ts`

#### 4a. Update imports

Add at top:
```typescript
import { SendRequestOptions, SendRequestResult, BuildResponseEnvelopeOptions } from './request-reply.types';
```

#### 4b. Add `describe('sendRequest', ...)` block

Add inside the outer `describe('RequestReplyService', ...)` suite, after the `describe('isRequestReplyMessage', ...)` block:

```typescript
describe('sendRequest', () => {
  const replyContext: EventContext = {
    ...sampleContext,
    replyTo: '_INBOX.test.reply',
  };

  it('should throw RequestReplyException when replyTo is not set in context', async () => {
    const contextWithoutReply = { ...sampleContext };
    delete (contextWithoutReply as Partial<EventContext>).replyTo;

    await expect(
      service.sendRequest({
        subject: 'test.subject',
        payload: { key: 'value' },
        context: contextWithoutReply,
      }),
    ).rejects.toThrow(RequestReplyException);
  });

  it('should throw RequestReplyException with message when replyTo is empty string', async () => {
    const contextWithEmptyReply: EventContext = {
      ...sampleContext,
      replyTo: '',
    };

    await expect(
      service.sendRequest({
        subject: 'test.subject',
        payload: {},
        context: contextWithEmptyReply,
      }),
    ).rejects.toThrow('sendRequest requires reply_to in context');
  });

  it('should publish envelope via ProducerService and return correlationId', async () => {
    const result = await service.sendRequest({
      subject: 'test.subject',
      payload: { paymentId: 'pay-001' },
      context: replyContext,
    });

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [subject, publishedEnvelope] = mockPublish.mock.calls[0];
    expect(subject).toBe('test.subject');
    expect(publishedEnvelope.reply_to).toBe('_INBOX.test.reply');
    expect(result.correlationId).toBe('660e8400-e29b-41d4-a716-446655440001');
  });

  it('should build envelope with auto-generated id and timestamp', async () => {
    await service.sendRequest({
      subject: 'test.subject',
      payload: { amount: 100 },
      context: replyContext,
    });

    const publishedEnvelope = mockPublish.mock.calls[0][1] as EventEnvelope<unknown>;
    expect(publishedEnvelope.id).toBe('evt_mock-request-uuid');
    expect(publishedEnvelope.produced_at).toBe('2026-06-13T19:00:00.000Z');
    expect(publishedEnvelope.correlation_id).toBe(sampleContext.correlationId);
  });

  it('should not call natsConnection.request (fire-and-forget)', async () => {
    await service.sendRequest({
      subject: 'test.subject',
      payload: {},
      context: replyContext,
    });

    expect(mockNatsRequest).not.toHaveBeenCalled();
  });
});
```

#### 4c. Add `describe('buildResponseEnvelope', ...)` block

```typescript
describe('buildResponseEnvelope', () => {
  it('should preserve correlation_id from request event', () => {
    const requestEvent = createTestEnvelope({
      id: 'evt_request-001',
      correlation_id: '660e8400-e29b-41d4-a716-446655440001',
    });
    const responseContext: EventContext = {
      type: 'payment.verification.completed',
      version: '1.0.0',
      producer: 'verification-service',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.CLIENT,
      actorId: 'user-456',
      correlationId: 'will-be-overridden',
    };

    const response = service.buildResponseEnvelope({
      requestEvent,
      responseContext,
      responseData: { verified: true },
    });

    expect(response.correlation_id).toBe('660e8400-e29b-41d4-a716-446655440001');
  });

  it('should set causation_id to request event id', () => {
    const requestEvent = createTestEnvelope({ id: 'evt_request-002' });
    const responseContext: EventContext = {
      type: 'payment.verification.completed',
      version: '1.0.0',
      producer: 'verification-service',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.CLIENT,
      actorId: 'user-456',
      correlationId: 'any-value',
    };

    const response = service.buildResponseEnvelope({
      requestEvent,
      responseContext,
      responseData: { verified: true },
    });

    expect(response.causation_id).toBe('evt_request-002');
  });

  it('should populate all envelope fields from responseContext except correlation/causation', () => {
    const requestEvent = createTestEnvelope({
      id: 'evt_request-003',
      correlation_id: 'corr-003',
    });
    const responseContext: EventContext = {
      type: 'payment.verification.completed',
      version: '2.0.0',
      producer: 'verification-service',
      companyId: 'company-uuid',
      actorType: ActorType.SYSTEM,
      actorId: 'system',
      correlationId: 'will-be-overridden',
    };

    const response = service.buildResponseEnvelope({
      requestEvent,
      responseContext,
      responseData: { status: 'approved' },
    });

    expect(response.type).toBe('payment.verification.completed');
    expect(response.version).toBe('2.0.0');
    expect(response.producer).toBe('verification-service');
    expect(response.company_id).toBe('company-uuid');
    expect(response.actor_type).toBe(ActorType.SYSTEM);
    expect(response.actor_id).toBe('system');
    expect(response.data).toEqual({ status: 'approved' });
    expect(response.correlation_id).toBe('corr-003');
    expect(response.causation_id).toBe('evt_request-003');
  });
});
```

**Note**: The `responseContext` in tests intentionally omits `replyTo` and `causationId` since those are optional in `EventContext` and `buildResponseEnvelope` overrides `causationId` anyway.

---

## Implementation Steps (Ordered)

### Step 1 — Update `src/request-reply/request-reply.types.ts`
- Add `import type { EventContext }` and `import type { EventEnvelope }` at top
- Add `SendRequestOptions<T>` interface (after `RequestReplyDeps`)
- Add `SendRequestResult` interface (after `SendRequestOptions`)
- Add `BuildResponseEnvelopeOptions<R>` interface (after `SendRequestResult`)

### Step 2 — Update `src/request-reply/request-reply.service.ts`
- Add imports for `SendRequestOptions`, `SendRequestResult`, `BuildResponseEnvelopeOptions`
- Add `sendRequest<T>()` method after `isRequestReplyMessage()`
- Add `buildResponseEnvelope<R>()` method after `sendRequest()`
- Add `ensureReplyToSet()` private method after `ensureReplyTo()`

### Step 3 — Update `src/request-reply/index.ts`
- Add `SendRequestOptions`, `SendRequestResult`, `BuildResponseEnvelopeOptions` to the types export

### Step 4 — Update `src/request-reply/request-reply.service.spec.ts`
- Add imports for `SendRequestOptions`, `SendRequestResult`, `BuildResponseEnvelopeOptions`
- Add `replyContext` fixture in outer scope
- Add `describe('sendRequest', ...)` with 5 test cases
- Add `describe('buildResponseEnvelope', ...)` with 3 test cases

### Step 5 — Build & Test
- Run `npm run build` to verify TypeScript compilation
- Run `npm run test` to verify all tests pass (existing + new)

### Step 6 — Code Review
- Verify max 50 lines per method body
- Verify max 2 params per method (all use options objects)
- Verify no commented-out code
- Verify self-documenting code (descriptive names, JSDoc on public methods)
- Verify private members preference (`ensureReplyToSet` is private)
- Verify file line counts under 200

---

## Verification Checklist

| Rule | Check | Pass |
|------|-------|------|
| Max 50 lines/method | `sendRequest` ≈7 lines, `buildResponseEnvelope` ≈6 lines, `ensureReplyToSet` ≈9 lines | ✅ |
| Max 2 params/method | All new methods use single options object | ✅ |
| Max 200 lines/file | Types file ~75 lines, Service file ~147 lines | ✅ |
| Max 2 depth nesting | No nesting deeper than 2 levels in new methods | ✅ |
| Self-documenting code | Descriptive names, JSDoc on public methods | ✅ |
| Prefer private members | `ensureReplyToSet` is private; `sendRequest` and `buildResponseEnvelope` must be public | ✅ |
| No commented-out code | None planned | ✅ |
| Single-section boolean conditions | No complex conditions in new code | ✅ |
| No magic numbers | None | ✅ |
| Error handling | `sendRequest` validates `replyTo` and throws `RequestReplyException` | ✅ |

---

## NOT Done by This Plan

- No changes to `ProducerService` or other modules
- No changes to existing method signatures
- No changes to `RequestReplyDeps` or module configuration
- No documentation files (only source code changes)
- No git operations (handled by other workflow steps)