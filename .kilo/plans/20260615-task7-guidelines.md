# Implementation Plan: Task 7 — Guidelines for Developers & AI Agents

## Task Summary

Create guidelines for developers and AI agents on choosing request-reply patterns. Includes a new `docs/request-reply-guidelines.md` file, updates to `docs/ai-agent-guidelines.md`, and updates to `README.md`.

## Pre-Analysis

### Current State

- `docs/request-reply-patterns.md` exists — comprehensive reference doc covering sync/async patterns, correlation ID, timeouts, idempotency, error handling, and API reference.
- `docs/ai-agent-guidelines.md` exists — step-by-step guide for event creation, naming, publishing, consuming, outbox, and validation. Lacks request-reply-specific guidance.
- `docs/event-messaging-convention.md` exists — convention doc with §2.1 on response subject naming.
- `docs/outbox-configuration.md` exists — includes §Request-Reply with the Outbox.
- `README.md` exists — includes request-reply usage sections but no link to a dedicated decision-making guidelines doc.

### Key Insight

The new `request-reply-guidelines.md` must be a **decision-making guide** (when to use what), not a duplicate of the existing `request-reply-patterns.md` reference. It should link to the existing reference for code examples and API details.

---

## Plan Steps

### Step 1 — Create `docs/request-reply-guidelines.md`

Create a new file with the following sections:

#### Section 1: Overview
- Brief intro: purpose of this guide (decision-making, not API reference)
- Link to `request-reply-patterns.md` for full code examples and API reference

#### Section 2: Decision Tree — Sync vs Async

A text-based flowchart with clear yes/no decision points:

```
1. Does the caller need the result to proceed?
   ├─ No  → Use Async (sendRequest + @OnRequestReply)
   └─ Yes → 2. Can the responder reply within ~5 seconds?
              ├─ Yes → Use Sync (request())
              └─ No  → 3. Is the operation compute-heavy or multi-service?
                         ├─ Yes → Use Async
                         └─ No  → Use Sync with extended timeout
```

Followed by a summary table:

| Criterion | Choose Sync | Choose Async |
|-----------|-------------|--------------|
| Caller blocks | Acceptable | Unacceptable |
| Response time | < 5s | > 5s or unpredictable |
| Complexity | Simple query | Multi-step workflow |
| Throughput | Low-to-moderate | High |
| Coupling | Tight (acceptable) | Loose (preferred) |
| Error propagation | Direct (acceptable) | Must be event-based |

#### Section 3: When to Use the Outbox with Request-Reply

A table determining when persistence is needed:

| Pattern | Outbox for Request? | Outbox for Response? | Reason |
|---------|---------------------|----------------------|--------|
| Sync `request()` | No | No | NATS handles reply inbox internally |
| Async `sendRequest()` | Yes (if durability needed) | No | `sendRequestThroughOutbox` preserves `reply_to` |
| Async `sendRequest()` (fire-and-forget OK) | No | No | If request loss is acceptable |

Include link to `outbox-configuration.md` for full setup details.

#### Section 4: Timeout Recommendations

##### Sync Pattern
- Default: 5000 ms (`RequestReplyConfig.defaultTimeoutMs`)
- Recommended per-scenario:
  - Simple lookups (fetch by ID): 3000–5000 ms
  - Lightweight processing: 5000–10000 ms
  - External API calls: 10000–30000 ms
- Override per call: `{ context, timeoutMs: 15000 }`
- Error: `RequestReplyException` with request metadata

##### Async Pattern
- No built-in timeout — application must implement one of:
  - **SAGA coordinator**: Track pending requests, expire after deadline
  - **Deadline event**: Publish a "request expired" event after configured period
  - **DB tracking**: Store pending request IDs with timestamps; background job cleans expired entries
- Recommended application-level timeouts:
  - Short workflows: 30s – 2 min
  - Batch/external processing: 5 min – 15 min
  - Never leave async requests without a timeout mechanism

#### Section 5: Idempotency Requirements

- **Rule**: All request-reply handlers MUST be idempotent.
- **Request side**: Use `correlation_id` + `event.id` for deduplication. NATS delivers at-least-once.
- **Response side**: Cache results by `correlation_id`. Return cached response for duplicate requests.
- Link to `request-reply-patterns.md §7` for detailed implementation pattern.

#### Section 6: Correlation ID Best Practices

1. **Generate once per transaction chain**: Originating service creates `correlation_id` via `generateUuidV7()`.
2. **Preserve across boundaries**: `buildResponseEnvelope()` automatically preserves `correlation_id` from the request event.
3. **Never regenerate mid-chain**: If service B receives a request with `correlation_id`, the response MUST carry the same `correlation_id`.
4. **Combine with `causation_id`**: Set `causation_id` to the request event's `id` to trace causality.
5. **Anti-pattern**: Generating a new `correlation_id` for the response event — breaks traceability.

#### Section 7: Error Handling Guidelines

##### Sync Pattern
- Caller catches `RequestReplyException` (timeout, network error).
- Responder encodes errors in response payload (not thrown exceptions).
- Pattern: success field + error details in response data.

##### Async Pattern
- Responder publishes an error response event on the `reply_to` subject.
- Use a typed error response class with `errorCode`, `message`, `retryable` fields.
- For consumer-level errors (invalid request): throw `EventConsumerException` → DLQ.
- Caller must handle both success and error response types.

