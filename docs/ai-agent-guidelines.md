# Guidelines for AI Agents & Developers

## Overview

This guide provides step-by-step instructions for creating and consuming events using events-toolkit, targeting both human developers and AI agents generating code.

For the full convention specification, see [`event-messaging-convention.md`](event-messaging-convention.md).

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
const event = new PaymentProofUploadedEvent(data, {
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  actorType: ActorType.CLIENT,
  actorId: 'clt_123e4567-e89b-12d3-a456-426614174000',
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
import { EmitEvent, SubjectBuilder } from '@cobranza-apps/events-toolkit';

class PaymentController {
  constructor(private readonly subjectBuilder: SubjectBuilder) {}

  @EmitEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
  async handleUpload(dto: UploadDto, context: EventContext): Promise<PaymentProofUploadedEvent> {
    return new PaymentProofUploadedEvent(
      new PaymentProofUploadedData({ paymentAttemptId, fileUrl, amount }),
      context,
    );
  }
}
```

### Option 2 — Direct service injection

```typescript
import { ProducerService, SubjectBuilder } from '@cobranza-apps/events-toolkit';

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
    const event = new PaymentProofUploadedEvent(data, context);
    await this.producerService.publish(subject, event);
  }
}
```

## Step-by-Step: Consuming Events

```typescript
import { OnEvent, EventEnvelope } from '@cobranza-apps/events-toolkit';

class PaymentProofConsumer {
  @OnEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
  async onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>): Promise<void> {
    const { data, company_id, correlation_id } = event;
    await this.processProof(data);
  }
}
```

For business errors that should route to DLQ:

```typescript
import { EventConsumerException } from '@cobranza-apps/events-toolkit';

@OnEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
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
import { OutboxService, SubjectBuilder } from '@cobranza-apps/events-toolkit';

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
    const event = new PaymentProofUploadedEvent(data, context);
    await this.outboxService.saveToOutbox(event, subject);
  }
}
```

For outbox backend configuration (SQLite vs Postgres), see [`outbox-configuration.md`](outbox-configuration.md).

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
| Request-Reply | `RequestReplyService` |
| Outbox | `OutboxModule`, `OutboxService`, `OutboxModuleOptions`, `EntityManagerLike` |
| Unified | `EventsToolkitModule`, `EventsToolkitModuleOptions` |
| Logging | `EventLoggerService` |
| Errors | `EventConsumerException`, `RequestReplyException` |