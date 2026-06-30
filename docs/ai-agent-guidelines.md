# Guidelines for AI Agents & Developers

## Overview

This guide provides step-by-step instructions for creating and consuming events using events-toolkit, targeting both human developers and AI agents generating code.

> **Onboarding:** This document condenses **steps 3–7** (DTO → Produce → Consume → Request-Reply → Outbox) of the [Onboarding Flow](../README.md#onboarding-flow).

For the full convention specification, see [`event-messaging-convention.md`](event-messaging-convention.md).

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

## Quick Reference: Convention Rules

| Rule | Detail |
| ---- | ------ |
| Subject format | `company.{company_id}.{domain}.{entity}.{action}.v{version}` |
| Event IDs | UUIDv7 with `evt_` prefix via `generateEventId()` |
| Actions | Past tense only: `created`, `uploaded`, `processed`, `sent` |
| Version | Major only: `v1`, `v2` |
| Payloads | IDs over full objects; keep under 256KB |
| Consumers | MUST be idempotent |
| Actor context | `actor_type` and `actor_id` always required |
| Tenant isolation | `company_id` mandatory in every envelope |

## Step-by-Step: Creating a New Event Class

### 1. Define the data class

Use `class-validator` decorators on every field:

```typescript
import { IsUUID, IsString, IsNumber, IsEnum } from 'class-validator';

class PaymentProofUploadedData {
  @IsUUID()
  paymentAttemptId: string;

  @IsString()
  fileUrl: string;

  @IsNumber()
  amount: number;

  @IsEnum(Currency)
  currency: Currency;
}
```

### 2. Extend EventEnvelope

```typescript
import { EventEnvelope } from '@cobranza-apps/events-toolkit';

class PaymentProofUploadedEvent extends EventEnvelope<PaymentProofUploadedData> {
  readonly type = 'payment.proof.uploaded';
  readonly version = '1.0.0';
}
```

### 3. Construct with context

```typescript
import { createEvent } from '@cobranza-apps/events-toolkit';

const event = createEvent(data, {
  type: 'payment.proof.uploaded',
  version: '1.0.0',
  producer: 'payment-service',
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  actorType: ActorType.CLIENT,
  actorId: 'clt_123e4567-e89b-12d3-a456-426614174000',
  correlationId: '987fcdeb-51a2-43e8-9c4f-123456789abc',
});
```

## Step-by-Step: Naming New Events

Follow this decision tree:

1. **Choose domain** — `payment`, `debt`, `bank`, `notification`, `client`, `company`
2. **Choose entity** — `proof`, `statement`, `schedule`, `attempt`
3. **Choose action** — past tense only (`uploaded`, not `upload`)
4. **Check existing events** — ensure no duplicate subject pattern exists in the same domain
5. **Register the subject** — use `SubjectBuilder.build()` with the chosen tokens

Example decision:

```
Domain: payment → Entity: proof → Action: uploaded → Subject: company.{id}.payment.proof.uploaded.v1
```

## Step-by-Step: Publishing Events

### Option 1 — Decorator-based (`@EmitEvent()`)

```typescript
import { EmitEvent, SubjectBuilder, EventContext } from '@cobranza-apps/events-toolkit';

class PaymentController {
  constructor(private readonly subjectBuilder: SubjectBuilder) {}

  @EmitEvent('payment.proof.uploaded', {
    version: '1',
    description: 'A payment proof file was uploaded',
    payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
  })
  async handleUpload(dto: UploadDto, context: EventContext): Promise<PaymentProofUploadedData> {
    return new PaymentProofUploadedData({ paymentAttemptId, fileUrl, amount });
  }
}
```

### Option 2 — Direct service injection

```typescript
import { createEvent, ProducerService, SubjectBuilder } from '@cobranza-apps/events-toolkit';

class PaymentService {
  constructor(
    private readonly producerService: ProducerService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async processUpload(data: PaymentProofUploadedData, context: EventContext): Promise<void> {
    const subject = this.subjectBuilder.build({
      companyId: context.companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '1',
    });
    const event = createEvent(data, context);
    await this.producerService.publish(subject, event);
  }
}
```

## Step-by-Step: Consuming Events

```typescript
import { OnEvent, EventEnvelope } from '@cobranza-apps/events-toolkit';

class PaymentProofConsumer {
  @OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Handles payment proof upload events',
    payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
  })
  async onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>): Promise<void> {
    const { data, company_id, correlation_id } = event;
    await this.processProof(data);
  }
}

For business errors that should route to DLQ:

```typescript
import { EventConsumerException } from '@cobranza-apps/events-toolkit';

@OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Handles payment proof upload events',
    payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
  })
async onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>): Promise<void> {
  if (event.data.amount <= 0) {
    throw new EventConsumerException({
      message: 'Invalid amount',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlation_id,
    });
  }
}
```

## Step-by-Step: Using the Outbox

The outbox provides transactional safety — events are persisted before publishing:

```typescript
import { createEvent, OutboxService, SubjectBuilder } from '@cobranza-apps/events-toolkit';

class PaymentService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async processWithOutbox(data: PaymentProofUploadedData, context: EventContext): Promise<void> {
    const subject = this.subjectBuilder.build({
      companyId: context.companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '1',
    });
    const event = createEvent(data, context);
    await this.outboxService.saveToOutbox(event, subject);
  }
}
```

For outbox backend configuration (SQLite vs Postgres), see [`outbox-configuration.md`](outbox-configuration.md).

## Request-Reply Guidelines

For the full decision-making guide, see [`request-reply-guidelines.md`](request-reply-guidelines.md).

### Quick Decision: Sync vs Async

- **Use `request()`** when the caller needs the result immediately and the responder can reply within seconds.
- **Use `sendRequest()` + `@OnRequestReply`** when the operation is long-running, the caller should not block, or the response involves multiple services.

### Rules for AI Agents

1. Always use `SubjectBuilder.build()` or `buildSubject()` for request subjects — never concatenate strings.
2. Response subjects: prefer descriptive past-tense action (e.g., `calculated`). Use `buildResponseSubject()` only when no distinct outcome verb exists.
3. Generate `correlation_id` using `generateUuidV7()` once per transaction chain. Preserve it in responses via `buildResponseEnvelope()`. Note: the `@IsUUID('4')` validator accepts both UUIDv4 and UUIDv7 strings.
4. Set `reply_to` only for async request-reply. Never set it for fire-and-forget events.
5. All request-reply handlers MUST be idempotent. Use `correlation_id` for deduplication.
6. For async request-reply with durability requirements, use `sendRequestThroughOutbox()` — do not use `saveToOutbox()` for request-reply events.
7. Sync pattern: catch `RequestReplyException` for timeout/error handling. Override timeout with `timeoutMs`.
8. Async pattern: implement application-level timeout (SAGA, deadline event, or DB tracking). Never leave requests without a timeout.

### Naming Checklist for Request-Reply Events

- [ ] Request subject: `company.{id}.{domain}.{entity}.{action}.v{version}`
- [ ] Response subject: descriptive past-tense OR `.response` suffix
- [ ] `correlation_id`: Use `generateUuidV7()`, generated once, preserved across chain
- [ ] `type`: matches `domain.entity.action` in request and response envelopes
- [ ] `reply_to`: set on request only, not on fire-and-forget
- [ ] Data classes: `class-validator` decorators on every field
- [ ] Response handler: `@OnRequestReply` or `@OnEvent` with correct subject

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

## Onboarding Step Links

| Step | Topic | Key Resources |
|------|-------|---------------|
| 1 | **Architecture** — NATS, JetStream, envelope, actors | [Core Concepts](../README.md#core-concepts) · [Architecture](../.agent/project-info/architecture.md) |
| 2 | **Install & configure** — `EventsToolkitModule.forRoot()` | [Installation](../README.md#installation) · [Setup](../README.md#setup-unified-module) |
| 3 | **Define an event DTO** — `EventEnvelope<T>` + `class-validator` | [Defining an Event](../README.md#defining-an-event) |
| 4 | **Produce an event** — `@EmitEvent()` · `ProducerService` | [Producer](../README.md#producer-publishing-events) · This guide §Publishing |
| 5 | **Consume an event** — `@OnEvent()` · DLQ routing | [Consumer](../README.md#consumer-subscribing-to-events) · This guide §Consuming |
| 6 | **Request-reply** — `request()` / `sendRequest()` + `@OnRequestReply()` | [Request-Reply Patterns](request-reply-patterns.md) · [Guidelines](request-reply-guidelines.md) |
| 7 | **Outbox pattern** — `OutboxService.saveToOutbox()` · `sendAsyncRequestThroughOutbox()` | [Outbox Configuration](outbox-configuration.md) · [Usage Guidelines](outbox-usage-guidelines.md) |
| 8 | **Service discovery** — manifests · `GET /discovery/manifest` | [Discovery & Service Registry](event-discovery-and-service-registry.md) |
| 9 | **Schema generation** — auto JSON Schema from DTOs | [Discovery & Service Registry](event-discovery-and-service-registry.md) |
| 10 | **Testing** — `EventsToolkitTestModule` · mocks · assertions | [Testing Utilities](testing-utilities.md) |
| 11 | **Deployment** — JetStream streams · env vars · health checks | [Deployment](../README.md#deployment) |

## Validation Checklist

Before submitting event-related code, verify:

- [ ] Data class has `@IsUUID`, `@IsString`, `@IsNumber`, etc. on every field
- [ ] Event class extends `EventEnvelope<T>`
- [ ] `type` follows the `domain.entity.action` pattern
- [ ] `version` is a string like `'1.0.0'`
- [ ] `company_id` is always provided in context
- [ ] `actor_type` and `actor_id` are always provided
- [ ] Subject is built with `SubjectBuilder.build()` — never string concatenation

## Common Mistakes

| # | Mistake | Fix |
|---|---------|-----|
| 1 | Manual subject concatenation | Use `SubjectBuilder.build()` |
| 2 | Present-tense verbs for actions | Use past tense: `uploaded`, not `upload` |
| 3 | Forgetting actor context | Always include `actorType` and `actorId` in `EventContext` |
| 4 | Non-idempotent consumers | Design handlers to safely process duplicate messages |
| 5 | Storing full objects instead of IDs | Keep payloads under 256KB; reference IDs |
| 6 | Missing `@IsUUID` on ID fields | Decorate all UUID fields with `@IsUUID()` |
| 7 | Events exceeding 256KB | Keep payloads lean — use IDs, not full entities |

## Public API Quick Reference

| Concern | Exports |
| ------- | ------- |
| Envelope | `EventEnvelope`, `EventBase`, `ActorType`, `EventContext` |
| Subject | `SubjectBuilder`, `buildSubject`, `BuildSubjectDto` |
| ID | `generateEventId`, `generateUuidV7` |
| Producer | `ProducerModule`, `ProducerService`, `@EmitEvent()` |
| Consumer | `ConsumerModule`, `@OnEvent()`, `EventConsumerException` |
| Request-Reply | `RequestReplyService`, `@OnRequestReply()` |
| Outbox | `OutboxModule`, `OutboxService`, `OutboxModuleOptions`, `EntityManagerLike` |
| Unified | `EventsToolkitModule`, `EventsToolkitModuleOptions` |
| Logging | `EventLoggerService` |
| Errors | `EventConsumerException`, `RequestReplyException` |

---

### See Also

- [Outbox Configuration](outbox-configuration.md) — SQLite vs Postgres setup, service options
- [Outbox Usage Guidelines](outbox-usage-guidelines.md) — Decision trees for outbox backend
- [Transactional Outbox Usage](outbox-transactional-usage.md) — TypeORM transaction examples
- [Testing Utilities](testing-utilities.md) — Mock services, test module, assertion helpers
- [Event Discovery & Service Registry](event-discovery-and-service-registry.md) — Service manifest, schema generation
- [Request-Reply Patterns](request-reply-patterns.md) — Full async + sync pattern documentation