##### Retry Strategy
| Error Type | Sync Retry | Async Retry |
|-----------|-----------|-------------|
| Timeout | Retry once, then fail fast | Re-publish request (if via outbox) |
| Network | Auto-reconnect by NATS | Re-publish via outbox |
| Business error | Inspect response, decide | Handle error response event |
| Responder unavailable | Fail after timeout | Outbox retries with backoff |

#### Section 8: AI Agent Rules for Naming New Request-Reply Events

1. **Request subjects**: Follow standard convention `company.{id}.{domain}.{entity}.{action}.v{version}` — use past-tense action for the request intent (e.g., `requested`, `submitted`, `queried`).
2. **Response subjects — preferred**: Use a distinct descriptive past-tense action (e.g., `calculated`, `approved`, `completed`). This makes responses discoverable as first-class events.
3. **Response subjects — alternative**: Use `buildResponseSubject()` to append `.response` suffix when no distinct outcome verb exists.
4. **Never reuse a fire-and-forget subject** for request-reply — request subjects should clearly indicate a response is expected.
5. **`reply_to` always set by the requester**: Never set `reply_to` in fire-and-forget events. Only set it for async request-reply patterns.
6. **Correlation ID**: Always generate via `generateUuidV7()` and propagate through the full chain.
7. **Type field**: `type` in the envelope must match `domain.entity.action` (e.g., `credit.check.requested`, `credit.check.completed`).
8. **Subject Builder**: Always use `SubjectBuilder.build()` or `buildSubject()` — never concatenate subject strings.
9. **Naming checklist** (for AI agents creating new request-reply flows):
   - [ ] Request subject follows `company.{id}.{domain}.{entity}.{action}.v{version}`
   - [ ] Response subject uses past-tense action OR `.response` suffix
   - [ ] `correlation_id` generated as UUIDv7 and preserved in response
   - [ ] `type` field matches `domain.entity.action` in both request and response
   - [ ] `reply_to` set only on async request side, not on fire-and-forget events
   - [ ] Both request and response data classes have `class-validator` decorators
   - [ ] Response handler uses `@OnRequestReply` or `@OnEvent` with correct subject

---

### Step 2 — Update `docs/ai-agent-guidelines.md`

Add a new section **"Request-Reply Guidelines"** before the **"Validation Checklist"** section. Content:

```markdown
## Request-Reply Guidelines

For the full decision-making guide, see [`request-reply-guidelines.md`](request-reply-guidelines.md).

### Quick Decision: Sync vs Async

- **Use `request()`** when the caller needs the result immediately and the responder can reply within seconds.
- **Use `sendRequest()` + `@OnRequestReply`** when the operation is long-running, the caller should not block, or the response involves multiple services.

### Rules for AI Agents

1. Always use `SubjectBuilder.build()` or `buildSubject()` for request subjects — never concatenate strings.
2. Response subjects: prefer descriptive past-tense action (e.g., `calculated`). Use `buildResponseSubject()` only when no distinct outcome verb exists.
3. Generate `correlation_id` with `generateUuidV7()` once per transaction chain. Preserve it in responses via `buildResponseEnvelope()`.
4. Set `reply_to` only for async request-reply. Never set it for fire-and-forget events.
5. All request-reply handlers MUST be idempotent. Use `correlation_id` for deduplication.
6. For async request-reply with durability requirements, use `sendRequestThroughOutbox()` — do not use `saveToOutbox()` for request-reply events.
7. Sync pattern: catch `RequestReplyException` for timeout/error handling. Override timeout with `timeoutMs`.
8. Async pattern: implement application-level timeout (SAGA, deadline event, or DB tracking). Never leave requests without a timeout.

### Naming Checklist for Request-Reply Events

- [ ] Request subject: `company.{id}.{domain}.{entity}.{action}.v{version}`
- [ ] Response subject: descriptive past-tense OR `.response` suffix
- [ ] `correlation_id`: UUIDv7, generated once, preserved across chain
- [ ] `type`: matches `domain.entity.action` in request and response envelopes
- [ ] `reply_to`: set on request only, not on fire-and-forget
- [ ] Data classes: `class-validator` decorators on every field
- [ ] Response handler: `@OnRequestReply` or `@OnEvent` with correct subject
```

### Step 3 — Update `README.md`

#### 3a. Add link in "Request-Reply Pattern" section (around line 338)

After the existing line:
```markdown
The toolkit supports two request-reply patterns. For the full guide, see [Request-Reply Patterns](docs/request-reply-patterns.md).
```

Change to:
```markdown
The toolkit supports two request-reply patterns. For the full guide, see [Request-Reply Patterns](docs/request-reply-patterns.md). For guidance on choosing between sync and async patterns, see [Request-Reply Guidelines](docs/request-reply-guidelines.md).
```

#### 3b. Add link in "Related Documentation" section (around line 679)

Add this entry:
```markdown
- [Request-Reply Guidelines](docs/request-reply-guidelines.md) — Decision tree, timeout recommendations, and best practices for choosing request-reply patterns
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `docs/request-reply-guidelines.md` | **CREATE** — New decision-making guide |
| `docs/ai-agent-guidelines.md` | **MODIFY** — Add request-reply guidelines section |
| `README.md` | **MODIFY** — Add links to new guidelines doc |

## Verification

- No code changes required — documentation only
- No build, test, or lint steps needed
- Verify all internal doc links are correct
- Verify `README.md` links section includes new doc
- Verify `ai-agent-guidelines.md` flows naturally with added section
- Verify no duplication of content between `request-reply-guidelines.md` and `request-reply-patterns.md` (guidelines links to patterns for code examples)

## Git Action

- Commit message: `docs: add request-reply guidelines and update ai-agent-guidelines`