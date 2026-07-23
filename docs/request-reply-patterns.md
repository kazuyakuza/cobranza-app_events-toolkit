# Request-Reply Patterns

> **Onboarding:** This document covers **step 6 (Request-Reply)** of the [Onboarding Flow](../README.md#onboarding-flow).

The events-toolkit provides two patterns for request-reply communication over NATS JetStream.

For the convention specification, see [Event & Messaging Convention](event-messaging-convention.md).

> **Global request-reply:** Global (tenant-less) request-reply flows use `GlobalEventContext`, `buildGlobalSubject()`, and `buildGlobalResponseSubject()`. See [Global Events — When to Use Tenant vs Global Envelopes](global-events.md#global-events-and-request-reply).

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Sync Pattern — `request()`](#2-sync-pattern--request)
- [3. Async Pattern — `sendRequest()` + `@OnRequestReply`](#3-async-pattern--sendrequest--onrequestreply)
- [4. Comparison: Sync vs Async](#4-comparison-sync-vs-async)
- [5. Correlation ID Management](#5-correlation-id-management)
- [6. Timeout Handling](#6-timeout-handling)
- [7. Idempotency Requirements](#7-idempotency-requirements)
- [8. Sending Success vs Error Responses](#8-sending-success-vs-error-responses)
- [9. Combining Request-Reply with the Outbox](#9-combining-request-reply-with-the-outbox)
- [10. API Reference](#10-api-reference)
- [11. Related Documentation](#11-related-documentation)

## 1. Overview

| Concern | Sync (`request()`) | Async (`sendRequest()` + `@OnRequestReply`) |
| ------- | ----------------- | -------------------------------------------- |
| Call style | Blocking (await) | Fire-and-forget |
| Response mechanism | NATS built-in reply | Custom `reply_to` subject |
| Timeout | Built-in (configurable) | Application-level |
| Blocking | Yes — caller waits | No — caller continues |
| Complexity | Low | Moderate |
| Use case | Simple queries, short-lived | Long-running processes, event chains |

---

## 2. Sync Pattern — `request()`

### How it works

1. The caller invokes `RequestReplyService.request(subject, payload, options)`.
2. The service builds an `EventEnvelope`, encodes it, and sends a NATS request.
3. NATS creates a temporary inbox for the reply.
4. The responder receives the request, processes it, and replies on the inbox subject.
5. The caller receives the typed response or throws `RequestReplyException` on timeout/error.

### When to use

- Short-lived operations where the caller needs the result immediately.
- Simple request-response flows (e.g., fetching a record by ID).
- When the responder can process the request quickly (under the timeout window).

### Code example

```typescript
import { RequestReplyService, SubjectBuilder, EventContext } from '@cobranza-apps/events-toolkit';

class PaymentService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestProofStatus(companyId: string, proofId: string, context: EventContext): Promise<ProofStatusData> {
    const subject = this.subjectBuilder.build({
      companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'requested',
      version: '1',
    });

    const payload = new ProofRequestedData({ proofId });

    const response = await this.requestReply.request<ProofRequestedData, ProofStatusData>(
      subject,
      payload,
      { context, timeoutMs: 10000 },
    );

    return response.data;
  }
}
```

### Timeout handling

- Default timeout: 5000 ms (configurable via `RequestReplyConfig.defaultTimeoutMs`).
- Override per call with `timeoutMs` in `RequestReplyRequestOptions`.
- On timeout, `RequestReplyException` is thrown with the request's `eventId`, `eventType`, and `correlationId`.
- The caller must catch `RequestReplyException` and decide whether to retry, fall back, or propagate.

### Error handling for responders

- Network errors, timeouts, and malformed replies are wrapped in `RequestReplyException` on the caller side.
- Responder business errors should be encoded in the response payload (or headers) so the caller can inspect them.

---

## 3. Async Pattern — `sendRequest()` + `@OnRequestReply`

### How it works

1. The caller invokes `RequestReplyService.sendRequest(options)` with `replyTo` set in the `EventContext`.
2. The service builds an envelope with `reply_to` set to the provided subject, publishes it via `ProducerService`, and returns the `correlationId`.
3. The responder receives the request, processes it, and calls `RequestReplyService.sendResponse()` or `buildResponseEnvelope()` + `ProducerService.publish()`.
4. The response arrives on the `reply_to` subject.
5. The caller's `@OnRequestReply()` handler receives the decoded response envelope.

### When to use

- Long-running processes where blocking would degrade performance.
- Event-driven architectures where the caller should not wait.
- Complex workflows involving multiple services before a response is available.
- When the processing time may exceed typical request timeouts.

### Code example — Requester side

#### Alternative Convention — `.response` Suffix

Uses `buildResponseSubject()` to programmatically derive the reply subject.

```typescript
import { RequestReplyService, SubjectBuilder, buildResponseSubject, EventContext, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<string> {
    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    // Produces: company.{id}.credit.check.requested.response.v1
    const replySubject = buildResponseSubject(requestSubject);

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

    const payload = new CreditCheckRequestedData({ clientId });
    const result = await this.requestReply.sendRequest({
      subject: requestSubject,
      payload,
      context,
    });

    return result.correlationId;
  }
}
```

#### Preferred Convention — Descriptive Past-Tense Action

Uses a distinct past-tense action to describe the **outcome** of the request. This treats the response as a first-class event.

```typescript
import { RequestReplyService, SubjectBuilder, buildSubject, EventContext, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<string> {
    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    // Produces: company.{id}.credit.check.calculated.v1
    const replySubject = buildSubject({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'calculated',
      version: '1',
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

    const payload = new CreditCheckRequestedData({ clientId });
    const result = await this.requestReply.sendRequest({
      subject: requestSubject,
      payload,
      context,
    });

    return result.correlationId;
  }
}
```

### Code example — Responder side

```typescript
import { OnEvent, EventEnvelope, RequestReplyService, ActorType } from '@cobranza-apps/events-toolkit';
import { EventContext } from '@cobranza-apps/events-toolkit';

class CreditCheckConsumer {
  constructor(private readonly requestReply: RequestReplyService) {}

  @OnEvent('credit.check.requested', {
    version: '1',
    description: 'Handles incoming credit check requests',
    payloadExample: { clientId: 'uuid', fullName: 'Jane Doe' },
  })
  async onCreditCheckRequested(event: EventEnvelope<CreditCheckRequestedData>): Promise<void> {
    if (!this.requestReply.isRequestReplyMessage(event)) {
      return;
    }

    const result = await this.performCheck(event.data);

    const responseContext: EventContext = {
      type: 'credit.check.completed',
      version: '1.0.0',
      producer: 'credit-service',
      companyId: event.company_id,
      actorType: ActorType.SYSTEM,
      actorId: 'credit-service',
      correlationId: event.correlation_id,
      replyTo: event.reply_to,
    };

    const responseEvent = this.requestReply.buildResponseEnvelope({
      requestEvent: event,
      responseContext,
      responseData: result,
    });

    await this.requestReply.sendResponse(event.correlation_id, responseEvent);
  }
}
```

### Code example — Response handler (`@OnRequestReply`)

```typescript
import { OnRequestReply, EventEnvelope, EventContext } from '@cobranza-apps/events-toolkit';

class DebtServiceResponseHandler {
  @OnRequestReply('credit.check.completed', {
    description: 'Handles credit check completion responses',
    payloadExample: { clientId: 'uuid', score: 750, approved: true },
  })
  async handleCreditCheckResponse(
    event: EventEnvelope<CreditCheckResultData>,
    context: EventContext,
  ): Promise<void> {
    await this.processCreditResult(event.data, event.correlation_id);
  }
}
```

#### Building Response Subjects

The toolkit provides two approaches for constructing response subjects:

**Preferred approach — Descriptive past-tense action:**

```typescript
import { buildSubject } from '@cobranza-apps/events-toolkit';

const responseSubject = buildSubject({
  companyId: event.company_id,
  domain: 'credit',
  entity: 'check',
  action: 'calculated',
  version: '1',
});
// => 'company.550e...credit.check.calculated.v1'
```

**Alternative approach — `.response` suffix via `buildResponseSubject`:**

```typescript
import { buildResponseSubject } from '@cobranza-apps/events-toolkit';

const responseSubject = buildResponseSubject(
  'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1',
);
// => 'company.550e8400e29b41d4a716446655440000.credit.check.requested.response.v1'
```

See [Event & Messaging Convention §2.1](event-messaging-convention.md#21-response-subject-naming-convention) for the full convention details.

#### Automatic Idempotency for Response Handlers

`@OnRequestReply` supports the `{ idempotent: true }` option (added in v0.15.1). When `IdempotencyModule` is registered via `EventsToolkitModule.forRoot()`, `OnRequestReplyExplorer` automatically wraps the response handler with a dedup guard at startup — identical to the `@OnEvent` behavior. Duplicate deliveries of the **same response event** (NATS redelivery of the reply on `reply_to`) are silently skipped using the key `${event.id}:${event.correlation_id}`.

```typescript
@OnRequestReply('credit.check.completed', {
  description: 'Handles credit check completion responses (dedup)',
  payloadExample: { clientId: 'uuid', score: 750, approved: true },
  idempotent: true,
})
async handleCompleted(event: EventEnvelope<CreditCheckResultData>): Promise<void> {
  await this.processResult(event.data); // skipped on redelivery
}
```

When the `IdempotencyModule` is **not** registered, the `idempotent` flag is a silent no-op (the handler runs unwrapped). When a wrapped handler throws, the event is intentionally **not** marked processed, allowing redelivery retries.

For backend configuration (SQLite / PostgreSQL / memory), key generation, TTL, and manual usage, see the [Idempotency guide](idempotency.md#automatic-usage-patterns).

---

## 4. Comparison: Sync vs Async

> For a visual decision flowchart and extended best practices, see [Request-Reply Guidelines](request-reply-guidelines.md).

| Aspect | Sync (`request()`) | Async (`sendRequest()` + `@OnRequestReply`) |
| ------ | ------------------ | --------------------------------------------- |
| **Blocking** | Blocks caller until response or timeout | Non-blocking; caller continues immediately |
| **Complexity** | Simple — one method call | Requires `reply_to`, response handler, and correlation tracking |
| **Timeout** | Built-in via NATS | Must be handled at application level |
| **Coupling** | Tight — caller expects immediate result | Loose — caller and responder are decoupled |
| **Performance** | Can block threads in high-throughput scenarios | Better throughput under load |
| **Error propagation** | Direct — exceptions bubble up to caller | Indirect — errors must be sent as response events |
| **Use case** | Fetch by ID, validation, status checks | Workflows, batch processing, cross-service chains |

### When to choose sync

- The operation completes within milliseconds to a few seconds.
- The caller cannot proceed without the result.
- Simplicity is more important than throughput.

### When to choose async

- Processing may take longer than typical request timeouts.
- The caller does not need the result immediately.
- The system should remain responsive under load.
- Multiple services may need to respond before a decision is made.

> **Decision guide**: For a step-by-step decision flowchart, see [Request-Reply Guidelines — Decision Tree](request-reply-guidelines.md#decision-tree--sync-vs-async).

---

## 5. Correlation ID Management

The `correlation_id` is the primary mechanism for linking requests to responses across services.

### Rules

1. **Generate once per transaction chain**: The originating service creates a `correlation_id` (use `generateUuidV7()`) and passes it through every subsequent event.
2. **Preserve across boundaries**: The responder's response event MUST carry the same `correlation_id` from the original request.
3. **`buildResponseEnvelope` handles this automatically**: When using `RequestReplyService.buildResponseEnvelope()`, the `correlationId` from the request event is automatically preserved in the response.
4. **Use for idempotency**: Consumers can use `correlation_id` (combined with `event.id`) to detect and ignore duplicate messages.

### Example

```typescript
// Requester — generates correlation_id
const correlationId = generateUuidV7();
const context: EventContext = {
  // ...
  correlationId,
  replyTo: replySubject,
};

// Responder — buildResponseEnvelope preserves it automatically
const responseEvent = this.requestReply.buildResponseEnvelope({
  requestEvent: event,          // contains the original correlation_id
  responseContext,
  responseData: result,
});
// responseEvent.correlation_id === event.correlation_id
```

---

## 6. Timeout Handling

### Module-level configuration

Set a global default timeout for all sync `request()` calls via `EventsToolkitModule.forRoot()`:

```typescript
EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  requestReply: { defaultTimeoutMs: 10000 },
})
```

The same option is available in `forRootAsync()` — the factory can return `requestReply: { defaultTimeoutMs: ... }` alongside other options. If omitted, the built-in default of 5000 ms applies.

### Sync pattern timeouts

- **Default**: 5000 ms (set via `RequestReplyConfig.defaultTimeoutMs`).
- **Per-call override**: Pass `timeoutMs` in `RequestReplyRequestOptions`.
- **Error**: `RequestReplyException` is thrown with the request metadata.

```typescript
const response = await this.requestReply.request<ReqData, ResData>(
  subject,
  payload,
  { context, timeoutMs: 15000 },
);
```

### Async pattern timeouts

The async pattern does not have a built-in timeout mechanism. Applications must implement their own:

- **SAGA pattern**: Use a SAGA coordinator to track pending requests and expire them.
- **Deadline events**: Publish a "request expired" event after a configurable period.
- **Database tracking**: Store pending request IDs with a timestamp; a background job cleans up expired entries.

---

## 7. Idempotency Requirements

All request-reply handlers MUST be idempotent.

### Request side

- Use `correlation_id` + `event.id` for deduplication.
- The same request may arrive more than once (NATS at-least-once delivery).
- Store processed `correlation_id` values and skip duplicates.

### Response side

- If the responder receives the same request twice, it should return the same response without re-processing.
- Use the request's `correlation_id` to look up previously computed results.
- For the **response handler** (the requester side, consuming replies via `@OnRequestReply`), set `{ idempotent: true }` to automatically skip duplicate response deliveries — see [Idempotency guide](idempotency.md#automatic-usage-patterns).

### Implementation pattern

```typescript
private readonly processedRequests = new Map<string, ResponseData>();

@OnEvent('credit.check.requested', {
  version: '1',
  description: 'Handles incoming credit check requests with idempotency',
  payloadExample: { clientId: 'uuid', fullName: 'Jane Doe' },
})
async onCreditCheckRequested(event: EventEnvelope<CreditCheckRequestedData>): Promise<void> {
  const idempotencyKey = event.correlation_id;

  if (this.processedRequests.has(idempotencyKey)) {
    const cachedResult = this.processedRequests.get(idempotencyKey);
    await this.sendCachedResponse(event, cachedResult);
    return;
  }

  const result = await this.performCheck(event.data);
  this.processedRequests.set(idempotencyKey, result);
  await this.sendResponse(event, result);
}
```

---

## 8. Sending Success vs Error Responses

### Success response

Use `RequestReplyService.sendResponse()` with a response envelope built via `buildResponseEnvelope()`:

```typescript
const responseEvent = this.requestReply.buildResponseEnvelope({
  requestEvent: event,
  responseContext: {
    type: 'credit.check.completed',
    version: '1.0.0',
    producer: 'credit-service',
    companyId: event.company_id,
    actorType: ActorType.SYSTEM,
    actorId: 'credit-service',
    correlationId: event.correlation_id,
    replyTo: event.reply_to,
  },
  responseData: { status: 'approved', score: 750 },
});

await this.requestReply.sendResponse(event.correlation_id, responseEvent);
```

### Error response

For the **sync pattern**, responder errors should be returned as part of the response payload. The caller receives the response and interprets the embedded error. Timeouts and transport failures on the caller side are thrown as `RequestReplyException`.

For the **async pattern**, publish an error response event with error details in the payload:

```typescript
const errorResponseEvent = this.requestReply.buildResponseEnvelope({
  requestEvent: event,
  responseContext: {
    type: 'credit.check.failed',
    version: '1.0.0',
    producer: 'credit-service',
    companyId: event.company_id,
    actorType: ActorType.SYSTEM,
    actorId: 'credit-service',
    correlationId: event.correlation_id,
  },
  responseData: {
    errorCode: 'CREDIT_CHECK_UNAVAILABLE',
    message: 'Credit service is temporarily unavailable',
    retryable: true,
  },
});

await this.requestReply.sendResponse(event.correlation_id, errorResponseEvent);
```

### Consumer errors (DLQ routing)

If a request-reply consumer encounters a business error that should route to the Dead Letter Queue:

```typescript
import { EventConsumerException } from '@cobranza-apps/events-toolkit';

@OnEvent('credit.check.requested', {
  version: '1',
  description: 'Handles incoming credit check requests',
  payloadExample: { clientId: 'uuid', fullName: 'Jane Doe' },
})
async onCreditCheckRequested(event: EventEnvelope<CreditCheckRequestedData>): Promise<void> {
  if (isInvalidRequest(event.data)) {
    throw new EventConsumerException({
      message: 'Invalid credit check request',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlation_id,
    });
  }
  // process valid request
}
```

### Manual testing with `nats req` (INBOX fallback)

When testing responders manually with the `nats req` CLI (core NATS), the requester sets a `reply_to` INBOX subject (e.g., `_INBOX.abc123`). INBOX subjects do not match any JetStream stream, so `sendResponse()` would normally time out waiting for a PubAck, causing the message to be redelivered repeatedly.

Enable `fallbackToCoreNatsOnInbox: true` in your `RequestReplyConfig` to have `sendResponse()` publish directly via core NATS when the `reply_to` matches the INBOX pattern:

```typescript
EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  requestReply: { fallbackToCoreNatsOnInbox: true },
})
```

This is safe for production use — only subjects matching `coreNatsFallbackPattern` (default `'^_?INBOX\\.'`) are routed through core NATS; all other responses continue through JetStream as before.

---

## 9. Combining Request-Reply with the Outbox

### Sync Request-Reply + Outbox

For synchronous request-reply (`request()`), the outbox is typically **not needed for the request itself** because NATS handles the reply inbox. However, if the response handler triggers side effects that need transactional safety, use the outbox for those side effects:

```typescript
// Sync request — no outbox needed for the request
const response = await this.requestReply.request<ReqData, ResData>(
  subject, payload, { context, timeoutMs: 10000 },
);

// Side effects triggered by the response — use outbox for reliability
const sideEffectEvent = createEvent(response.data, sideEffectContext);
await this.outboxService.saveToOutbox(sideEffectEvent, sideEffectSubject);
```

### Async Request-Reply + Outbox

For asynchronous request-reply, **route the initial request through the outbox** to guarantee delivery even if the service restarts:

```typescript
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
```

Or use the low-level API with a pre-built envelope:

```typescript
// Low-level API — for cases where you need to build the envelope manually
const event = createEvent({ clientId }, context);
await this.outboxService.sendRequestThroughOutbox(event, subject);
```

### Why sendAsyncRequestThroughOutbox over sendRequestThroughOutbox?

| Aspect | `sendAsyncRequestThroughOutbox` | `sendRequestThroughOutbox` |
|--------|----------------------------------|---------------------------|
| Envelope | Built automatically | Pre-built by caller |
| replyTo validation | TypeScript-enforced via `AsyncRequestEventContext` | Runtime-only via `ensureReplyToPresent()` |
| API style | High-level (subject + payload + context) | Low-level (envelope + subject) |
| Use when | You have raw payload and context | You already have an `EventEnvelope` |
| Returns | `{ correlationId }` for response tracking | `void` |

---

## 10. API Reference

### `RequestReplyService`

| Method | Pattern | Description |
| ------ | ------- | ----------- |
| `request<T, R>(subject, payload, options)` | Sync | Sends a request and awaits a typed response |
| `sendRequest<T>(options)` | Async | Publishes a fire-and-forget request with `reply_to` |
| `sendResponse(correlationId, responseEvent)` | Async | Publishes a response to the `reply_to` subject |
| `buildResponseEnvelope<R>(options)` | Utility | Creates a response envelope preserving correlation |
| `isRequestReplyMessage(event)` | Utility | Checks if an event carries a `reply_to` field |

### `@OnRequestReply(options)`

| Option | Type | Required | Description |
| ------ | ---- | -------- | ----------- |
| `description` | `string` | Yes | Human-readable description of the handler |
| `payloadExample` | `Record<string, unknown>` | Yes | Example response payload for documentation |
| `companyId` | `string` | No | Optional tenant filter for scoped handlers |
| `tags` | `string[]` | No | Arbitrary tags for discovery manifest filtering |
| `idempotent` | `boolean` | No | When `true` and `IdempotencyModule` is registered, `OnRequestReplyExplorer` wraps the handler with the dedup guard (skip duplicate → execute → mark). Silent no-op when the module is not registered. See [Idempotency guide](idempotency.md#automatic-usage-patterns). |

> **Note:** Unlike `@EmitEvent` and `@OnEvent`, `@OnRequestReply` does **not** have a `version` field — it listens for responses on a specific subject rather than declaring an event schema version.

For the `@EmitEvent` / `@OnEvent` options reference (with required `version`, `description`, `payloadExample`), see [Event & Messaging Convention §4.1](event-messaging-convention.md#41-decorator-signature-convention).

### `RequestReplyConfig`

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `defaultTimeoutMs` | `number` | `5000` | Default timeout for `request()` operations |
| `fallbackToCoreNatsOnInbox` | `boolean` | `false` | When `true`, `sendResponse()` publishes INBOX `reply_to` subjects via core NATS instead of JetStream, avoiding PubAck timeouts on subjects not covered by any stream. |
| `coreNatsFallbackPattern` | `string` | `'^_?INBOX\\.'` | Regex pattern matching `reply_to` subjects that should use core NATS fallback when `fallbackToCoreNatsOnInbox` is enabled. |

### Subject Utility Functions

| Function | Description |
|----------|-------------|
| `buildResponseSubject(requestSubject)` | Derives a response subject by appending `.response` to the action segment of a request subject |
| `RESPONSE_SUFFIX` | Constant `.response` — the suffix appended by `buildResponseSubject` |

---

## 11. Related Documentation

- [Event & Messaging Convention](event-messaging-convention.md) — Full convention specification
- [AI Agent Guidelines](ai-agent-guidelines.md) — Step-by-step event creation guide
- [Outbox Configuration](outbox-configuration.md) — Outbox pattern configuration
- [Architecture](../.agent/project-info/architecture.md) — System architecture and module design
