# BRIEF — events-toolkit

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
├── CHANGELOG.md
├── docs/
│   ├── event-messaging-convention.md
│   ├── ai-agent-guidelines.md
│   ├── request-reply-patterns.md
│   ├── request-reply-guidelines.md
│   ├── outbox-configuration.md
│   ├── outbox-usage-guidelines.md
│   ├── outbox-transactional-usage.md
│   ├── event-discovery-and-service-registry.md
│   ├── testing-utilities.md
│   └── examples/                          # Runnable code samples
├── src/
│   ├── index.ts                           # Public API barrel
│   ├── events-toolkit.module.ts           # Unified DynamicModule
│   ├── events-toolkit-options.interface.ts
│   ├── common/
│   │   ├── constants.ts
│   │   ├── envelope/
│   │   │   ├── base-event-envelope.class.ts   # Shared envelope fields
│   │   │   ├── event-envelope.class.ts         # Tenant envelope (company_id required)
│   │   │   ├── global-event-envelope.class.ts # Global envelope (no company_id)
│   │   │   ├── event-base.class.ts            # Abstract EventBase (tenant)
│   │   │   ├── global-event-base.class.ts     # Abstract GlobalEventBase (global)
│   │   │   ├── actor-type.enum.ts
│   │   │   ├── event-scope.enum.ts            # EventScope (TENANT/GLOBAL)
│   │   │   ├── base-event-context.interface.ts
│   │   │   ├── event-context.interface.ts
│   │   │   ├── global-event-context.interface.ts
│   │   │   ├── envelope-types.ts              # Union types + type guards
│   │   │   ├── index.ts
│   │   │   └── validators/                    # @IsOptionalForSystemActors, etc.
│   │   ├── dto/
│   │   │   ├── build-subject.dto.ts         # Tenant subject builder DTO
│   │   │   └── build-global-subject.dto.ts  # Global subject builder DTO
│   │   ├── utils/
│   │   │   ├── subject.builder.ts
│   │   │   ├── event.factory.ts
│   │   │   ├── uuid.utils.ts
│   │   │   ├── date.utils.ts
│   │   │   └── serialization.utils.ts
│   │   └── errors/
│   │       ├── event-consumer.exception.ts
│   │       └── index.ts
│   ├── producer/
│   │   ├── producer.module.ts
│   │   ├── producer.service.ts
│   │   └── decorators/
│   │       ├── emit-event.decorator.ts
│   │       └── index.ts
│   ├── consumer/
│   │   ├── consumer.module.ts
│   │   ├── consumer.service.ts
│   │   ├── jetstream-consumer.service.ts
│   │   ├── request-reply-consumer.service.ts
│   │   ├── request-reply-message-processor.ts
│   │   └── decorators/
│   │       ├── on-event.decorator.ts
│   │       ├── on-request-reply.decorator.ts
│   │       └── index.ts
│   ├── request-reply/
│   │   ├── request-reply.service.ts
│   │   ├── request-reply.types.ts
│   │   ├── request-reply.helpers.ts
│   │   └── index.ts
│   ├── outbox/
│   │   ├── outbox.module.ts
│   │   ├── outbox.service.ts
│   │   ├── sqlite-outbox.repository.ts
│   │   ├── postgres-outbox.repository.ts
│   │   ├── *.ts                          # Types, utils, helpers
│   │   └── index.ts
│   ├── discovery/
│   │   ├── discovery.module.ts
│   │   ├── discovery.service.ts
│   │   ├── discovery.controller.ts
│   │   ├── manifest.service.ts
│   │   ├── manifest-entry.builder.ts
│   │   ├── dto/
│   │   ├── events/
│   │   ├── utils/
│   │   └── index.ts
│   ├── logging/
│   │   ├── event-logger.service.ts
│   │   └── index.ts
│   └── testing/
│       ├── events-toolkit-test.module.ts
│       ├── *.service.ts                  # Mock services
│       ├── assertion.helpers.ts
│       ├── *.interface.ts
│       └── index.ts
├── package.json
└── tsconfig.json
```

## 5. Main Modules & Usage

### EventsToolkitModule (Unified — Recommended)

- `EventsToolkitModule.forRoot(options)` configures all subsystems (NATS, outbox, logging, discovery) in a single call.
- `EventsToolkitModule.forRootAsync(options)` for asynchronous factory-based configuration.

### ProducerModule

- `ProducerService` → `publish(subject, event)` and `emit<T>(type, data, context)`
- `@EmitEvent(eventType, options)` decorator with interceptor for automatic publishing

### ConsumerModule

- `ConsumerService` + `JetStreamConsumerService` + `RequestReplyConsumerService`
- `@OnEvent(eventType, options)` decorator for handler registration
- `@OnRequestReply(eventType, options)` decorator for async response handling
- Automatic validation + error handling with `EventConsumerException`

### RequestReplyService

- Sync (`request()`) and async (`sendRequest()`, `sendResponse()`, `buildResponseEnvelope()`) request → response helpers
- `isRequestReplyMessage()` utility

### OutboxModule

- Unified `OutboxService` with SQLite or PostgreSQL backends
- Background processor with configurable interval, retries, and DLQ routing
- `saveInTransaction()` for PostgreSQL + TypeORM atomic writes
- `sendRequestThroughOutbox()` / `sendAsyncRequestThroughOutbox()` for request-reply flows

### DiscoveryModule

- Automatic service manifest generation from decorator metadata
- `GET /discovery/manifest` and `GET /discovery/schemas` HTTP endpoints
- Platform heartbeat and registration events
- Schema auto-generation from `class-validator` DTOs

## 6. Core Components

- `EventEnvelope<T>`: Base class with validation
- `GlobalEventEnvelope<T>`: Tenant-less envelope variant (no `company_id`); paired with `GlobalEventContext` and `global.*` subjects
- `EventScope`: `TENANT` / `GLOBAL` discriminator for decorator routing
- `ActorType`: enum
- `BuildSubjectDto`: Parameter class for subject building
- `SubjectBuilder.build(subjectDto: BuildSubjectDto)`
- `SubjectBuilder.buildGlobal(subjectDto: BuildGlobalSubjectDto)` + `buildGlobalSubject()` helper
- `createGlobalEvent<T>(options)`: factory for tenant-less events
- `createEvent<T>(options)`: factory
- `@IsOptionalForSystemActors()`: custom validator making `actor_id` optional for `system`/`scheduler`/`external_api`
- `EventConsumerException`: specific error for consumers to throw (triggers DLQ routing)
- `generateUuidV7`: UUIDv7 generation utility
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

### Global Subject Builder

```ts
// src/common/dto/build-global-subject.dto.ts
export class BuildGlobalSubjectDto {
  @IsString() @IsNotEmpty() domain: string;
  @IsString() @IsNotEmpty() entity: string;
  @IsString() @IsNotEmpty() action: string;
  @IsString() @IsNotEmpty() version: string = '1';
}
```

**Usage:**

```ts
const subject = subjectBuilder.buildGlobal({
  domain: 'iam', entity: 'company', action: 'created', version: '1'
});
// => 'global.iam.company.created.v1'
```

Or using the helper function:

```ts
const subject = buildGlobalSubject({ domain: 'iam', entity: 'user', action: 'created', version: '1' });
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

