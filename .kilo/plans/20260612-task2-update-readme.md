# Plan: Update README.md for events-toolkit

**Date**: 2026-06-12
**Task**: Replace base-project-template README.md with project-specific content
**Branch**: `feat/initialize-project-info-and-readme`

## Pre-Analysis

### Current State
- `README.md` (111 lines) contains the **base project template** content — generic AI-agent driven development template instructions.
- Project info files (`brief.md`, `product.md`, `architecture.md`, `tech.md`, `context.md`) are fully defined.
- `docs/event-messaging-convention.md` defines the event standard (subject naming, envelope structure, actor types, patterns).
- `src/` is empty (only `.gitkeep`). No code exists yet.
- The README must serve as the **primary developer-facing documentation** for the library.

### Desired State
A project-specific README covering: project identity, installation, core concepts, usage examples (Producer, Consumer, Request-Reply, Outbox), architecture overview, AI agent guidelines, and development setup.

---

## Implementation Plan

### Step 1: Read current README.md to confirm exact content

**Action**: Read `README.md` to verify current state before overwriting.
**Tool**: `vscode-mcp-server_read_file_code`
**File**: `README.md`

### Step 2: Create the new README.md content

**Action**: Overwrite `README.md` with the full project-specific content.
**Tool**: `vscode-mcp-server_create_file_code` with `overwrite: true`
**File**: `README.md`

#### README.md Content Structure

```markdown
# @cobranza-app/events-toolkit

NestJS library for standardized NATS + JetStream event handling across the Cobranza App microservices platform.

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Overview

`events-toolkit` encapsulates all NATS/JetStream event infrastructure concerns into reusable NestJS modules, services, and decorators. It enforces the [Event & Messaging Convention](docs/event-messaging-convention.md) at compile-time and runtime, ensuring every microservice in the platform produces and consumes events consistently.

### What it provides

- **Event Envelope**: Strongly typed `EventEnvelope<T>` with built-in `class-validator` validation
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

All messages follow a standardized envelope structure. The toolkit provides `EventEnvelope<T>` as the base class:

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

```
company.{company_id}.{domain}.{entity}.{action}.v{version}
```

| Token | Description | Example |
|-------|-------------|---------|
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
import { IsUUID, IsUrl, IsNumber } from 'class-validator';

class PaymentProofUploadedData {
  @IsUUID()
  paymentAttemptId: string;

  @IsUrl()
  fileUrl: string;

  @IsNumber()
  amount: number;
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

Throw `EventConsumerException` to route a message to the Dead Letter Queue:

```typescript
import { EventConsumerException } from '@cobranza-app/events-toolkit';

@OnEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
async onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>): Promise<void> {
  if (event.data.amount <= 0) {
    throw new EventConsumerException('Invalid amount', { event, reason: 'negative_amount' });
  }
  // Process valid event
}
```

### Request-Reply Pattern

```typescript
import { RequestReplyService } from '@cobranza-app/events-toolkit';

class PaymentService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder
  ) {}

  async requestPaymentProof(companyId: string, paymentId: string): Promise<ProofResponse> {
    const subject = this.subjectBuilder.build({
      companyId,
      domain: 'payment',
      entity: 'proof',
      action: 'requested',
      version: '1'
    });

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

Create validated event instances without the `new` keyword:

```typescript
import { createEvent } from '@cobranza-app/events-toolkit';

const event = createEvent<PaymentProofUploadedEvent>({
  type: PaymentProofUploadedEvent,
  data: paymentData,
  context: eventContext
});
```

---

## Architecture

```
src/
├── index.ts                    # Public API barrel exports
├── common/                     # Shared across all modules
│   ├── envelope/               # EventEnvelope<T>, ActorType, EventBase
│   ├── dto/                    # BuildSubjectDto
│   ├── utils/                  # SubjectBuilder, EventFactory, UUIDv7, date utils
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

### Setup

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

MIT
```

### Step 3: Verify the new README.md

**Action**: Read the written `README.md` to confirm content is correct and complete.
**Tool**: `vscode-mcp-server_read_file_code`
**File**: `README.md`

### Step 4: Check for diagnostics

**Action**: Run VS Code diagnostics on the file (markdown linters if any).
**Tool**: `vscode-mcp-server_get_diagnostics_code`
**File**: `README.md`

### Step 5: Commit the change

**Command**: 
```
git add README.md
git commit -m "docs: replace base-project README with events-toolkit project documentation"
```

---

## Verification Checklist

- [ ] README.md no longer contains base project template content
- [ ] README includes project title (`@cobranza-app/events-toolkit`) and description
- [ ] README includes Installation section with peer dependencies
- [ ] README includes Core Concepts (Event Envelope JSON, Subject Naming, Actor Types)
- [ ] README includes Usage examples for Producer (decorator + direct), Consumer, Request-Reply, Outbox
- [ ] README includes Subject Builder usage with example output
- [ ] README includes Event Factory usage
- [ ] README includes Architecture overview (folder structure)
- [ ] README includes Guidelines for AI Agents section
- [ ] README includes Development section (scripts, local NATS setup)
- [ ] README includes Related Documentation links
- [ ] README includes License section
- [ ] All code examples are syntactically valid TypeScript
- [ ] All links reference existing files
- [ ] File is committed with meaningful message

---

## Risks & Notes

- The README references modules and classes that don't exist yet in `src/` — this is intentional documentation-first approach.
- No source code files are modified in this task — only `README.md` is replaced.
- The plan assumes `src/index.ts` (barrel exports) will match the API surfaces shown in the README examples when implemented later.
