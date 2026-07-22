# @cobranza-apps/events-toolkit

NATS + JetStream event handling library for the Cobranza App microservices platform.

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Unlicense-blue.svg)](LICENSE)

## Table of Contents

- [Quickstart (for AI agents)](#quickstart-for-ai-agents)
- [Onboarding Flow](#onboarding-flow)
- [Overview](#overview)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Usage](#usage)
- [Architecture](#architecture)
- [Guidelines for AI Agents](#guidelines-for-ai-agents)
- [Development](#development)
- [Deployment](#deployment)
- [Related Documentation](#related-documentation)
- [License](#license)

## Quickstart (for AI agents)

1. `npm install @cobranza-apps/events-toolkit`
2. Register NATS + subsystems in `AppModule`:

   ```ts
   EventsToolkitModule.forRoot({
     nats: { servers: ['nats://localhost:4222'] },
     discovery: { enabled: true, registerOnStartup: true, service: { name: 'payment-service', version: '1.0.0' } },
   })
   ```

3. Define an event DTO — extend `EventEnvelope<T>`, decorate every field with `class-validator`.
4. Emit: decorate a service method with `@EmitEvent('domain.entity.action', { version, description, payloadExample })`.
5. Consume: decorate a handler with `@OnEvent('domain.entity.action', { version, description, payloadExample })`.
6. Run: `npm run start`.

See the [Onboarding Flow](#onboarding-flow) section for the full 11-step path (architecture → deploy).

## Onboarding Flow

1. **Architecture** — NATS + JetStream, event envelope, actors, tenant isolation → [Core Concepts](#core-concepts)
2. **Install & configure** — `EventsToolkitModule.forRoot()` → [Installation](#installation) · [Setup (Unified Module)](#setup-unified-module)
3. **Define an event DTO** — `EventEnvelope<T>` + `class-validator` → [Defining an Event](#defining-an-event)
4. **Produce an event** — `@EmitEvent()` · `ProducerService.emit()` → [Producer](#producer-publishing-events)
5. **Consume an event** — `@OnEvent()` · DLQ routing → [Consumer](#consumer-subscribing-to-events) · [Error Handling & DLQ](#error-handling--dlq)
6. **Request-reply** — `request()` / `sendRequest()` + `@OnRequestReply()` → [Request-Reply Pattern](#request-reply-pattern)
7. **Outbox** — `OutboxService.saveToOutbox()` · `sendAsyncRequestThroughOutbox()` → [Outbox Pattern](#outbox-pattern)
8. **Service discovery** — manifests · `GET /discovery/manifest` · platform events → [Discovery](#discovery)
9. **Schema generation** — auto JSON Schema from DTOs · `payloadSchemaRef` → [Event Discovery & Service Registry](docs/event-discovery-and-service-registry.md)
10. **Testing** — `EventsToolkitTestModule` · mock services · assertion helpers → [Testing Utilities](#testing-utilities)
11. **Deployment** — JetStream stream config · env vars · health checks → [Deployment](#deployment) *(new section)*

---

## Overview

`events-toolkit` encapsulates all NATS/JetStream event infrastructure concerns into reusable NestJS modules, services, and decorators. It enforces the [Event & Messaging Convention](docs/event-messaging-convention.md) at compile-time and runtime, ensuring every microservice in the platform produces and consumes events consistently.

### What it provides

- **Event Envelope**: Strongly typed `EventEnvelope<T>` extending abstract `EventBase` with built-in `class-validator` validation
- **Subject Builder**: Single entry point for all NATS subject generation following the convention
- **Producer Module**: `@EmitEvent()` decorator and `ProducerService` for fire-and-forget publishing
- **Consumer Module**: `@OnEvent()` decorator with automatic validation, error handling, and DLQ routing
- **Request-Reply**: `RequestReplyService` for sync (`request()`) and async (`sendRequest()` + `@OnRequestReply`) request-reply patterns
- **Outbox Module**: Persistent outbox with SQLite or PostgreSQL backends, background processor for transactional safety
- **Event Logger**: Winston-based structured logging with trace and correlation IDs
- **Discovery Module**: `DiscoveryModule`, `DiscoveryService`, `@EmitEvent/@OnEvent/@OnRequestReply` manifest annotation, schema auto-generation from class-validator DTOs, service registration via `platform.service.register.v1` events, periodic heartbeats, and HTTP endpoints for manifest/schema retrieval

### Non-goals

- Does NOT define domain-specific event payloads — each microservice owns its events.
- Does NOT replace the main PostgreSQL outbox in `ms-db-gateway` — it supplements with SQLite for other services. However, a shared PostgreSQL backend is available for services that already have one.
- Is NOT a standalone service — it is a library consumed by NestJS microservices.

---

## Installation

```bash
npm install @cobranza-apps/events-toolkit
```

### Peer Dependencies

The following must be installed in the consuming microservice:

```json
{
  "@nestjs/common": "^11.1.0",
  "@nestjs/core": "^11.1.0",
  "@nestjs/microservices": "^11.1.0",
  "class-transformer": "^0.5.1",
  "class-validator": "^0.14.0",
  "nats": "^2.29.0"
}
```

### Requirements

- Node.js >= 20
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
  "correlation_id": "987fcdeb-51a2-43e8-9c4f-123456789abc",
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

> The toolkit also provides a tenant-less variant, `GlobalEventEnvelope<T>`, which omits `company_id` entirely for operations not scoped to a single tenant (company/user/role lifecycle, system-wide config). See [Global Events](docs/global-events.md).

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

Global (tenant-less) subjects omit the `company_id` segment:

```text
global.{domain}.{entity}.{action}.v{version}
// e.g. global.iam.company.created.v1
```

Build with `SubjectBuilder.buildGlobal()` / `buildGlobalSubject()`. See [Global Events](docs/global-events.md) for when to use this format.

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
  type: string;            // Event type in dot-notation (e.g. 'payment.proof.uploaded')
  version: string;         // Schema version (e.g. '1.0.0')
  producer: string;        // Name of the producing microservice (e.g. 'payment-service')
  companyId: string;      // Tenant UUID (mandatory)
  actorType: ActorType;    // Who performed the action
  actorId: string;         // Identifier of the actor
  correlationId: string;   // Links events across a transaction chain
  causationId?: string;   // ID of the event that caused this one
  traceId?: string;        // Distributed tracing ID
  replyTo?: string;        // Subject for request-reply responses
}
```

> `EventContext.companyId` is required for tenant events. For tenant-less events use `GlobalEventContext` (no `companyId`). `actorId` is optional for `system`, `scheduler`, and `external_api` actor types; required only for `client` and `company_user`. See [Global Events](docs/global-events.md).

The toolkit propagates `companyId`, `actorType`, and `actorId` into the envelope fields `company_id`, `actor_type`, and `actor_id`.

---

## Usage

### Setup (Individual Modules)

Import the modules you need in your NestJS application:

```typescript
import { Module } from '@nestjs/common';
import { ProducerModule, ConsumerModule } from '@cobranza-apps/events-toolkit';
import { connect } from 'nats';

const natsConnection = await connect({ servers: ['nats://localhost:4222'] });

@Module({
  imports: [
    ProducerModule.forRoot({ connection: natsConnection }),
    ConsumerModule.forRoot({ connection: natsConnection }),
  ]
})
export class AppModule {}
```

### Setup (Unified Module)

Use `EventsToolkitModule.forRoot()` to configure all subsystems in a single call:

```typescript
import { Module } from '@nestjs/common';
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    EventsToolkitModule.forRoot({
      nats: { servers: ['nats://localhost:4222'] },
      outbox: {
        type: 'sqlite',
        sqlitePath: '/data/outbox.sqlite',
        serviceOptions: { maxRetries: 3 },
      },
      logging: { level: 'info' },
      requestReply: { defaultTimeoutMs: 10000 },
    }),
  ],
})
export class AppModule {}
```

#### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `nats` | `EventsToolkitNatsOptions` | Yes | NATS connection settings — provide either `servers` (creates new connection) or `connection` (reuses existing). |
| `outbox` | `EventsToolkitOutboxOptions` | No | Outbox persistence config (`sqlite` or `postgres`). Omit to disable the outbox subsystem. |
| `logging` | `EventsToolkitLoggingOptions` | No | Winston logger config (`level`, `transports`). Defaults to `info` + Console transport. |
| `consumer` | `EventsToolkitConsumerOptions` | No | Consumer subsystem toggle and DLQ subject builder. Set `enable: false` to skip consumer registration. |
| `discovery` | `EventsToolkitDiscoveryOptions` | No | Service discovery config (manifest, heartbeat, schema publishing). Set `enabled: false` to skip. |
| `requestReply` | `Partial<RequestReplyConfig>` | No | Request-reply defaults. Set `defaultTimeoutMs` to override the 5000ms sync timeout. |
| `requestReply.fallbackToCoreNatsOnInbox` | `boolean` | No | When `true`, responses to INBOX subjects use core NATS instead of JetStream. Default: `false`. |
| `requestReply.coreNatsFallbackPattern` | `string` | No | Regex pattern for matching subjects that should use core NATS fallback. Default: `'^_?INBOX\\.'`. |

### Defining an Event

Extend `EventEnvelope<T>` with your domain-specific data type:

```typescript
import { EventEnvelope } from '@cobranza-apps/events-toolkit';
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

#### Option 2 — Direct service injection

```typescript
import { createEvent, ProducerService, SubjectBuilder } from '@cobranza-apps/events-toolkit';

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

    const event = createEvent(data, context);
    await this.producerService.publish(subject, event);
  }
}
```

### Consumer (Subscribing to Events)

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
    // Business logic — toolkit handles parsing, validation, acknowledgment
    await this.processProof(data);
  }
}
```

### Error Handling & DLQ

Throw `EventConsumerException` to route a message to the Dead Letter Queue. The consumer service catches this exception and forwards the failed message to the DLQ subject (`dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}`):

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
  // Process valid event
}
```

### Structured Logging

`EventLoggerService` provides Winston-based structured logging for all event operations. It accepts optional custom transports, enabling microservices to integrate with existing logging infrastructure:

```typescript
import { EventLoggerService } from '@cobranza-apps/events-toolkit';
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

The toolkit supports two request-reply patterns. For the full guide, see [Request-Reply Patterns](docs/request-reply-patterns.md). For guidance on choosing between sync and async patterns, see [Request-Reply Guidelines](docs/request-reply-guidelines.md).

> **Full examples:** See [Sync Request-Reply Example](docs/examples/sync-request-reply.example.ts) and [Async Request-Reply Example](docs/examples/async-request-reply.example.ts) for complete, runnable code samples.

#### Sync — `request()`

Blocks until a response arrives or a timeout expires:

```typescript
import { RequestReplyService, SubjectBuilder, EventContext } from '@cobranza-apps/events-toolkit';

class PaymentService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder
  ) {}

  async requestProofStatus(companyId: string, paymentId: string, context: EventContext): Promise<ProofResponse> {
    const subject = this.subjectBuilder.build({
      companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'requested',
      version: '1'
    });

    const payload = new ProofRequestedData({ paymentId });

    const response = await this.requestReply.request<ProofRequestedData, ProofResponse>(
      subject,
      payload,
      { context, timeoutMs: 10000 }
    );

    return response.data;
  }
}
```

#### Async — `sendRequest()` + `@OnRequestReply`

Non-blocking: publish a request with `reply_to`, receive the response in a decorated handler:

```typescript
// ── Requester: send async request ──
import {
  RequestReplyService, SubjectBuilder, EventContext,
  ActorType,
} from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<string> {
    const replySubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check',
      action: 'completed', version: '1',
    });

    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: '987fcdeb-51a2-43e8-9c4f-123456789abc',
      replyTo: replySubject,
    };

    const result = await this.requestReply.sendRequest({
      subject: this.subjectBuilder.build({
        companyId, domain: 'credit', entity: 'check',
        action: 'requested', version: '1',
      }),
      payload: new CreditCheckRequestedData({ clientId }),
      context,
    });

    return result.correlationId;
  }
}

// ── Responder: handle request, send response ──
class CreditCheckConsumer {
  constructor(private readonly requestReply: RequestReplyService) {}

  @OnEvent('credit.check.requested', {
    version: '1',
    description: 'Handles incoming credit check requests',
    payloadExample: { clientId: 'uuid', fullName: 'Jane Doe' },
  })
  async onCreditCheckRequested(event: EventEnvelope<CreditCheckRequestedData>): Promise<void> {
    if (!this.requestReply.isRequestReplyMessage(event)) { return; }

    const responseEvent = this.requestReply.buildResponseEnvelope({
      requestEvent: event,
      responseContext: {
        type: 'credit.check.completed', version: '1.0.0',
        producer: 'credit-service', companyId: event.company_id,
        actorType: ActorType.SYSTEM, actorId: 'credit-service',
        correlationId: event.correlation_id,
        replyTo: event.reply_to,
      },
      responseData: await this.performCheck(event.data),
    });

    await this.requestReply.sendResponse(event.correlation_id, responseEvent);
  }
}

// ── Requester: handle async response ──
class DebtServiceResponseHandler {
  @OnRequestReply('credit.check.completed', {
    description: 'Handles credit check completion responses',
    payloadExample: { clientId: 'uuid', score: 750, approved: true },
  })
  async handleCreditCheckResponse(
    event: EventEnvelope<CreditCheckResultData>,
    context: EventContext,
  ): Promise<void> {
    await this.processCreditResult(event.data, event.correlation_id);
  }
}
```

### Outbox Pattern

For a decision-making guide on when to use the outbox, which backend to choose, and transactional vs normal persistence, see [Outbox Usage Guidelines](docs/outbox-usage-guidelines.md).

For transactional safety, the Outbox module persists events before publishing. It supports two backends:

| Backend  | Use Case                        | Service Type                                       |
| -------- | ------------------------------- | -------------------------------------------------- |
| SQLite   | Lightweight, self-contained     | Services without their own database                |
| Postgres | Shares main application DB      | `ms-db-gateway` and services with existing TypeORM |

For detailed configuration, see [`docs/outbox-configuration.md`](docs/outbox-configuration.md).

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
    // Persisted to outbox, published by background processor
    await this.outboxService.saveToOutbox(event, subject);
  }
}
```

SQLite configuration:

```typescript
OutboxModule.forRoot({
  type: 'sqlite',
  sqlite: { dbPath: '/data/outbox.sqlite' },  // Use Docker volume path
  serviceOptions: {
    processorIntervalMs: 5000,  // Background processor interval (ms)
    maxRetries: 3,              // Max publish retries before DLQ routing
  },
})
```

PostgreSQL configuration:

```typescript
OutboxModule.forRoot({
  type: 'postgres',
  postgres: { entityManager: myTypeOrmEntityManager },
  serviceOptions: { maxRetries: 3 },
})
```

> **Transactional outbox:** For PostgreSQL + TypeORM services, `saveInTransaction` inserts outbox events within the caller's active database transaction, ensuring atomicity with business writes. See [Transactional Outbox Usage Guide](docs/outbox-transactional-usage.md) for details and examples.

#### Request-Reply Through the Outbox

The outbox module supports async request-reply patterns through two APIs.

##### Low-Level API — `sendRequestThroughOutbox`

For cases where you already have a pre-built envelope, use `sendRequestThroughOutbox`:

```typescript
import {
  createEvent, OutboxService, SubjectBuilder, EventContext,
  ActorType,
} from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<void> {
    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: '987fcdeb-51a2-43e8-9c4f-123456789abc',
      replyTo: this.subjectBuilder.build({
        companyId, domain: 'credit', entity: 'check',
        action: 'completed', version: '1',
      }),
    };

    const event = createEvent({ clientId }, context);
    await this.outboxService.sendRequestThroughOutbox(
      event,
      this.subjectBuilder.build({
        companyId, domain: 'credit', entity: 'check',
        action: 'requested', version: '1',
      }),
    );
  }
}
```

##### High-Level API — `sendAsyncRequestThroughOutbox`

For a simpler API that builds the envelope for you, use `sendAsyncRequestThroughOutbox`:

```typescript
import {
  OutboxService, SubjectBuilder, EventContext,
  ActorType, generateUuidV7,
} from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<string> {
    const requestSubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'requested', version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId, domain: 'credit', entity: 'check', action: 'completed', version: '1',
    });

    const result = await this.outboxService.sendAsyncRequestThroughOutbox({
      subject: requestSubject,
      payload: { clientId },
      context: {
        type: 'credit.check.requested',
        version: '1.0.0',
        producer: 'debt-service',
        companyId,
        actorType: ActorType.SYSTEM,
        actorId: 'debt-service',
        correlationId: generateUuidV7(),
        replyTo: replySubject,
      },
    });

    return result.correlationId;
  }
}
```

##### Recommended Patterns

| Pattern | Approach |
|---------|----------|
| **Sync Request-Reply** (`request()`) | Bypass the outbox for the request — you're waiting for the response anyway. Use the outbox only for side effects triggered by the response. |
| **Async Request-Reply** (`sendRequest()` / `sendAsyncRequestThroughOutbox`) | Route the initial request through the outbox to guarantee delivery, even if the service restarts. Use `sendAsyncRequestThroughOutbox` for the simplest API, or `sendRequestThroughOutbox` if you need to build the envelope manually. |

See [Request-Reply Patterns](docs/request-reply-patterns.md) for full async pattern documentation and [Outbox Configuration](docs/outbox-configuration.md) for request-reply outbox guidance.

### Subject Builder

The `SubjectBuilder` is the single entry point for subject generation:

```typescript
import { SubjectBuilder } from '@cobranza-apps/events-toolkit';

const subject = subjectBuilder.build({
  companyId: '550e8400e29b41d4a716446655440000',
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded',
  version: '1'
});
// Result: "company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1"
```

### Discovery

Configure the discovery subsystem to auto-register your service and generate JSON Schemas:

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  discovery: {
    enabled: true,
    registerOnStartup: true,
    heartbeatIntervalMinutes: 5,
    service: { name: 'payment-service', version: '1.0.0' },
  },
})
```

For the full guide, see [Event Discovery & Service Registry](docs/event-discovery-and-service-registry.md).

### Event Factory

Create validated event instances without the `new` keyword. The factory accepts the data payload and an `EventContext`, and returns a fully-populated `EventEnvelope`:

```typescript
import { createEvent, ActorType } from '@cobranza-apps/events-toolkit';

const eventContext: EventContext = {
  type: 'payment.proof.uploaded',
  version: '1.0.0',
  producer: 'payment-service',
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  actorType: ActorType.CLIENT,
  actorId: 'clt_123e4567-e89b-12d3-a456-426614174000',
  correlationId: '987fcdeb-51a2-43e8-9c4f-123456789abc',
};

const event = createEvent(paymentData, eventContext);
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
├── producer/
│   ├── decorators/             # @EmitEvent(), EmitEventInterceptor
│   ├── producer.module.ts
│   └── producer.service.ts
├── consumer/
│   ├── decorators/             # @OnEvent(), @OnRequestReply(), explorers
│   ├── consumer.module.ts
│   ├── consumer.service.ts
│   └── jetstream-consumer.service.ts
├── discovery/                    # Service discovery, manifest generation, schema publishing
│   ├── dto/                      # Manifest DTOs (ServiceManifestDto, ManifestConsumeEntry, etc.)
│   ├── events/                   # DiscoveryEventPublisher, platform subjects and event types
│   ├── utils/                    # SchemaGenerator, SchemaPersister
│   ├── discovery.controller.ts   # HTTP endpoints: GET /discovery/manifest, GET /discovery/schemas
│   ├── discovery.service.ts      # Orchestrates manifest generation, heartbeat, shutdown
│   ├── discovery.module.ts       # DiscoveryModule DynamicModule
│   ├── manifest.service.ts       # Scans decorators, builds ServiceManifestDto
│   └── manifest-entry.builder.ts # Builds manifest entries, resolves payloadSchemaRef
├── request-reply/              # RequestReplyService
├── outbox/                     # OutboxModule, OutboxService, SqliteOutboxRepository, PostgresOutboxRepository
└── logging/                    # EventLoggerService (Winston)
```

Each concern is a separate NestJS `DynamicModule` — microservices import only what they need.

---

## Guidelines for AI Agents

When generating event-related code in microservices using this toolkit, follow these rules:

1. **Subject naming**: Always use `SubjectBuilder.build()` — never concatenate subject strings manually.
2. **Event IDs**: Use `generateEventId()` from the toolkit, which returns a UUIDv7 prefixed with `evt_`.
3. **Validation**: Always decorate event data classes with `class-validator` decorators.
4. **Actor context**: Always populate `actor_type`. Provide `actor_id` for `client` and `company_user`; it is optional for `system`, `scheduler`, and `external_api` actor types.
5. **Tenant isolation**: `company_id` is mandatory in tenant event envelopes (`EventEnvelope`). For tenant-less operations use `GlobalEventEnvelope` (no `company_id`) and `global.*` subjects — see [Global Events](docs/global-events.md).
6. **Idempotency**: Consumers must be idempotent — use `id` + `correlation_id` for deduplication.
7. **Past-tense actions**: Action names must use past tense (`created`, `uploaded`, `processed`).
8. **Consumer errors**: Throw `EventConsumerException` for business errors that should route to DLQ.
9. **References over objects**: Prefer IDs over full object graphs in event payloads.
10. **Events under 256KB**: Keep event payloads small.

For step-by-step instructions on creating events, naming subjects, and common pitfalls, see [`docs/ai-agent-guidelines.md`](docs/ai-agent-guidelines.md).

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

### Testing Utilities

The toolkit provides mock services, a NestJS test module, and Jest assertion helpers for unit-testing microservices that depend on events-toolkit — no NATS connection required.

```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockProducerService,
  expectEventPublished,
} from '@cobranza-apps/events-toolkit/testing';
```

> Testing utilities (mocks + assertion helpers) must be imported from the `@cobranza-apps/events-toolkit/testing` subpath — they depend on `@jest/globals` and are not exported from the main entry.

```typescript
describe('PaymentService', () => {
  let service: PaymentService;
  let mockProducer: MockProducerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
      providers: [PaymentService],
    }).compile();

    service = module.get(PaymentService);
    mockProducer = module.get(MockProducerService);
  });

  it('should publish an event', async () => {
    await service.uploadProof({ companyId: '...', amount: 250 });
    expectEventPublished(mockProducer, 'company.550e.payment.proof.uploaded.v1');
  });
});
```

Full documentation: [`docs/testing-utilities.md`](docs/testing-utilities.md)

---

## Deployment

### JetStream Stream Configuration

Configure event, DLQ, and platform streams with JetStream. Streams can be created manually (CLI or programmatic) or auto-created by enabling `consumer.autoCreateStreams`.

For the full guide — server requirements, stream auto-creation, manual setup, resource limits, authentication, clustering, monitoring, and backup/restore — see [NATS JetStream Configuration](docs/nats-jetstream-configuration.md).

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NATS_URLS` | Comma-separated NATS server URLs | `nats://localhost:4222` |
| `SERVICE_NAME` | Microservice name for discovery | `payment-service` |
| `SERVICE_VERSION` | Microservice version for discovery | `1.0.0` |
| `OUTBOX_DB_PATH` | SQLite file path (SQLite outbox only) | `/data/outbox.sqlite` |

