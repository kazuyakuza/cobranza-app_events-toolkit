# Task 5: Final Documentation & Decision Guidelines — Implementation Plan

## Pre-Analysis

### Current Documentation State

| File | Lines | Has TOC | Status |
|------|-------|---------|--------|
| `README.md` | 790 | No | Missing links to testing & outbox-guidelines docs |
| `docs/request-reply-patterns.md` | 595 | No | Needs TOC; Section 4 needs cross-ref to guidelines decision tree |
| `docs/request-reply-guidelines.md` | 148 | Short enough | Missing performance/reliability trade-offs section |
| `docs/ai-agent-guidelines.md` | 259 | No (borderline) | Missing correlation/causation section; missing EventConsumerException decision guide |
| `docs/outbox-configuration.md` | 315 | No | Needs TOC |
| `docs/outbox-transactional-usage.md` | 138 | Short enough | OK |
| `docs/event-messaging-convention.md` | 308 | No | Needs TOC |
| `docs/testing-utilities.md` | 341 | No | Needs TOC |
| `docs/examples/*.ts` | ~430 total | N/A | OK — reference `@cobranza-apps/events-toolkit` correctly |

### Package Name Verification

All documentation files consistently use `@cobranza-apps/events-toolkit` as the package name in code blocks and import statements. This matches `package.json` `name` field. No fixes needed for package name references.

### UUID Inconsistency Found

- `docs/request-reply-guidelines.md` line 97: "UUID v4" reference
- `docs/request-reply-guidelines.md` line 138: "Always generate as a UUID v4"
- `docs/ai-agent-guidelines.md` line 205: "Generate correlation_id as a UUID v4"
- The codebase uses `generateUuidV7()` throughout and the convention says UUIDv7 for event IDs
- The `EventContext.correlationId` validation uses `@IsUUID('4')` — this is a code-level inconsistency
- Documentation should recommend `generateUuidV7()` for consistency and note the `@IsUUID('4')` validator accepts both UUIDv4 and UUIDv7 strings

### Key Gaps

1. **Missing TOC/indexes** in 6 long documents
2. **Missing "Outbox Usage Guidelines"** — new decision-making doc
3. **Missing correlation/causation best practices** in `ai-agent-guidelines.md`
4. **Missing EventConsumerException decision guide** in `ai-agent-guidelines.md`
5. **Missing performance/reliability trade-offs** in `request-reply-guidelines.md`
6. **Missing cross-reference** from `request-reply-patterns.md` Section 4 to the guidelines decision tree
7. **UUID inconsistency** in `request-reply-guidelines.md` and `ai-agent-guidelines.md`
8. **README "Related Documentation"** missing links to `testing-utilities.md`, `outbox-transactional-usage.md`, and new doc

---

## Phase 1: Add Table of Contents to Long Documents

### Step 1.1 — Add TOC to `docs/request-reply-patterns.md`

**File:** `docs/request-reply-patterns.md`

Insert a TOC block after line 6 (after the `---` that follows the intro paragraph, before Section 1 heading):

```markdown
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
```

### Step 1.2 — Add TOC to `docs/outbox-configuration.md`

**File:** `docs/outbox-configuration.md`

Insert a TOC block after line 16 (after the overview section intro, before "## When to Use Each Backend"):

```markdown
## Table of Contents

- [When to Use Each Backend](#when-to-use-each-backend)
- [SQLite Configuration](#sqlite-configuration)
- [PostgreSQL Configuration](#postgresql-configuration)
- [OutboxServiceOptions Reference](#outboxserviceoptions-reference)
- [Background Processor Behavior](#background-processor-behavior)
- [DLQ Routing](#dlq-routing)
- [Usage After Configuration](#usage-after-configuration)
- [Transactional Outbox (PostgreSQL + TypeORM)](#transactional-outbox-postgresql--typeorm)
- [Request-Reply with the Outbox](#request-reply-with-the-outbox)
- [Migration from 0.x API](#migration-from-0x-api)
```

### Step 1.3 — Add TOC to `docs/event-messaging-convention.md`

**File:** `docs/event-messaging-convention.md`

Insert a TOC block after line 8 (after the subtitle, before "## 1. Purpose"):

```markdown
## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Subject Naming Convention](#2-subject-naming-convention-natsjetstream)
- [3. Event Envelope (Payload Structure)](#3-event-envelope-payload-structure)
- [4. Good Practices](#4-good-practices)
- [5. Actor Types](#5-actor-types-enum)
```

