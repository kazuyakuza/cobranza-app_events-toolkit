# @cobranza-app/events-toolkit

NATS + JetStream event handling library for the Cobranza App microservices platform.

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Unlicense-blue.svg)](LICENSE)

---

## Overview

`events-toolkit` encapsulates all NATS/JetStream event infrastructure concerns into reusable NestJS modules, services, and decorators. It enforces the [Event & Messaging Convention](docs/event-messaging-convention.md) at compile-time and runtime, ensuring every microservice in the platform produces and consumes events consistently.

### What it provides

- **Event Envelope**: Strongly typed `EventEnvelope<T>` extending abstract `EventBase` with built-in `class-validator` validation
- **Subject Builder**: Single entry point for all NATS subject generation following the convention
- **Producer Module**: `@EmitEvent()` decorator and `ProducerService` for fire-and-forget publishing
- **Consumer Module**: `@OnEvent()` decorator with automatic validation, error handling, and DLQ routing
- **Request-Reply**: `RequestReplyService` for async request to response patterns
- **Outbox Module**: SQLite-based persistent outbox with background processor for transactional safety
- **Event Logger**: Winston-based structured logging with trace and correlation IDs

### Non-goals

- Does NOT define domain-specific event payloads — each microservice owns its events.
- Does NOT replace the main PostgreSQL outbox in `ms-db-gateway` — it supplements with SQLite for other services.
- Is NOT a standalone service — it is a library consumed by NestJS microservices.

---

## Installation

```bash
npm install @cobranza-app/events-toolkit
```

### Peer Dependencies

The following must be installed in the consuming microservice:

```json
{
  "@nestjs/common": "^10.0.0",
  "@nestjs/core": "^10.0.0",
  "@nestjs/microservices": "^10.0.0",
  "class-transformer": "^0.5.0",
  "class-validator": "^0.14.0",
  "nats": "^2.0.0"
}
```

### Requirements

- Node.js >= 18
- NATS server >= 2.10 with JetStream enabled

---

## Core Concepts

### Event Envelope

All messages follow a standardized envelope structure. The toolkit provides `EventBase` as the abstract base class defining common envelope fields, and `EventEnvelope<T>` as the concrete generic class that extends it with a typed `data` payload:

```json
{
  "id": "evt_01JXYZABC123456789012345",
  "type": "payment.proof.uploaded",
  "version": "1.0.0",
  "produced_at": "2025-06-08T16:45:12.345Z",
  "producer": "payment-service",
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "actor_type": "client",
  "actor_id": "clt_123e4567-e89b-12d3-a456-426614174000",
  "correlation_id": "req_987fcdeb-51a2-43e8-9c4f-123456789abc",
  "causation_id": "evt_01JXYZABC987654321098765",
  "trace_id": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "reply_to": null,
  "data": { }
}
```

Key fields:

- `id` — UUIDv7 with `evt_` prefix
- `company_id` — UUID for tenant isolation (mandatory)
- `actor_type` / `actor_id` — who performed the action (mandatory for audit)
- `correlation_id` — links events across a transaction chain
- `data` — domain-specific payload (typed per microservice)

### Subject Naming Convention

All NATS subjects follow this pattern:

```text
company.{company_id}.{domain}.{entity}.{action}.v{version}
```

| Token | Description | Example |
| ----- | ----------- | ------ |
| `company_id` | UUID without dashes | `550e8400e29b41d4a716446655440000` |
| `domain` | Business domain | `payment`, `debt`, `bank`, `notification` |
| `entity` | Main entity | `proof`, `statement`, `schedule` |
| `action` | Past-tense verb | `uploaded`, `created`, `processed`, `sent` |
| `version` | Major version | `v1`, `v2` |

Examples:

- `company.550e8400e29b41d4a716446655440000.debt.created.v1`
- `company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1`
- `company.550e8400e29b41d4a716446655440000.bank.statement.processed.v1`

For **Request then Async Response**: append `.response` to the base subject:

- Request: `company.{id}.payment.proof.uploaded.v1`
- Response: `company.{id}.payment.proof.uploaded.response.v1`

### Actor Types

```typescript
enum ActorType {
  CLIENT = "client",
  COMPANY_USER = "company_user",
  SYSTEM = "system",
  SCHEDULER = "scheduler",
  EXTERNAL_API = "external_api"
}
```

### Event Context

The `EventContext` provides the identity and traceability metadata required by every event. When constructing or factory-creating an event, you pass an `EventContext` object:

