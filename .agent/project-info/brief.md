# BRIEF – `cobranza-apps/events-toolkit`

## 1. Purpose

The `events-toolkit` is a shared NestJS library that provides a standardized, consistent, and production-ready way to work with **NATS + JetStream** across all microservices in the Cobranza App platform.

It enforces the rules defined in the [Event & Messaging Convention Document](../../docs/event-messaging-convention.md) and reduces boilerplate while increasing reliability, observability, and developer experience.

## 2. Objectives

- Centralize the implementation of the event standard
- Provide strong typing and validation using `class-validator`
- Separate concerns (`Producer`, `Consumer`, `Request-Reply`, etc.)
- Support both **fire-and-forget** events and **Request → Async Response** patterns
- Include lightweight **SQLite Outbox** support for other microservices
- Make it easy for developers and AI agents to follow conventions
- Minimize coupling with domain payloads (each MS defines its own events)

## 3. Technical Decisions

- **Framework**: NestJS (Modules, Providers, Decorators, Injectable)
- **Validation**: `class-validator` + `class-transformer`
- **Event ID**: UUIDv7 (via `uuid` library)
- **Logging**: Winston integration
- **NATS/JetStream**: Official `@nestjs/microservices` + `nats` package as peer/dependency
- **Outbox**: Lightweight SQLite (file-based, persistent) for non-db-gateway services
- **No domain payloads**: Only base envelope and utilities

## 4. Folder Structure

```bash
cobranza-apps/events-toolkit/
├── README.md
├── docs/
│   └── event-messaging-convention.md
├── src/
│   ├── index.ts
│   ├── common/
│   │   ├── constants.ts
│   │   ├── envelope/
│   │   │   ├── event-envelope.class.ts
│   │   │   ├── actor-type.enum.ts
│   │   │   ├── event-base.class.ts
│   │   │   └── validators/
│   │   ├── dto/
│   │   │   └── build-subject.dto.ts
│   │   ├── utils/
│   │   │   ├── subject.builder.ts
│   │   │   ├── uuid.utils.ts
│   │   │   └── date.utils.ts
│   │   └── errors/
│   │       ├── event-consumer.exception.ts
│   │       └── index.ts
│   ├── producer/
│   │   ├── producer.module.ts
│   │   ├── producer.service.ts
│   │   └── decorators/
│   │       └── emit-event.decorator.ts
│   ├── consumer/
│   │   ├── consumer.module.ts
│   │   ├── consumer.service.ts
│   │   ├── jetstream-consumer.service.ts
│   │   └── decorators/
│   │       └── on-event.decorator.ts
│   ├── request-reply/
│   │   ├── request-reply.service.ts
│   │   └── request-reply.types.ts
│   ├── outbox/
│   │   ├── sqlite-outbox.service.ts
│   │   └── outbox.entity.ts
│   └── logging/
│       └── event-logger.service.ts
├── package.json
└── tsconfig.json
```

## 5. Main Modules & Usage

### ProducerModule

- `ProducerService` → `publish(event)` and `emit<T>(type, data, context)`
- `@EmitEvent()` decorator

### ConsumerModule

- `ConsumerService` + `JetStreamConsumerService`
- `@OnEvent()` decorator for easy handler registration
- Automatic validation + error handling with `EventConsumerException`

### RequestReplyService

- Helpers for async request → response pattern

### OutboxModule

- SQLite-based outbox with background processor

## 6. Core Components

- `EventEnvelope<T>`: Base class with validation
- `ActorType`: enum
- `BuildSubjectDto`: Parameter class for subject building
- `SubjectBuilder.build(subjectDto: BuildSubjectDto)`
- `createEvent<T>(options)`: factory
- `EventConsumerException`: specific error for consumers to throw (triggers DLQ routing)
- Event Logger with Winston

## 7. Subject Builder

```ts
// src/common/dto/build-subject.dto.ts
export class BuildSubjectDto {
  @IsUUID()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsString()
  @IsNotEmpty()
  entity: string;

  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsNotEmpty()
  version: string = '1';
}
```

**Usage:**

```ts
const subject = subjectBuilder.build({
  companyId,
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded',
  version: '1'
});
```

Or using with helper function:

```ts
const subject = buildSubject({
  companyId: sanitizedCompanyId,
  domain: 'debt',
  entity: 'schedule',
  action: 'generated',
  version: '1'
});
```

## 8. Example Usage (in a Microservice)

```ts
// payment-service/src/events/payment-proof-uploaded.event.ts
export class PaymentProofUploadedData {
  @IsUUID()
  paymentAttemptId: string;

  @IsUrl()
  fileUrl: string;

  @IsNumber()
  amount: number;

  @IsEnum(Currency)
  currency: string;
}

export class PaymentProofUploadedEvent extends EventEnvelope<PaymentProofUploadedData> {
  readonly type = 'payment.proof.uploaded';
  readonly version = '1.0.0';
}
```

```ts
// In a controller or service
const subject = buildSubject({ companyId, domain: 'payment', entity: 'proof', action: 'uploaded', version: '1' });
await this.producerService.publish(subject, new PaymentProofUploadedEvent(data, context));
```

## 9. Outbox Strategy

- `ms-db-gateway`: Uses main PostgreSQL Outbox table
- Other microservices: Use `SqliteOutboxService` (persistent file in Docker volume)
- The toolkit provides unified interface: `saveToOutbox(event)` + background processor

## 10. Documentation & Developer Experience

- Full `event-messaging-convention.md`
- Detailed README with installation, setup, and examples
- JSDoc on all public classes/methods
- Section **"Guidelines for AI Agents"** with rules for naming new events

---
---

<!-- DO NOT DELETE NEXT SECTION -->

Important Note for AI Agents

All agents working on this project MUST adhere to the workflows and rules outlined in [AI Agent Onboarding document](../../AGENTS.md).

Before starting any task:

1. **Review `AGENTS.md`**: is the primary source of instructions for agents.
2. **Follow Workflows**: follow the procedures defined in `.agent/WORKFLOWS.md`, especially the `.kilo/commands/critical-workflow.md`.

<!-- END DO NOT DELETE -->