### Step 1.4 — Add TOC to `docs/testing-utilities.md`

**File:** `docs/testing-utilities.md`

Insert a TOC block after line 8 (after the overview paragraph, before "## Installation"):

```markdown
## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Mock Services](#mock-services)
- [Assertion Helpers](#assertion-helpers)
- [Examples](#examples)
```

### Step 1.5 — Add TOC to `docs/ai-agent-guidelines.md`

**File:** `docs/ai-agent-guidelines.md`

Insert a TOC block after line 8 (after the overview, before "## Quick Reference"):

```markdown
## Table of Contents

- [Quick Reference: Convention Rules](#quick-reference-convention-rules)
- [Step-by-Step: Creating a New Event Class](#step-by-step-creating-a-new-event-class)
- [Step-by-Step: Naming New Events](#step-by-step-naming-new-events)
- [Step-by-Step: Publishing Events](#step-by-step-publishing-events)
- [Step-by-Step: Consuming Events](#step-by-step-consuming-events)
- [Step-by-Step: Using the Outbox](#step-by-step-using-the-outbox)
- [Request-Reply Guidelines](#request-reply-guidelines)
- [Correlation & Causation Best Practices](#correlation--causation-best-practices)
- [When to Throw EventConsumerException](#when-to-throw-eventconsumerexception)
- [Validation Checklist](#validation-checklist)
- [Common Mistakes](#common-mistakes)
- [Public API Quick Reference](#public-api-quick-reference)
```

### Step 1.6 — Add TOC to `README.md`

**File:** `README.md`

Insert a TOC block after line 31 (after `---` that follows "Non-goals" section, before "## Installation"):

```markdown
## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Usage](#usage)
- [Architecture](#architecture)
- [Guidelines for AI Agents](#guidelines-for-ai-agents)
- [Development](#development)
- [Related Documentation](#related-documentation)
- [License](#license)
```

---

## Phase 2: Create "Outbox Usage Guidelines" Document

### Step 2.1 — Create `docs/outbox-usage-guidelines.md`

**File:** `docs/outbox-usage-guidelines.md` (NEW)

This is a **decision-making guide** (like `request-reply-guidelines.md` is to `request-reply-patterns.md`). It should NOT duplicate content from `outbox-configuration.md` or `outbox-transactional-usage.md`. It links to them for details.

Content outline:

```markdown
# Outbox Usage Guidelines

For detailed configuration, see [Outbox Configuration](outbox-configuration.md).
For transactional outbox usage, see [Transactional Outbox Usage Guide](outbox-transactional-usage.md).

---

## Table of Contents

- [Do You Need the Outbox?](#do-you-need-the-outbox)
- [Decision Tree: Backend Selection](#decision-tree-backend-selection)
- [Decision Tree: saveToOutbox vs saveInTransaction](#decision-tree-savetooutbox-vs-saveintransaction)
- [Decision Tree: Normal vs Request-Reply Outbox API](#decision-tree-normal-vs-request-reply-outbox-api)
- [SQLite vs PostgreSQL: Trade-Offs](#sqlite-vs-postgresql-trade-offs)
- [Retry & DLQ Behavior](#retry--dlq-behavior)
- [Common Patterns](#common-patterns)
- [Related Documentation](#related-documentation)

---

## Do You Need the Outbox?

| Scenario | Need Outbox? | Reason |
|----------|-------------|--------|
| Service writes to DB, then publishes event | Yes | Guarantees event delivery even if NATS is temporarily down |
| Simple fire-and-forget event | Optional | `ProducerService.publish()` works, but outbox adds durability |
| Sync request-reply (`request()`) | No | NATS handles reply internally; outbox not needed for the request |
| Async request-reply needing guaranteed delivery | Yes | Use `sendAsyncRequestThroughOutbox` |
| Service restarts frequently | Yes | Outbox ensures events are published after recovery |

---

## Decision Tree: Backend Selection

```
1. Does the service already use PostgreSQL with TypeORM?
   ├─ Yes → Use PostgreSQL backend (shares existing DB, no extra file)
   └─ No  → 2. Does the service have access to persistent storage (Docker volume)?
              ├─ Yes → Use SQLite backend (lightweight, self-contained)
              └─ No  → Use ProducerService.publish() directly (no outbox durability)