```typescript
interface EventContext {
  companyId: string;      // Tenant UUID (mandatory)
  actorType: ActorType;   // Who performed the action
  actorId: string;        // Identifier of the actor
  correlationId?: string; // Links events across a transaction chain
  traceId?: string;       // Distributed tracing ID
  causationId?: string;   // ID of the event that caused this one
  replyTo?: string;       // Subject for request-reply responses
}
```

The toolkit propagates `companyId`, `actorType`, and `actorId` into the envelope fields `company_id`, `actor_type`, and `actor_id`.

---

## Usage

### Setup

Import the modules you need in your NestJS application:

```typescript
import { Module } from '@nestjs/common';
import { ProducerModule, ConsumerModule } from '@cobranza-app/events-toolkit';

@Module({
  imports: [
    ProducerModule.register({
      natsServers: ['nats://localhost:4222'],
      producerName: 'payment-service'
    }),
    ConsumerModule.register({
      natsServers: ['nats://localhost:4222'],
      consumerName: 'payment-service'
    })
  ]
})
export class AppModule {}
```

### Defining an Event

Extend `EventEnvelope<T>` with your domain-specific data type:

```typescript
import { EventEnvelope } from '@cobranza-app/events-toolkit';
import { IsUUID, IsUrl, IsNumber, IsEnum } from 'class-validator';

enum Currency {
  USD = 'USD',
  MXN = 'MXN',
  COP = 'COP'
}

class PaymentProofUploadedData {
  @IsUUID()
  paymentAttemptId: string;

  @IsUrl()
  fileUrl: string;

  @IsNumber()
  amount: number;

  @IsEnum(Currency)
  currency: Currency;
}

class PaymentProofUploadedEvent extends EventEnvelope<PaymentProofUploadedData> {
  readonly type = 'payment.proof.uploaded';
  readonly version = '1.0.0';
}
```

### Producer (Publishing Events)

#### Option 1 — Decorator-based (`@EmitEvent()`)

```typescript
import { EmitEvent, SubjectBuilder } from '@cobranza-app/events-toolkit';

class PaymentController {
  constructor(private readonly subjectBuilder: SubjectBuilder) {}

  @EmitEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
  async handleUpload(dto: UploadDto, context: EventContext): Promise<PaymentProofUploadedEvent> {
    return new PaymentProofUploadedEvent(
      new PaymentProofUploadedData({ paymentAttemptId, fileUrl, amount }),
      context
    );
  }
}
```

#### Option 2 — Direct service injection

```typescript
import { ProducerService, SubjectBuilder } from '@cobranza-app/events-toolkit';

class PaymentService {
  constructor(
    private readonly producerService: ProducerService,
    private readonly subjectBuilder: SubjectBuilder
  ) {}

  async processUpload(data: PaymentProofUploadedData, context: EventContext): Promise<void> {
    const subject = this.subjectBuilder.build({
      companyId: context.companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '1'
    });

    const event = new PaymentProofUploadedEvent(data, context);
    await this.producerService.publish(subject, event);
  }
}
```

### Consumer (Subscribing to Events)

```typescript
import { OnEvent, EventEnvelope } from '@cobranza-app/events-toolkit';

class PaymentProofConsumer {
  @OnEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
  async onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>): Promise<void> {
    const { data, company_id, correlation_id } = event;
    // Business logic — toolkit handles parsing, validation, acknowledgment
    await this.processProof(data);
  }
}
```

### Error Handling & DLQ

Throw `EventConsumerException` to route a message to the Dead Letter Queue. The consumer service catches this exception and forwards the failed message to the DLQ subject (`dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}`):

```typescript
import { EventConsumerException } from '@cobranza-app/events-toolkit';

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
  // Process valid event
}
```

### Structured Logging

`EventLoggerService` provides Winston-based structured logging for all event operations. It accepts optional custom transports, enabling microservices to integrate with existing logging infrastructure:

```typescript
import { EventLoggerService } from '@cobranza-app/events-toolkit';
import * as winston from 'winston';

const logger = new EventLoggerService({
  transports: [new winston.transports.Console()],
  level: 'info',
});

logger.logEventEmitted({
  eventId: event.id,
  eventType: event.type,
  subject: 'company.550e8400e29b...payment.proof.uploaded.v1',
  correlationId: event.correlation_id,
});
```

### Request-Reply Pattern

```typescript
import { RequestReplyService, SubjectBuilder, EventContext } from '@cobranza-app/events-toolkit';

class PaymentService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder
  ) {}

  async requestPaymentProof(companyId: string, paymentId: string, context: EventContext): Promise<ProofResponse> {
    const subject = this.subjectBuilder.build({
      companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'requested',
      version: '1'
    });

    const requestEvent = new PaymentProofRequestedEvent(
      new PaymentProofRequestedData({ paymentId }),
      context
    );

    return this.requestReply.sendAndWait<ProofResponse>(subject, requestEvent, {
      timeout: 10000 // ms
    });
  }
}
```

