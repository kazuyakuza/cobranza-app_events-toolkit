# Request-Reply Patterns

The events-toolkit provides two patterns for request-reply communication over NATS JetStream.

For the convention specification, see [Event & Messaging Convention](event-messaging-convention.md).

---

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

- If the responder throws a `RequestReplyException`, it is re-thrown to the caller.
- Network errors and timeouts are wrapped in `RequestReplyException` automatically.

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

```typescript
import { RequestReplyService, SubjectBuilder, EventContext, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';

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

    // Build response subject: set action to include ".response"
    // Produces: company.{id}.credit.check.requested.response.v1
    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested.response',
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

  @OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })
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
import { OnRequestReply, EventEnvelope } from '@cobranza-apps/events-toolkit';

class DebtServiceResponseHandler {
  @OnRequestReply({ eventType: 'credit.check.completed' })
  async handleCreditCheckResponse(event: EventEnvelope<CreditCheckResultData>): Promise<void> {
    await this.processCreditResult(event.data, event.correlation_id);
  }
}
```

---

## 4. Comparison: Sync vs Async

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

### Implementation pattern

```typescript
private readonly processedRequests = new Map<string, ResponseData>();

@OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })
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
  },
  responseData: { status: 'approved', score: 750 },
});

await this.requestReply.sendResponse(event.correlation_id, responseEvent);
```

### Error response

For the **sync pattern**, the responder should throw a `RequestReplyException`. The NATS request-reply mechanism propagates the error back to the caller.

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

@OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })
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

---

## 9. API Reference

### `RequestReplyService`

| Method | Pattern | Description |
| ------ | ------- | ----------- |
| `request<T, R>(subject, payload, options)` | Sync | Sends a request and awaits a typed response |
| `sendRequest<T>(options)` | Async | Publishes a fire-and-forget request with `reply_to` |
| `sendResponse(correlationId, responseEvent)` | Async | Publishes a response to the `reply_to` subject |
| `buildResponseEnvelope<R>(options)` | Utility | Creates a response envelope preserving correlation |
| `isRequestReplyMessage(event)` | Utility | Checks if an event carries a `reply_to` field |

### `@OnRequestReply(options)`

| Option | Type | Description |
| ------ | ---- | ----------- |
| `eventType` | `string` | Dot-notation event type to match (e.g., `'credit.check.completed'`) |
| `companyId` | `string?` | Optional tenant filter for scoped handlers |

### `RequestReplyConfig`

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `defaultTimeoutMs` | `number` | `5000` | Default timeout for `request()` operations |

---

## 10. Related Documentation

- [Event & Messaging Convention](event-messaging-convention.md) — Full convention specification
- [AI Agent Guidelines](ai-agent-guidelines.md) — Step-by-step event creation guide
- [Outbox Configuration](outbox-configuration.md) — Outbox pattern configuration
- [Architecture](../.agent/project-info/architecture.md) — System architecture and module design