```

For configuration details, see:
- [SQLite Configuration](outbox-configuration.md#sqlite-configuration)
- [PostgreSQL Configuration](outbox-configuration.md#postgresql-configuration)

---

## Decision Tree: saveToOutbox vs saveInTransaction

```
1. Is the event published as part of a database transaction?
   ├─ Yes → 2. Are you using PostgreSQL + TypeORM?
   │          ├─ Yes → Use saveInTransaction (atomicity guaranteed)
   │          └─ No (SQLite) → Use saveToOutbox (simpler; no transactional atomicity needed)
   └─ No → Use saveToOutbox (fire-and-forget event persistence)
```

| Aspect | `saveToOutbox` | `saveInTransaction` |
|--------|---------------|---------------------|
| Transaction scope | Independent INSERT | INSERT within caller's transaction |
| Atomicity guarantee | Event persisted regardless of business outcome | Event rolled back with business data on failure |
| Backend support | PostgreSQL and SQLite | PostgreSQL (TypeORM QueryRunner); SQLite ignores context |
| When to use | Fire-and-forget; simple event publishing | Business write + event must be atomic |
| API | `saveToOutbox(event, subject)` | `saveInTransaction({ event, subject, transactionContext })` |

For full code examples, see [Transactional Outbox Usage Guide](outbox-transactional-usage.md).

---

## Decision Tree: Normal vs Request-Reply Outbox API

```
1. Is the event part of a request-reply flow?
   ├─ Yes → 2. Do you have a pre-built EventEnvelope?
   │          ├─ Yes → Use sendRequestThroughOutbox (low-level API)
   │          └─ No  → Use sendAsyncRequestThroughOutbox (high-level API, enforces replyTo at compile time)
   └─ No → Use saveToOutbox (standard fire-and-forget)
```

| API | Purpose | Returns | replyTo Validation |
|-----|---------|---------|-------------------|
| `saveToOutbox` | Standard event persistence | `void` | None (fire-and-forget) |
| `sendRequestThroughOutbox` | Async request-reply (low-level) | `void` | Runtime (`ensureReplyToPresent()`) |
| `sendAsyncRequestThroughOutbox` | Async request-reply (high-level) | `{ correlationId }` | Compile-time (`AsyncRequestEventContext` type) |

**Never use `saveToOutbox` for request-reply events** — it lacks `replyTo` validation and the method name doesn't communicate the request-reply intent.

---

## SQLite vs PostgreSQL: Trade-Offs

| Aspect | SQLite | PostgreSQL |
|--------|--------|-----------|
| Setup complexity | Minimal (single file) | Requires separate database |
| Infrastructure dependency | None | Requires PostgreSQL instance |
| Transactional atomicity | No (single-connection) | Yes (via TypeORM QueryRunner) |
| Docker requirement | Persistent volume needed | Shares existing DB |
| Best for | Lightweight microservices without DB | `ms-db-gateway` and services with PostgreSQL |
| Scalability | Single-writer | Full concurrent access |

---

## Retry & DLQ Behavior

- Background processor polls pending entries at `processorIntervalMs` (default: 5000ms)
- On publish success: entry marked `sent`
- On publish failure: attempt counter incremented, exponential backoff applied
- After `maxRetries` (default: 3): routed to DLQ subject (`dlq.{original_subject}`)
- DLQ payload includes: original envelope, `last_error`, `attempts`, `failed_at`
- Request-reply events preserve `reply_to` through DLQ routing

Configure via `OutboxServiceOptions`:

| Option | Default | Description |
|--------|---------|-------------|
| `processorIntervalMs` | 5000 | Background processor poll interval (ms) |
| `maxRetries` | 3 | Max retries before DLQ routing |
| `retryBackoffBaseMs` | 1000 | Base delay for exponential backoff |

---

## Common Patterns

### Pattern 1: Simple Fire-and-Forget with Outbox (SQLite)

```typescript
const event = createEvent(data, context);
await this.outboxService.saveToOutbox(event, subject);
```

### Pattern 2: Transactional Publish with Business Write (PostgreSQL)

```typescript
await this.outboxService.saveInTransaction({ event, subject, transactionContext });
// Commit the transaction — both business write and outbox INSERT are atomic
```

### Pattern 3: Async Request-Reply Through Outbox (High-Level)

```typescript
const result = await this.outboxService.sendAsyncRequestThroughOutbox({
  subject: requestSubject,
  payload: { clientId },
  context: { /* AsyncRequestEventContext with replyTo */ },
});
// Track result.correlationId for async response handling
```

### Pattern 4: Sync Request-Reply (No Outbox Needed)

```typescript
const response = await this.requestReply.request(subject, payload, { context, timeoutMs: 5000 });
// Side effects from the response can use the outbox:
await this.outboxService.saveToOutbox(sideEffectEvent, sideEffectSubject);
```

---

## Related Documentation

- [Outbox Configuration](outbox-configuration.md) — SQLite/PostgreSQL setup, service options, migration guide
- [Transactional Outbox Usage Guide](outbox-transactional-usage.md) — TypeORM examples, TransactionContext, error handling
- [Request-Reply Patterns](request-reply-patterns.md) — Sync and async patterns
- [Request-Reply Guidelines](request-reply-guidelines.md) — Decision tree for sync vs async and outbox usage
- [Event & Messaging Convention](event-messaging-convention.md) — Full convention specification
```