### Health Checks

- **Liveness probe**: `GET /discovery/manifest` — returns the service manifest JSON. A 200 response indicates the service is healthy and the discovery subsystem is active.
- **Heartbeat**: Set `heartbeatIntervalMinutes` in discovery options to enable periodic platform heartbeat events (`platform.service.heartbeat.v1`). Default: 5 minutes.
- **SQLite persistence**: When using the SQLite outbox backend in Docker, mount a persistent volume at the `OUTBOX_DB_PATH` directory to survive container restarts. See [Outbox Configuration](docs/outbox-configuration.md).

---

## Related Documentation

- [Changelog](CHANGELOG.md) — Notable release changes and upgrade notes
- [Event & Messaging Convention](docs/event-messaging-convention.md) — Full event standard specification
- [Outbox Configuration](docs/outbox-configuration.md) — SQLite vs Postgres setup, service options, and migration guide
- [Outbox Usage Guidelines](docs/outbox-usage-guidelines.md) — Decision trees for outbox backend, transactional vs normal, and request-reply patterns
- [Transactional Outbox Usage](docs/outbox-transactional-usage.md) — TypeORM transaction examples and saveInTransaction guide
- [AI Agent Guidelines](docs/ai-agent-guidelines.md) — Step-by-step event creation, naming, correlation/causation, and common mistakes
- [Global Events](docs/global-events.md) — When to use tenant (`EventEnvelope`) vs global (`GlobalEventEnvelope`) events
- [Event Discovery & Service Registry](docs/event-discovery-and-service-registry.md) — Service manifest, schema generation, platform events, and discovery module setup
- [Request-Reply Patterns](docs/request-reply-patterns.md) — Sync vs async patterns, correlation, timeouts, and error handling
- [Request-Reply Guidelines](docs/request-reply-guidelines.md) — Decision tree, timeout recommendations, performance trade-offs, and best practices
- [Request-Reply Examples](docs/examples/) — Complete code examples for sync, async, and outbox request-reply patterns
- [Testing Utilities](docs/testing-utilities.md) — Mock services, test module, and assertion helpers
- [NATS JetStream Configuration](docs/nats-jetstream-configuration.md) — Server requirements, stream auto-creation, manual setup, and production recommendations
- [Architecture](.agent/project-info/architecture.md) — Module design and data flows
- [Tech Stack](.agent/project-info/tech.md) — Technology choices and development setup
- [Product Overview](.agent/project-info/product.md) — Problem definition and goals

---

## License

Unlicense