// Using the decorator (auto-publishes on method return)
@EmitEvent('payment.proof.uploaded', {
  version: '1',
  description: 'A payment proof file was uploaded',
  payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
})
async handleUpload(data: UploadDto, context: EventContext): Promise<PaymentProofUploadedEvent> {
  return new PaymentProofUploadedEvent(data, context);
}

// Or using direct service injection
const subject = buildSubject({ companyId, domain: 'payment', entity: 'proof', action: 'uploaded', version: '1' });
const event = createEvent(data, context);
await this.producerService.publish(subject, event);
```

## 9. Outbox Strategy

- `ms-db-gateway`: Uses main PostgreSQL Outbox table via `OutboxService`
- Other microservices: Use `OutboxService` with SQLite backend (persistent file in Docker volume)
- The toolkit provides unified interface: `OutboxService.saveToOutbox(event, subject)` + background processor
- PostgreSQL services can use `OutboxService.saveInTransaction(params)` for atomicity with business writes

## 10. Documentation & Developer Experience

- Full `event-messaging-convention.md`
- Detailed README with installation, setup, and examples
- JSDoc on all public classes/methods
- Section **"Guidelines for AI Agents"** with rules for naming new events

## 11. Related Documentation

- [product.md](product.md) — Problem definition, user experience, and product goals.
- [context.md](context.md) — Current work focus and next steps.
- [architecture.md](architecture.md) — System architecture and module design.
- [tech.md](tech.md) — Technology stack and development setup.
- [event-messaging-convention.md](../../docs/event-messaging-convention.md) — Event & messaging convention standard.
- [global-events.md](../../docs/global-events.md) — When to use tenant vs global envelopes.

---

<!-- DO NOT DELETE NEXT SECTION -->

Important Note for AI Agents

All agents working on this project MUST adhere to the workflows and rules outlined in [AI Agent Onboarding document](../../AGENTS.md).

Before starting any task:

1. **Review `AGENTS.md`**: is the primary source of instructions for agents.
2. **Follow Workflows**: follow the procedures defined in `.agent/WORKFLOWS.md`, especially the `.kilo/commands/critical-workflow.md`.

<!-- END DO NOT DELETE -->
