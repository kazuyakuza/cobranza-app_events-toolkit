# Cobranza App: Event & Messaging Convention Document

NATS + JetStream Event Standard v1.0

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Subject Naming Convention](#2-subject-naming-convention-natsjetstream)
  - [Global Subject Format](#global-subject-format)
  - [2.1 Response Subject Naming Convention](#21-response-subject-naming-convention)
  - [2.2 Platform Event Subjects](#22-platform-event-subjects)
- [3. Event Envelope (Payload Structure)](#3-event-envelope-payload-structure)
  - [3.1 Tenant Event Envelope](#31-tenant-event-envelope)
  - [3.2 Global Event Envelope](#32-global-event-envelope)
- [4. Good Practices](#4-good-practices)
- [5. Actor Types](#5-actor-types-enum)

> **Onboarding:** This document covers **step 1 (Architecture)** and **step 3 (Event DTO / Envelope)** of the [Onboarding Flow](../README.md#onboarding-flow).

## 1. Purpose

This document defines the standard for **event naming**, **message envelope**, and **messaging patterns** used across all microservices in the Cobranza App platform.

The goal is to ensure:

- Strong tenant isolation
- Excellent observability and auditability
- Consistent naming and structure
- Support for both event-driven and request-reply patterns
- Future-proof design

## 2. Subject Naming Convention (NATS/JetStream)

**Format:**

```text
company.{company_id}.{domain}.{entity}.{action}.v{version}
```

### Rules

- `company_id`: UUID of the Company. **Recommended**: Use the UUID **without dashes** (`550e8400e29b41d4a716446655440000`) for cleaner subjects and better compatibility.
- `domain`: High-level business domain (e.g. `debt`, `payment`, `client`, `company`, `notification`, `bank`, `resume`).
- `entity`: The main entity involved (e.g. `proof`, `statement`, `schedule`, `attempt`).
- `action`: Verb in **past tense**: `created`, `updated`, `deleted`, `uploaded`, `processed`, `approved`, `rejected`, `sent`, `matched`, `generated`, etc.
- `version`: `v1`, `v2`, etc. (major version only).

### Examples

- `company.550e8400e29b41d4a716446655440000.debt.created.v1`
- `company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1`
- `company.550e8400e29b41d4a716446655440000.bank.statement.processed.v1`
- `company.550e8400e29b41d4a716446655440000.notification.sent.v1`
- `company.550e8400e29b41d4a716446655440000.client.updated.v1`

### Global Subject Format

For tenant-less operations (e.g., creating cross-tenant entities like `company`, `user`, `role`, or system-wide configuration changes), the global subject format omits the `company_id` segment:

**Format:**

```text
global.{domain}.{entity}.{action}.v{version}
```

**Rules:**

- `domain`: Business domain (e.g., `iam`, `system`, `config`).
- `entity`: The main entity involved (e.g., `company`, `user`, `role`).
- `action`: Verb in **past tense** (same rules as tenant subjects).
- `version`: `v1`, `v2`, etc. (major version only).

**Examples:**

- `global.iam.company.created.v1`
- `global.iam.user.updated.v1`
- `global.config.feature-flag.toggled.v1`

Use `SubjectBuilder.buildGlobal()` or `buildGlobalSubject()` to construct global subjects — never concatenate strings manually.

> **Decision guide:** For help choosing between tenant and global envelopes, see [Global Events — When to Use Tenant vs Global Envelopes](global-events.md).

> **Platform subjects** follow a different pattern (`platform.service.{action}.v{version}`) and are not tenant-isolated. See [Section 2.2](#22-platform-event-subjects) for details.

### 2.1 Response Subject Naming Convention

When a service responds to a request event, the response subject can follow either of two conventions:

#### Preferred: Descriptive Past-Tense Action

Use a distinct past-tense action that describes the **outcome** of the request. This treats the response as a first-class event.

- Request:  `company.{id}.debt.schedule.calculate.v1`
- Response: `company.{id}.debt.schedule.calculated.v1`

This approach is preferred because:
- Response subjects are discoverable and self-documenting.
- No special parsing is needed — the subject follows the same format as any event.
- Works with standard `@OnEvent()` handlers without special routing.

To build a preferred response subject, use `SubjectBuilder.build()` or `buildSubject()` with the appropriate action:

```ts
const responseSubject = buildSubject({
  companyId,
  domain: 'debt',
  entity: 'schedule',
  action: 'calculated',  // past-tense outcome of "calculate"
  version: '1',
});
```

#### Alternative: `.response` Suffix

Append `.response` to the request's action segment. This is useful for programmatic derivation of response subjects.

- Request:  `company.{id}.debt.schedule.calculate.v1`
- Response: `company.{id}.debt.schedule.calculate.response.v1`

To build an alternative response subject, use `buildResponseSubject()`:

```ts
import { buildResponseSubject } from '@cobranza-apps/events-toolkit';

const requestSubject = 'company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.v1';
const responseSubject = buildResponseSubject(requestSubject);
// => 'company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.response.v1'
```

**Trade-offs**:

| Aspect | Preferred (Past-Tense) | Alternative (`.response`) |
|--------|------------------------|--------------------------|
| Discoverability | High — each response is a distinct event type | Lower — `.response` subjects are derived |
| Programmatic derivation | Manual — choose the action name | Automatic — use `buildResponseSubject()` |
| Handler routing | Standard `@OnEvent()` | Standard `@OnEvent()` with `.response` action |
| Subject parsing | Standard format | Requires awareness of `.response` suffix |

> **Rule of thumb**: Use the preferred convention when the response has a distinct semantic meaning (e.g., `calculated`, `approved`, `rejected`). Use the alternative when the response is purely a reply to the request with no distinct outcome verb.

### 2.2 Platform Event Subjects

Platform events use a special `platform.*` namespace for service discovery infrastructure. These subjects do **not** follow the tenant-isolated `company.{company_id}.*` format because they are system-level concerns, not tenant-specific business events.

| Subject | Type | Description |
|---------|------|-------------|
| `platform.service.register.v1` | Event | Service instance registered its manifest |
| `platform.service.heartbeat.v1` | Event | Periodic liveness signal from a service instance |
| `platform.service.shutdown.v1` | Event | Service instance is shutting down gracefully |

**Key differences from domain subjects:**

- No `company_id` segment — platform events are global, not tenant-scoped.
- The `company_id` field in the envelope uses the nil UUID `00000000-0000-0000-0000-000000000000`.
- The `actor_type` is always `system` and `actor_id` is `platform-discovery`.

For full details, see [Event Discovery & Service Registry](event-discovery-and-service-registry.md).

## 3. Event Envelope (Payload Structure)

### 3.1 Tenant Event Envelope

All tenant-scoped messages published to JetStream **must** follow this JSON structure:

```json
{
  "id": "evt_01JXYZABC123456789012345",
  "type": "payment.proof.uploaded",
  "version": "1.0.0",

  "produced_at": "2025-06-08T16:45:12.345Z",
  "producer": "payment-service",

  // === Tenant & Actor Context ===
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "actor_type": "client",
  "actor_id": "clt_123e4567-e89b-12d3-a456-426614174000",

  // === Tracing & Correlation ===
  "correlation_id": "req_987fcdeb-51a2-43e8-9c4f-123456789abc",
  "causation_id": "evt_01JXYZABC987654321098765",
  "trace_id": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",

  // === Request-Reply (optional) ===
  "reply_to": "company.550e8400e29b...payment.proof.uploaded.response.v1",

  // === Business Payload ===
  "data": {
    // Domain-specific data goes here
  }
}
```

### 3.2 Global Event Envelope

For tenant-less operations, the global event envelope has the **same structure** as the tenant envelope but **omits `company_id`**:

```json
{
  "id": "evt_01JXYZABC123456789012345",
  "type": "iam.company.created",
  "version": "1.0.0",

  "produced_at": "2025-06-08T16:45:12.345Z",
  "producer": "iam-service",

  // === Actor Context (no company_id) ===
  "actor_type": "system",

  // === Tracing & Correlation ===
  "correlation_id": "req_987fcdeb-51a2-43e8-9c4f-123456789abc",
  "trace_id": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",

  // === Business Payload ===
  "data": {
    // Domain-specific data goes here
  }
}
```

> **Note:** `company_id` is omitted entirely for global events — do NOT use a placeholder UUID. Use `GlobalEventEnvelope` / `GlobalEventBase` classes and `createGlobalEvent()` factory to ensure the field is absent.

### Field Details

| Field              | Required | Description |
|--------------------|----------|-----------|
| `id`               | Yes      | Unique event ID. Use UUIDv7. Prefix `evt_` recommended. |
| `type`             | Yes      | Same as the action part of the subject (without company prefix) |
| `version`          | Yes      | Schema version of this event |
| `produced_at`      | Yes      | ISO 8601 UTC timestamp with milliseconds |
| `producer`         | Yes      | Microservice name (kebab-case) |
| `company_id`       | Yes (tenant) / Omitted (global) | Present in tenant envelopes for tenant isolation; absent in global envelopes |
| `actor_type`       | Yes      | Who performed the action. See [Actor Types](#5-actor-types) |
| `actor_id`         | Conditional | Required for `client` and `company_user`; optional for `system`, `scheduler`, `external_api` |
| `correlation_id`   | Yes      | Same across the entire request / transaction chain |
| `causation_id`     | No       | ID of the event that triggered this one |
| `trace_id`         | Recommended | OpenTelemetry trace ID |
| `reply_to`         | No       | Subject for async response |
| `data`             | Yes      | Actual business payload |

## 4. Good Practices

### 4.1 Decorator Signature Convention

The toolkit provides three event decorators that accept the event type as a **string first argument**, followed by a **required** options object:

```typescript
@EmitEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Proof was uploaded',
  payloadExample: { proofId: 'uuid', amount: 100 },
})
@OnEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Handles uploaded payment proofs',
  payloadExample: { proofId: 'uuid', amount: 100 },
  tags: ['proof'],
})
@OnRequestReply('credit.check.completed', {
  description: 'Handles credit check completion responses',
  payloadExample: { checkId: 'uuid', approved: true },
  companyId: '550e8400-e29b-41d4-a716-446655440000',
})
```

The options object supports rich metadata for discovery manifests:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `string` | **Yes** for `@EmitEvent` and `@OnEvent` (not applicable to `@OnRequestReply`) | Major version string (e.g., `'1'`) |
| `description` | `string` | **Yes** | Human-readable description; appears in the service manifest |
| `payloadExample` | `Record<string, unknown>` | **Yes** | Example payload object for documentation in discovery manifests |
| `tags` | `string[]` | No (defaults to `[]`) | Arbitrary categorization tags |
| `payloadSchemaRef` | `string` | No (auto-resolved from reflect metadata) | Explicit payload schema class name |
| `companyId` | `string` | No (`@OnRequestReply` only) | Tenant filter for responses |

> **Breaking change (v0.8.0):** `version` (where applicable), `description`, and `payloadExample` are now **required**. Previously they were optional with fallback defaults in `ManifestEntryBuilder` (`?? '1'` for `version`, `?? ''` for `description`). Those fallbacks have been removed because the type system now guarantees presence. The `tags` fallback (`?? []`) is preserved because `tags` remains optional.

The old object-based signature (`@OnEvent({ domain, entity, action })`) has been replaced by the string-first-arg format shown above.

### 4.2 Idempotency & Deduplication

- All consumers **must** be idempotent.
- Use `id` + `correlation_id` combination to detect and ignore duplicates via `IdempotencyService` or `@OnEvent({ idempotent: true })`.
- Leverage JetStream `dedupe_window` when appropriate.
- For full documentation, configuration, and examples, see the [Idempotency guide](idempotency.md).

### 4.3 Request-Reply Patterns

The toolkit supports two request-reply patterns over NATS JetStream:

#### Sync Request-Reply (`request()`)

- The caller sends a request and **blocks** until a response arrives or a timeout expires.
- Uses NATS built-in request-reply mechanism.
- Best for short-lived, simple flows where the response is needed immediately.
- Configure timeout via `RequestReplyConfig.defaultTimeoutMs` (default: 5000 ms) or per-call `timeoutMs`.

**Subject convention:**

- Request subject: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
- NATS automatically creates a temporary inbox for the reply.

#### Async Request-Reply (`sendRequest()` + `@OnRequestReply`)

- The caller sends a request with a `reply_to` subject and **does not block**.
- The responder processes the request and publishes a response to the `reply_to` subject.
- The caller receives the response via `@OnRequestReply()` handler when it arrives.

**Response naming convention:**

See [Section 2.1](#21-response-subject-naming-convention) for the full convention specification.

Quick reference:
- **Preferred**: Use a descriptive past-tense action (e.g., `calculated` for a `calculate` request).
- **Alternative**: Use `buildResponseSubject(requestSubject)` to derive the `.response` suffix automatically.

**Flow:**

1. Publisher includes `reply_to` in the event envelope.
2. Consumer processes and publishes a response to the `reply_to` subject.
3. Response envelope follows the same structure, with `type` ending in `.response` or `.completed`.
4. The `correlation_id` is preserved across request and response for traceability.

For detailed examples, correlation ID management, timeout handling, and idempotency requirements, see [Request-Reply Patterns](request-reply-patterns.md).

### 4.4 Dead Letter Queue (DLQ)

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
await nc.jetStreamManager.streams.add({
  name: 'DLQ',
  subjects: ['dlq.>'],
  retention: 'limits',
  max_age: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days in nanoseconds
  max_msgs_per_subject: 100_000,
  storage: 'file',
  dedupe_window: 2 * 60 * 1_000_000_000, // 2 minutes in nanoseconds
});
```

### 4.5 Additional Recommendations

- Publish events **after** successful database transaction (Outbox Pattern).
- Keep events small (< 256KB ideally).
- Prefer references (IDs) over full objects in `data`.
- Log all published and consumed events in development.
- Use the base validator from `events-toolkit` (based on `class-validator`).

## 5. Actor Types (Enum)

```typescript
enum ActorType {
  CLIENT = "client",
  COMPANY_USER = "company_user",
  SYSTEM = "system",
  SCHEDULER = "scheduler",
  EXTERNAL_API = "external_api",
}
```

### `actor_id` Requirements

| Actor Type | `actor_id` Required? | Notes |
|------------|----------------------|-------|
| `client` | **Yes** | Must be a non-empty string identifying the client |
| `company_user` | **Yes** | Must be a non-empty string identifying the user |
| `system` | No | Automated system processes; `actor_id` may be omitted |
| `scheduler` | No | Scheduled/cron jobs; `actor_id` may be omitted |
| `external_api` | No | Third-party integrations; `actor_id` may be omitted |

> **Validation:** The toolkit enforces this conditionally via `@IsOptionalForSystemActors()`. Human actors (`client`, `company_user`) always require `actor_id`; automated actors (`system`, `scheduler`, `external_api`) may omit it.
