# Task 3 — Request-Reply Documentation Fix Plan

## Review Outcome

Issues found in the documentation changes for `docs/event-messaging-convention.md`, `docs/request-reply-patterns.md`, and `README.md`. The main problems are runtime-breaking examples in the async request-reply responder flow and an incomplete handler signature for `@OnRequestReply`.

## Issues

### 1. Async responder examples are missing `replyTo` in `responseContext` (runtime error)

**Severity:** High

`RequestReplyService.buildResponseEnvelope()` does **not** copy `reply_to` from the request event. `RequestReplyService.sendResponse()` requires `responseEvent.reply_to` to be set and throws `RequestReplyException` otherwise.

The following examples call `sendResponse(event.correlation_id, responseEvent)` after `buildResponseEnvelope()` but never set `replyTo` in `responseContext`, so the code would fail at runtime:

- `docs/request-reply-patterns.md` lines 172–189 (Section 3, Responder side)
- `docs/request-reply-patterns.md` lines 339–353 (Section 8, Success response)
- `README.md` lines 432–442 (Async — Responder)

**Fix:** Add `replyTo: event.reply_to,` to every `responseContext` used to build an async response envelope.

#### `docs/request-reply-patterns.md` Section 3 (around line 172)

Replace:

```typescript
    const responseContext: EventContext = {
      type: 'credit.check.completed',
      version: '1.0.0',
      producer: 'credit-service',
      companyId: event.company_id,
      actorType: ActorType.SYSTEM,
      actorId: 'credit-service',
      correlationId: event.correlation_id,
    };
```

With:

```typescript
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
```

#### `docs/request-reply-patterns.md` Section 8 (around line 341)

Replace:

```typescript
  responseContext: {
    type: 'credit.check.completed',
    version: '1.0.0',
    producer: 'credit-service',
    companyId: event.company_id,
    actorType: ActorType.SYSTEM,
    actorId: 'credit-service',
    correlationId: event.correlation_id,
  },
```

With:

```typescript
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
```

#### `README.md` async responder example (around line 432)

Replace:

```typescript
      responseContext: {
        type: 'credit.check.completed', version: '1.0.0',
        producer: 'credit-service', companyId: event.company_id,
        actorType: ActorType.SYSTEM, actorId: 'credit-service',
        correlationId: event.correlation_id,
      },
```

With:

```typescript
      responseContext: {
        type: 'credit.check.completed', version: '1.0.0',
        producer: 'credit-service', companyId: event.company_id,
        actorType: ActorType.SYSTEM, actorId: 'credit-service',
        correlationId: event.correlation_id,
        replyTo: event.reply_to,
      },
```

### 2. `@OnRequestReply` handler signature is incomplete

**Severity:** Medium

The `EventHandler` type is `(event: EventEnvelope<unknown>, context: EventContext) => Promise<void>`. `RequestReplyConsumerService.dispatch()` invokes handlers with both arguments. The documentation examples only declare the `event` parameter.

Affected locations:

- `docs/request-reply-patterns.md` lines 196–203 (Section 3, Response handler)
- `README.md` lines 446–451 (Async — Response handler)

**Fix:** Update handler signatures to accept `context: EventContext` and add `EventContext` to imports.

#### `docs/request-reply-patterns.md` Section 3 (around line 196)

Replace:

```typescript
import { OnRequestReply, EventEnvelope } from '@cobranza-apps/events-toolkit';

class DebtServiceResponseHandler {
  @OnRequestReply({ eventType: 'credit.check.completed' })
  async handleCreditCheckResponse(event: EventEnvelope<CreditCheckResultData>): Promise<void> {
    await this.processCreditResult(event.data, event.correlation_id);
  }
}
```

With:

```typescript
import { OnRequestReply, EventEnvelope, EventContext } from '@cobranza-apps/events-toolkit';

class DebtServiceResponseHandler {
  @OnRequestReply({ eventType: 'credit.check.completed' })
  async handleCreditCheckResponse(
    event: EventEnvelope<CreditCheckResultData>,
    context: EventContext,
  ): Promise<void> {
    await this.processCreditResult(event.data, event.correlation_id);
  }
}
```

#### `README.md` (around line 446)

Replace:

```typescript
class DebtServiceResponseHandler {
  @OnRequestReply({ eventType: 'credit.check.completed' })
  async handleCreditCheckResponse(event: EventEnvelope<CreditCheckResultData>): Promise<void> {
    await this.processCreditResult(event.data, event.correlation_id);
  }
}
```

With:

```typescript
class DebtServiceResponseHandler {
  @OnRequestReply({ eventType: 'credit.check.completed' })
  async handleCreditCheckResponse(
    event: EventEnvelope<CreditCheckResultData>,
    context: EventContext,
  ): Promise<void> {
    await this.processCreditResult(event.data, event.correlation_id);
  }
}
```

Also ensure `EventContext` is imported in the same code block (it is already imported at line 382).

### 3. Sync pattern error handling description is misleading

**Severity:** Low

NATS request-reply does not transport thrown exceptions across services. The responder can only publish a response message. The caller's `request()` wraps **local** errors (timeout, connection failure, malformed reply) in `RequestReplyException`.

The following text implies exceptions thrown by the responder are propagated over the wire:

- `docs/request-reply-patterns.md` lines 78–81:
  > "If the responder throws a `RequestReplyException`, it is re-thrown to the caller."
- `docs/request-reply-patterns.md` lines 358–359:
  > "For the **sync pattern**, the responder should throw a `RequestReplyException`. The NATS request-reply mechanism propagates the error back to the caller."

**Fix:** Replace both passages with an accurate description.

#### `docs/request-reply-patterns.md` Section 2 (around line 78)

Replace:

```markdown
- If the responder throws a `RequestReplyException`, it is re-thrown to the caller.
- Network errors and timeouts are wrapped in `RequestReplyException` automatically.
```

With:

```markdown
- Network errors, timeouts, and malformed replies are wrapped in `RequestReplyException` on the caller side.
- Responder business errors should be encoded in the response payload (or headers) so the caller can inspect them.
```

#### `docs/request-reply-patterns.md` Section 8 (around line 358)

Replace:

```markdown
For the **sync pattern**, the responder should throw a `RequestReplyException`. The NATS request-reply mechanism propagates the error back to the caller.
```

With:

```markdown
For the **sync pattern**, responder errors should be returned as part of the response payload. The caller receives the response and interprets the embedded error. Timeouts and transport failures on the caller side are thrown as `RequestReplyException`.
```

## Verification Steps

1. Apply the changes above.
2. Search for every `buildResponseEnvelope` example and confirm `replyTo: event.reply_to` is present.
3. Search for every `@OnRequestReply` handler and confirm the signature includes `context: EventContext`.
4. Confirm all internal Markdown links still resolve (`docs/event-messaging-convention.md`, `docs/ai-agent-guidelines.md`, `docs/outbox-configuration.md`, `.agent/project-info/architecture.md`).
5. Run `npm run lint:md` or Prettier over the changed files if available.
6. Optionally run the test suite to confirm the documented behavior matches the source code.