---

## Phase 3: Expand `ai-agent-guidelines.md`

### Step 3.1 — Add "Correlation & Causation Best Practices" section

**File:** `docs/ai-agent-guidelines.md`

Insert a new section after the "Request-Reply Guidelines" section (after line 210, before "## Validation Checklist"):

```markdown
## Correlation & Causation Best Practices

### What is `correlation_id`?

`correlation_id` links all events that belong to the same transaction chain. It is **generated once** by the originating service and **propagated unchanged** through every subsequent event in the chain.

### What is `causation_id`?

`causation_id` identifies the specific event that **caused** the current event. Set `causation_id` to the `id` of the triggering event to trace cause-and-effect relationships.

### Rules

1. **Generate `correlation_id` once per chain**: The service that initiates a transaction creates the `correlation_id` using `generateUuidV7()`. All downstream events carry the same `correlation_id`.
2. **Set `causation_id` to the parent event's `id`**: When service B receives event A and publishes event B as a result, event B's `causation_id` = event A's `id`.
3. **Never regenerate `correlation_id` mid-chain**: Regenerating breaks traceability. If service C receives an event with `correlation_id`, the response MUST preserve it.
4. **Use both for debugging**: `correlation_id` traces the full chain; `causation_id` traces the immediate parent. Together they form a directed acyclic graph (DAG) of event causality.

### Example

```typescript
// Service A — originating event
const context: EventContext = {
  correlationId: generateUuidV7(),  // Generated once
  causationId: undefined,             // No parent — this is the root
  // ...
};

// Service B — receives A's event, publishes new event
const newContext: EventContext = {
  correlationId: eventA.correlation_id,  // Preserved from the chain
  causationId: eventA.id,                 // Points to the event that caused this one
  // ...
};
```

### Anti-Patterns

| Anti-Pattern | Why It's Wrong | Fix |
|-------------|---------------|-----|
| Generating a new `correlation_id` for each service hop | Breaks chain traceability | Preserve the original `correlation_id` |
| Leaving `causation_id` empty in chained events | Loses parent-child relationship | Set to the triggering event's `id` |
| Using `correlation_id` as `causation_id` | Confuses chain identity with causality | `correlation_id` = chain; `causation_id` = parent event |
| Skipping `correlation_id` in request-reply responses | Breaks request-response correlation | `buildResponseEnvelope()` preserves it automatically |
```

### Step 3.2 — Add "When to Throw EventConsumerException" section

**File:** `docs/ai-agent-guidelines.md`

Insert after the new "Correlation & Causation Best Practices" section (before "## Validation Checklist"):

