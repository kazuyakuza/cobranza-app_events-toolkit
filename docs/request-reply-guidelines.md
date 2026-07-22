# Request-Reply Guidelines

> **Onboarding:** This document covers **step 6 (Request-Reply)** of the [Onboarding Flow](../README.md#onboarding-flow).

## Overview

This guide helps developers and AI agents **decide when to use sync vs async request-reply patterns** in the events-toolkit. It is a decision-making guide, not an API reference.

For full code examples and API details, see [Request-Reply Patterns](request-reply-patterns.md).

---

## Decision Tree — Sync vs Async

### Flowchart

```
1. Does the caller need the result to proceed?
   ├─ No  → Use Async (sendRequest + @OnRequestReply)
   └─ Yes → 2. Can the responder reply within ~5 seconds?
              ├─ Yes → Use Sync (request())
              └─ No  → 3. Is the operation compute-heavy or multi-service?
                         ├─ Yes → Use Async
                         └─ No  → Use Sync with extended timeout
```

### Summary Table

| Criterion | Choose Sync | Choose Async |
|-----------|-------------|--------------|
| Caller blocks | Acceptable | Unacceptable |
| Response time | < 5s | > 5s or unpredictable |
| Complexity | Simple query | Multi-step workflow |
| Throughput | Low-to-moderate | High |
| Coupling | Tight (acceptable) | Loose (preferred) |
| Error propagation | Direct (acceptable) | Must be event-based |

---

## When to Use the Outbox with Request-Reply

| Pattern | Outbox for Request? | Outbox for Response? | Reason |
|---------|---------------------|----------------------|--------|
| Sync `request()` | No | No | NATS handles reply inbox internally |
| Async `sendRequest()` | Yes — use `sendAsyncRequestThroughOutbox` | Only for side effects | Outbox ensures request delivery |
| Async `sendRequest()` (fire-and-forget OK) | No | No | Use `RequestReplyService.sendRequest()` directly |

### Using `sendAsyncRequestThroughOutbox`

Prefer `sendAsyncRequestThroughOutbox` over manually building envelopes:

- **TypeScript enforces `replyTo`**: The `AsyncRequestEventContext` type requires `replyTo`, catching errors at compile time.
- **Automatic envelope construction**: No need to manually call `createEvent` — the method handles it.
- **Returns `correlationId`**: Useful for tracking async responses.
- **Same reliability**: Delegates to `saveToOutbox` internally, benefiting from the same retry and DLQ pipeline.

For full outbox setup details, see [Outbox Configuration](outbox-configuration.md).

---

## Timeout Recommendations

### Sync Pattern

- **Default**: 5000 ms (`RequestReplyConfig.defaultTimeoutMs`)
- **Configuration**: Provide `REQUEST_REPLY_CONFIG_TOKEN` in your module providers (e.g., `{ provide: REQUEST_REPLY_CONFIG_TOKEN, useValue: { defaultTimeoutMs: 5000 } }`).
- **Recommended per-scenario**:
  - Simple lookups (fetch by ID): 3000–5000 ms
  - Lightweight processing: 5000–10000 ms
  - External API calls: 10000–30000 ms
- **Override per call**: `{ context, timeoutMs: 15000 }`
- **Error**: `RequestReplyException` with request metadata

### Async Pattern

- No built-in timeout — application must implement one of:
  - **SAGA coordinator**: Track pending requests, expire after deadline
  - **Deadline event**: Publish a "request expired" event after configured period
  - **DB tracking**: Store pending request IDs with timestamps; background job cleans expired entries
- **Recommended application-level timeouts**:
  - Short workflows: 30s – 2 min
  - Batch/external processing: 5 min – 15 min
- Never leave async requests without a timeout mechanism

---

## Idempotency Requirements

- **Rule**: All request-reply handlers MUST be idempotent.
- **Request side**: Use `correlation_id` + `event.id` for deduplication. NATS delivers at-least-once.
- **Response side**: Cache results by `correlation_id`. Return cached response for duplicate requests.

For detailed implementation pattern, see [Request-Reply Patterns §7](request-reply-patterns.md).

---

## Correlation ID Best Practices

1. **Generate once per transaction chain**: The originating service creates a `correlation_id` using `generateUuidV7()`. Note: the `@IsUUID('4')` validator accepts both UUIDv4 and UUIDv7 strings, so this is compatible.
2. **Preserve across boundaries**: `buildResponseEnvelope()` automatically preserves `correlation_id` from the request event.
3. **Never regenerate mid-chain**: If service B receives a request with `correlation_id`, the response MUST carry the same `correlation_id`.
4. **Combine with `causation_id`**: Set `causation_id` to the request event's `id` to trace causality.
5. **Anti-pattern**: Generating a new `correlation_id` for the response event — breaks traceability.

---

## Error Handling Guidelines

### Sync Pattern

- Caller catches `RequestReplyException` (timeout, network error).
- Responder encodes errors in response payload (not thrown exceptions).
- Pattern: success field + error details in response data.

### Async Pattern

- Responder publishes an error response event on the `reply_to` subject.
- Use a typed error response class with `errorCode`, `message`, `retryable` fields.
- For consumer-level errors (invalid request): throw `EventConsumerException` → DLQ.
- Caller must handle both success and error response types.

### Retry Strategy

| Error Type | Sync Retry | Async Retry |
|-----------|-----------|-------------|
| Timeout | Retry once, then fail fast | Re-publish request (if via outbox) |
| Network | Auto-reconnect by NATS | Re-publish via outbox |
| Business error | Inspect response, decide | Handle error response event |
| Responder unavailable | Fail after timeout | Outbox retries with backoff |

---

## Performance & Reliability Trade-Offs

### Latency Characteristics

| Pattern | Typical Latency | Best-Case | Worst-Case |
|---------|----------------|-----------|------------|
| Sync `request()` | 2× network RTT + processing time | ~5–50 ms | Timeout (5s default) |
| Async `sendRequest()` | Single network RTT (request publication) | ~1–10 ms | Outbox publish time (~5 ms) |

Under the sync pattern, the caller blocks for the full round-trip. Under async, the caller receives the `correlationId` immediately and processes the response when it arrives.

### Throughput Under Load

| Pattern | Caller Blocking | Memory per Request | Scalability |
|---------|----------------|-------------------|-------------|
| Sync `request()` | Yes — thread blocked | Minimal (NATS inbox) | Degrades under high concurrency; each request ties up a handler |
| Async `sendRequest()` | No — fire-and-forget | Minimal | Scales horizontally; no thread pool contention |

For high-throughput scenarios (>100 req/s per service), prefer async patterns.

### Failure Modes & Recovery

| Failure Mode | Sync Recovery | Async Recovery |
|-------------|---------------|----------------|
| Responder down | `RequestReplyException` → caller decides: retry or fail | Outbox retries with backoff (if using outbox) |
| Network partition | Timeout → exception | NATS reconnects; outbox re-publishes |
| Responder slow | Caller times out | No caller block; response arrives when ready |
| Duplicate delivery | Idempotent handler must deduplicate | Idempotent handler must deduplicate |
| Message lost | NATS JetStream guarantees delivery | Outbox guarantees at-least-once publish |

### Combining with the Outbox for Reliability

| Pattern | Outbox for Request? | Outbox for Side Effects? | Reliability Level |
|---------|---------------------|--------------------------|-------------------|
| Sync `request()` | No | Yes | Medium (request not guaranteed, side effects guaranteed) |
| Async `sendRequest()` via outbox | Yes | Yes | High (both request and side effects guaranteed) |
| Async `sendRequest()` direct | No | Yes | Medium (request not guaranteed, side effects guaranteed) |

**Recommendation**: For async request-reply requiring guaranteed delivery, always use `sendAsyncRequestThroughOutbox`. For sync request-reply, the outbox is not needed for the request itself, but use it for any side effects triggered by the response.

### INBOX Subject Fallback

When a requester uses an INBOX `reply_to` (e.g., `nats req` CLI, transient reply patterns), the subject does not match any JetStream stream. Publishing via `ProducerService` (JetStream) then times out waiting for a PubAck, and the inbound message is never acked — causing repeated redelivery.

Enable `fallbackToCoreNatsOnInbox: true` in `RequestReplyConfig` to route INBOX `reply_to` subjects through core NATS `publish()` instead. Only subjects matching `coreNatsFallbackPattern` (default `'^_?INBOX\\.'`) are affected; all other responses continue through JetStream unchanged. This is backward compatible (default `false`).

**When to enable:**
- Manual testing with `nats req` or other core-NATS requesters.
- Transient request-reply patterns where the reply subject is an ephemeral INBOX.
- Hybrid environments where some callers use core NATS and others use JetStream.

---

## AI Agent Rules for Naming New Request-Reply Events

1. **Request subjects**: Follow standard convention `company.{id}.{domain}.{entity}.{action}.v{version}` — use past-tense action for the request intent (e.g., `requested`, `submitted`, `queried`).
2. **Response subjects — preferred**: Use a distinct descriptive past-tense action (e.g., `calculated`, `approved`, `completed`). This makes responses discoverable as first-class events.
3. **Response subjects — alternative**: Use `buildResponseSubject()` to append `.response` suffix when no distinct outcome verb exists.
4. **Never reuse a fire-and-forget subject** for request-reply — request subjects should clearly indicate a response is expected.
5. **`reply_to` always set by the requester**: Never set `reply_to` in fire-and-forget events. Only set it for async request-reply patterns.
6. **Correlation ID**: Always generate using `generateUuidV7()` and propagate through the full chain.
7. **Type field**: `type` in the envelope must match `domain.entity.action` (e.g., `credit.check.requested`, `credit.check.completed`).
8. **Subject Builder**: Always use `SubjectBuilder.build()` or `buildSubject()` — never concatenate subject strings.
9. **Naming checklist** (for AI agents creating new request-reply flows):
   - [ ] Request subject follows `company.{id}.{domain}.{entity}.{action}.v{version}`
   - [ ] Response subject uses past-tense action OR `.response` suffix
   - [ ] `correlation_id`: Use `generateUuidV7()`, generated once, preserved across chain
   - [ ] `type` field matches `domain.entity.action` in both request and response
   - [ ] `reply_to` set only on async request side, not on fire-and-forget events
   - [ ] Both request and response data classes have `class-validator` decorators
   - [ ] Response handler uses `@OnRequestReply` or `@OnEvent` with correct subject