### Outbox Pattern

For transactional safety in services without a PostgreSQL database:

```typescript
import { SqliteOutboxService } from '@cobranza-app/events-toolkit';

class PaymentService {
  constructor(private readonly outboxService: SqliteOutboxService) {}

  async processWithOutbox(data: PaymentProofUploadedData, context: EventContext): Promise<void> {
    const event = new PaymentProofUploadedEvent(data, context);
    // Persisted to SQLite file, published by background processor
    await this.outboxService.saveToOutbox(event);
  }
}
```

The `OutboxModule` configuration:

```typescript
OutboxModule.register({
  dbPath: '/data/outbox.sqlite',  // Use Docker volume path
  publishInterval: 5000,           // Background processor interval (ms)
  maxRetries: 5                    // Max publish retries before marking dead
})
```

### Subject Builder

The `SubjectBuilder` is the single entry point for subject generation:

```typescript
import { SubjectBuilder } from '@cobranza-app/events-toolkit';

const subject = subjectBuilder.build({
  companyId: '550e8400e29b41d4a716446655440000',
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded',
  version: '1'
});
// Result: "company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1"
```

### Event Factory

Create validated event instances without the `new` keyword. The factory accepts the event class (not a string) as the `type` parameter and instantiates it with the provided data and context:

```typescript
import { createEvent } from '@cobranza-app/events-toolkit';

const event = createEvent<PaymentProofUploadedEvent>({
  type: PaymentProofUploadedEvent, // The event class (not a string)
  data: paymentData,
  context: eventContext
});
```

---

## Architecture

```text
src/
├── index.ts                    # Public API barrel exports
├── common/                     # Shared across all modules
│   ├── constants.ts            # Magic strings, defaults
│   ├── envelope/               # EventEnvelope<T>, ActorType, EventBase
│   │   └── validators/         # Custom class-validator decorators
│   ├── dto/                    # BuildSubjectDto
│   ├── utils/                  # SubjectBuilder, EventFactory, uuid.utils, date utils
│   └── errors/                 # EventConsumerException
├── producer/                   # ProducerModule, ProducerService, @EmitEvent()
├── consumer/                   # ConsumerModule, JetStreamConsumerService, @OnEvent()
├── request-reply/              # RequestReplyService
├── outbox/                     # OutboxModule, SqliteOutboxService
└── logging/                    # EventLoggerService (Winston)
```

Each concern is a separate NestJS `DynamicModule` — microservices import only what they need.

---

## Guidelines for AI Agents

When generating event-related code in microservices using this toolkit, follow these rules:

1. **Subject naming**: Always use `SubjectBuilder.build()` — never concatenate subject strings manually.
2. **Event IDs**: Use `generateUuidV7()` from the toolkit, prefixed with `evt_`.
3. **Validation**: Always decorate event data classes with `class-validator` decorators.
4. **Actor context**: Always populate `actor_type` and `actor_id` in the event context.
5. **Tenant isolation**: `company_id` is mandatory in every event envelope.
6. **Idempotency**: Consumers must be idempotent — use `id` + `correlation_id` for deduplication.
7. **Past-tense actions**: Action names must use past tense (`created`, `uploaded`, `processed`).
8. **Consumer errors**: Throw `EventConsumerException` for business errors that should route to DLQ.
9. **References over objects**: Prefer IDs over full object graphs in event payloads.
10. **Events under 256KB**: Keep event payloads small.

For the full convention specification, see [`docs/event-messaging-convention.md`](docs/event-messaging-convention.md).

---

## Development

### Local Development Setup

```bash
git clone <repo-url>
cd events-toolkit
npm install
```

### Scripts

```bash
npm run build       # Compile TypeScript to dist/
npm test            # Run unit tests (Jest)
npm run test:e2e    # Run integration tests (requires NATS)
npm run lint        # ESLint
npm run format      # Prettier
```

### Local NATS for testing

```bash
docker run -p 4222:4222 nats:latest -js
```

---

## Related Documentation

- [Event & Messaging Convention](docs/event-messaging-convention.md) — Full event standard specification
- [Architecture](.agent/project-info/architecture.md) — Module design and data flows
- [Tech Stack](.agent/project-info/tech.md) — Technology choices and development setup
- [Product Overview](.agent/project-info/product.md) — Problem definition and goals

---

## License

Unlicense