```markdown
## When to Throw EventConsumerException

### Decision Guide

```
1. Is the message permanently unprocessable (business rule violation)?
   ├─ Yes → Throw EventConsumerException → routes to DLQ
   └─ No  → 2. Is it a transient failure (network, external service down)?
              ├─ Yes → Let NATS redeliver (throw a generic Error or let it bubble)
              └─ No  → 3. Is it a validation error from malformed input?
                         ├─ Yes (malicious/invalid) → Throw EventConsumerException
                         └─ No  → Log and acknowledge (don't throw)
```

### When to Throw

- **Business rule violation**: The event data violates a domain invariant (e.g., `amount <= 0`, `status` is invalid for the operation).
- **Permanently invalid data**: The event payload is malformed in a way that retries won't fix.
- **Unauthorized operation**: The actor type/ID doesn't have permission for the action.

### When NOT to Throw

- **Transient network failure**: Let NATS redeliver. The consumer will retry.
- **External service temporarily unavailable**: Don't route to DLQ; let NATS retry.
- **Expected business state**: If the event is valid but the handler decides to skip it (e.g., already processed), simply acknowledge without throwing.

### Metadata Enrichment

Use `EventConsumerException` with metadata fields for better DLQ observability:

```typescript
throw new EventConsumerException({
  message: 'Payment amount must be positive',
  eventId: event.id,
  eventType: event.type,
  correlationId: event.correlation_id,
  dlqReason: 'Invalid payment amount',          // Human-readable DLQ reason
  originalSubject: subject,                        // Original NATS subject
  retryCount: 3,                                   // Number of delivery attempts
});
```

These fields appear in the DLQ payload for monitoring and alerting systems.
```

### Step 3.3 — Update TOC in `ai-agent-guidelines.md`

Adjust the TOC added in Step 1.5 to include the new sections:

Already included in Step 1.5 TOC: "Correlation & Causation Best Practices" and "When to Throw EventConsumerException".

### Step 3.4 — Fix UUID inconsistency in `ai-agent-guidelines.md`

**File:** `docs/ai-agent-guidelines.md`

**Line 205** — Change:
```
3. Generate `correlation_id` as a UUID v4 once per transaction chain. Preserve it in responses via `buildResponseEnvelope()`.
```
To:
```
3. Generate `correlation_id` using `generateUuidV7()` once per transaction chain. Preserve it in responses via `buildResponseEnvelope()`. Note: the `@IsUUID('4')` validator accepts both UUIDv4 and UUIDv7 strings.
```

Also update the Request-Reply naming checklist item:
**Line 216** (inside checklist) — Change:
```
- [ ] `correlation_id`: UUID v4, generated once, preserved across chain
```
To:
```
- [ ] `correlation_id`: Use `generateUuidV7()`, generated once, preserved across chain
```

---

## Phase 4: Expand `request-reply-guidelines.md` with Performance/Reliability Trade-Offs

### Step 4.1 — Add "Performance & Reliability Trade-Offs" section

**File:** `docs/request-reply-guidelines.md`

Insert after the "Error Handling Guidelines" section (after line 128, before "## AI Agent Rules for Naming New Request-Reply Events"):

```markdown
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
```

### Step 4.2 — Fix UUID inconsistency in `request-reply-guidelines.md`

**File:** `docs/request-reply-guidelines.md`

**Line 97** — Change:
```
1. **Generate once per transaction chain**: The originating service creates a `correlation_id` as a UUID v4 (current validation requires UUID v4; update `@IsUUID('4')` in source to accept UUIDv7 if that is the intended format).
```
To:
```
1. **Generate once per transaction chain**: The originating service creates a `correlation_id` using `generateUuidV7()`. Note: the `@IsUUID('4')` validator accepts both UUIDv4 and UUIDv7 strings, so this is compatible.
```

**Line 138** — Change:
```
6. **Correlation ID**: Always generate as a UUID v4 and propagate through the full chain.
```
To:
```
6. **Correlation ID**: Always generate using `generateUuidV7()` and propagate through the full chain.
```

Also in the naming checklist item 3:
**Line 145** — Change:
```
- [ ] `correlation_id`: UUID v4, generated once, preserved across chain
```
To:
```
- [ ] `correlation_id`: Use `generateUuidV7()`, generated once, preserved across chain
```

---

## Phase 5: Add Cross-Reference in `request-reply-patterns.md` Section 4

### Step 5.1 — Add cross-reference and decision tree to Section 4

**File:** `docs/request-reply-patterns.md`

After the "### When to choose async" subsection (after line 318), add:

```markdown
> **Decision guide**: For a step-by-step decision flowchart, see [Request-Reply Guidelines — Decision Tree](request-reply-guidelines.md#decision-tree--sync-vs-async).
```

Also add after the Section 4 heading (after line 295):

```markdown
> For a visual decision flowchart and extended best practices, see [Request-Reply Guidelines](request-reply-guidelines.md).
```

---

## Phase 6: Update `README.md` Related Documentation Section

### Step 6.1 — Add missing doc links to "Related Documentation"

**File:** `README.md`

Replace the "Related Documentation" section (lines 776-785) with:

```markdown
## Related Documentation

- [Event & Messaging Convention](docs/event-messaging-convention.md) — Full event standard specification
- [Outbox Configuration](docs/outbox-configuration.md) — SQLite vs Postgres setup, service options, and migration guide
- [Outbox Usage Guidelines](docs/outbox-usage-guidelines.md) — Decision trees for outbox backend, transactional vs normal, and request-reply patterns
- [Transactional Outbox Usage](docs/outbox-transactional-usage.md) — TypeORM transaction examples and saveInTransaction guide
- [AI Agent Guidelines](docs/ai-agent-guidelines.md) — Step-by-step event creation, naming, correlation/causation, and common mistakes
- [Request-Reply Patterns](docs/request-reply-patterns.md) — Sync vs async patterns, correlation, timeouts, and error handling
- [Request-Reply Guidelines](docs/request-reply-guidelines.md) — Decision tree, timeout recommendations, performance trade-offs, and best practices
- [Request-Reply Examples](docs/examples/) — Complete code examples for sync, async, and outbox request-reply patterns
- [Testing Utilities](docs/testing-utilities.md) — Mock services, test module, and assertion helpers
- [Architecture](.agent/project-info/architecture.md) — Module design and data flows
- [Tech Stack](.agent/project-info/tech.md) — Technology choices and development setup
- [Product Overview](.agent/project-info/product.md) — Problem definition and goals
```

### Step 6.2 — Add link to Outbox Usage Guidelines in Outbox Pattern section

**File:** `README.md`

After the outbox pattern section heading (line 460), add a reference:

Find the line that says `### Outbox Pattern` and after the intro paragraph (around line 462), add:

```markdown
For a decision-making guide on when to use the outbox, which backend to choose, and transactional vs normal persistence, see [Outbox Usage Guidelines](docs/outbox-usage-guidelines.md).
```

---

## Phase 7: Package Name Verification Sweep

### Step 7.1 — Verify all docs reference `@cobranza-apps/events-toolkit`

Search all `docs/` files for:
- `"events-toolkit"` without `@cobranza-apps/` prefix → fix to `@cobranza-apps/events-toolkit`
- Any reference to just `events-toolkit` in prose that should use the full package name → fix

Based on thorough review, all code blocks and import statements correctly use `@cobranza-apps/events-toolkit`. Prose references like "the events-toolkit" or "this library" are acceptable as natural language. No changes needed.

---

## Phase 8: Verify and Commit

### Step 8.1 — Verify all files compile/are consistent

Run `npm run build` to verify no broken imports (documentation-only changes should not affect build).

### Step 8.2 — Commit changes

Commit with message:
```
docs: finalize documentation with decision guidelines, indexes, and consistency fixes

- Add Table of Contents to README, request-reply-patterns, outbox-configuration,
  event-messaging-convention, testing-utilities, ai-agent-guidelines
- Create new Outbox Usage Guidelines doc with decision trees
- Add Correlation & Causation Best Practices section to ai-agent-guidelines
- Add When to Throw EventConsumerException decision guide to ai-agent-guidelines
- Add Performance & Reliability Trade-Offs section to request-reply-guidelines
- Add cross-reference from request-reply-patterns to guidelines decision tree
- Fix UUID inconsistency: recommend generateUuidV7() instead of UUID v4
- Update README Related Documentation with all missing links
```

---

## Summary of All Changes

| # | File | Change |
|---|------|--------|
| 1 | `docs/request-reply-patterns.md` | Add TOC; add cross-ref link to guidelines |
| 2 | `docs/outbox-configuration.md` | Add TOC |
| 3 | `docs/event-messaging-convention.md` | Add TOC |
| 4 | `docs/testing-utilities.md` | Add TOC |
| 5 | `docs/ai-agent-guidelines.md` | Add TOC; add Correlation & Causation section; add EventConsumerException decision guide; fix UUID v4 → generateUuidV7() |
| 6 | `README.md` | Add TOC; update Related Documentation links; add Outbox Usage Guidelines link |
| 7 | `docs/outbox-usage-guidelines.md` | **NEW FILE** — Decision trees, trade-offs, common patterns |
| 8 | `docs/request-reply-guidelines.md` | Add Performance & Reliability Trade-Offs section; fix UUID inconsistencies |

No source code changes. All changes are documentation-only.