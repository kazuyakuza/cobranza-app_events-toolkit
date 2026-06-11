# Cobranza App: Event & Messaging Convention Document

NATS + JetStream Event Standard v1.0

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

**For Request → Async Response pattern:**

Use `.response` suffix on the same base subject:

- Request: `company.{company_id}.payment.proof.uploaded.v1`
- Response: `company.{company_id}.payment.proof.uploaded.response.v1`

## 3. Event Envelope (Payload Structure)

All messages published to JetStream **must** follow this JSON structure:

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

### Field Details

| Field              | Required | Description |
|--------------------|----------|-----------|
| `id`               | Yes      | Unique event ID. Use UUIDv7. Prefix `evt_` recommended. |
| `type`             | Yes      | Same as the action part of the subject (without company prefix) |
| `version`          | Yes      | Schema version of this event |
| `produced_at`      | Yes      | ISO 8601 UTC timestamp with milliseconds |
| `producer`         | Yes      | Microservice name (kebab-case) |
| `company_id`       | Yes      | Always present - critical for tenant isolation |
| `actor_type`       | Yes      | Who performed the action. See [Actor Types](#5-actor-types) |
| `actor_id`         | Yes      | ID of the actor (`user_id`, `client_id`, etc.) |
| `correlation_id`   | Yes      | Same across the entire request / transaction chain |
| `causation_id`     | No       | ID of the event that triggered this one |
| `trace_id`         | Recommended | OpenTelemetry trace ID |
| `reply_to`         | No       | Subject for async response |
| `data`             | Yes      | Actual business payload |

## 4. Good Practices

### 4.1 Idempotency & Deduplication

- All consumers **must** be idempotent.
- Use `id` + `correlation_id` combination to detect and ignore duplicates.
- Leverage JetStream `dedupe_window` when appropriate.

### 4.2 Request → Async Response Pattern

1. Publisher includes `reply_to` in the envelope.
2. Consumer processes and publishes response to the `reply_to` subject.
3. Response envelope follows the same structure, with `type` ending in `.response` or `.completed`.

### 4.3 Dead Letter Queue (DLQ)

- Recommended subject pattern: `dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}`
- Consumers should forward failed messages (after max retries) to the DLQ.

### 4.4 Additional Recommendations

- Publish events **after** successful database transaction (Outbox Pattern).
- Keep events small (< 256KB ideally).
- Prefer references (IDs) over full objects in `data`.
- Log all published and consumed events in development.
- Use the base validator from `events-toolkit` (based on `class-validator`).

## 5. Actor Types (Enum)

```ts
"client"
"company_user"
"system"
"scheduler"
"external_api"
```
