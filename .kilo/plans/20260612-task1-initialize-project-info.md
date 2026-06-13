# Implementation Plan: Task 1 — Initialize Project Info

## Date: 2026-06-12
## Global Plan: `.kilo/plans/20260612-initialize-project-info-and-readme.md`
## TODO File: `.agent/todos/20260611/20260611-todo-0.md`

---

## Pre-Analysis Summary

### What Exists
- `brief.md` — comprehensive, well-defined (215 lines). Covers purpose, objectives, technical decisions, folder structure, module descriptions, subject builder spec, usage examples, and outbox strategy.
- `docs/event-messaging-convention.md` — complete event standard (134 lines). Defines subject naming convention, event envelope schema, actor types, idempotency rules, DLQ pattern, and request-reply pattern.
- `.agent/project-info/.initialized` — contains "THIS MARKS THE FILE AS DEFAULT VERSION" (default marker).
- `README.md` — base project template (generic), not project-specific. Being handled by Task 2.

### What Is Missing
- `product.md` — product definition, user experience, problem statement
- `context.md` — current work status, recent changes, next steps
- `architecture.md` — system architecture, design patterns, critical paths
- `tech.md` — tech stack, dev setup, technical constraints

### What Was Analyzed
- `brief.md` (215 lines) — source of truth for project scope
- `docs/event-messaging-convention.md` (134 lines) — event standard
- `.agent/project-info/instructions.md` — defines the 5 core files and their purposes
- `AGENTS.md` — entry point linking to project info files
- `.agent/project-structure.md` — shows empty src/ and minimal structure
- Current git branch: `feat/initialize-project-info-and-readme`

### Key Observations
1. The toolkit is a **developer-facing library**, not an end-user product — `product.md` must reflect this.
2. The `brief.md` is the authoritative source for scope; all other files must align with it.
3. No implementation exists yet — `src/` is empty, no `package.json` — so `context.md` must capture "pre-implementation" state.
4. The event convention is fully specified — `architecture.md` must document how the toolkit enforces it.
5. The project is a NestJS library with multiple modules — modular architecture must be documented.
6. The `.initialized` file must be updated to remove the default marker after files are created.

---

## Step 1: Create `product.md`

**File**: `.agent/project-info/product.md`

### Content Structure

```markdown
# PRODUCT — events-toolkit

## 1. Product Identity

- **Name**: `@cobranza-app/events-toolkit`
- **Type**: NestJS Shared Library / Developer Toolkit
- **Target Users**: Backend developers and AI agents building microservices for the Cobranza App platform
- **Platform**: Cobranza App (debt collection SaaS)

## 2. Problem Definition

### The Problem
Without a shared event toolkit, every microservice in the Cobranza App platform must independently implement:
- NATS/JetStream connection management
- Event envelope construction and validation
- Subject naming per the convention
- Idempotency and deduplication
- Error handling and DLQ routing
- Actor context and tracing propagation
- Outbox pattern for transactional safety

This leads to: duplicated code, inconsistent implementations, missed convention rules, and fragile event pipelines.

### The Solution
`events-toolkit` provides a single, standardized NestJS library that:
- Encapsulates ALL event infrastructure concerns
- Enforces the Event & Messaging Convention at compile-time and runtime
- Reduces boilerplate to a few lines of decorators and service calls
- Ensures every event published or consumed follows the standard

## 3. Core User Experience

### Producer Experience
Developers define event types by extending `EventEnvelope<T>`, use `@EmitEvent()` decorator or `ProducerService.publish()`, and get automatic validation, UUIDv7 generation, and subject building.

### Consumer Experience
Developers use `@OnEvent()` decorator to subscribe to JetStream subjects. The toolkit handles connection management, message parsing, envelope validation, and error routing to DLQ automatically.

### Request-Reply Experience
Request-response patterns are supported via `RequestReplyService` with automatic `reply_to` handling.

### Outbox Experience
For services without a main PostgreSQL database, the `SqliteOutboxService` provides file-based persistent outbox with background processing.

## 4. Product Goals

1. **Standardization**: Single source of truth for event conventions, enforced in code.
2. **Productivity**: Reduce event-related boilerplate by >80%.
3. **Reliability**: Built-in validation, error handling, DLQ routing.
4. **Observability**: Winston logging, trace IDs, correlation IDs — always present.
5. **Separation of Concerns**: Clean boundaries between producing, consuming, and infrastructure.
6. **AI-Agent Friendly**: Clear patterns, decorators, and JSDoc — agents can generate correct event code.

## 5. Non-Goals

- The toolkit does NOT define domain-specific event payloads (each microservice owns its events).
- The toolkit does NOT replace the main PostgreSQL outbox in `ms-db-gateway` — it supplements with SQLite for other services.
- The toolkit is NOT a standalone service — it is a library consumed by NestJS microservices.

## 6. Success Metrics

- Zero event convention violations across microservices using the toolkit.
- New microservice event setup completed in under 5 minutes.
- AI agents can generate correct, convention-compliant event code without human correction.
```

### Instructions
1. Read `brief.md` sections 1-3 for product identity alignment.
2. Read `docs/event-messaging-convention.md` sections 1 and 4-5 for problem context.
3. Write to `.agent/project-info/product.md` using `create_file_code` with `overwrite: false`.
4. The file should be self-contained and reference `brief.md` for full technical detail.

---

## Step 2: Create `context.md`

**File**: `.agent/project-info/context.md`

### Content Structure

```markdown
# CONTEXT — events-toolkit

## Current Work Focus

**Initializing project infrastructure and documentation.**

The project is in its earliest phase (pre-implementation). Core documentation and conventions are being established before any source code is written.

## Recent Changes

### 2026-06-12 — Project Info Initialization (in progress)
- `brief.md` defined with full project scope, objectives, technical decisions, and folder structure.
- `docs/event-messaging-convention.md` created — the definitive event standard for the platform.
- Task "initialize project info" in progress: creating `product.md`, `context.md`, `architecture.md`, `tech.md`.
- Branch `feat/initialize-project-info-and-readme` created.

### Prior State
- `brief.md` was defined by the user during project info brief initialization.
- `docs/event-messaging-convention.md` was provided as the event standard baseline.

## Immediate Next Steps (After This Task)

1. **Create `package.json`**: Set up NestJS library package with dependencies (`@nestjs/common`, `@nestjs/microservices`, `class-validator`, `class-transformer`, `uuid`, `winston`, `nats`).
2. **Create `tsconfig.json`**: TypeScript configuration for library output.
3. **Implement folder structure**: Create directories per `brief.md` section 4:
   - `src/common/` — constants, envelope, DTOs, utils, errors
   - `src/producer/` — module, service, decorators
   - `src/consumer/` — module, services, decorators
   - `src/request-reply/` — service, types
   - `src/outbox/` — SQLite outbox service, entity
   - `src/logging/` — Winston event logger
4. **Implement `src/index.ts`**: Public API barrel exports.
5. **Implement common module**: `EventEnvelope`, `ActorType`, `BuildSubjectDto`, `SubjectBuilder`, UUID utils, error classes.
6. **Implement producer module**: `ProducerService`, `@EmitEvent()` decorator.
7. **Implement consumer module**: `ConsumerService`, `JetStreamConsumerService`, `@OnEvent()` decorator.
8. **Implement outbox module**: `SqliteOutboxService`, background processor.
9. **Implement request-reply service**.
10. **Implement event logger** with Winston.
11. **Write unit tests** for each module.
12. **Update README** with installation and usage instructions.

## Current Blockers

- None. Documentation phase is progressing.

## Active Decisions

- UUIDv7 for event IDs (via `uuid` library).
- Winston for logging.
- SQLite (file-based) for outbox in non-gateway services.
- `class-validator` + `class-transformer` for validation.
- Official `@nestjs/microservices` + `nats` package for NATS/JetStream.

## Notes for Next Session

- The project info files are being initialized. After all 5 core files exist, the `.initialized` marker must be updated.
- All implementation must respect the coding rules listed in `.agent/RULES.md` (max 200 lines per file, max 50 lines per method, max 2 depth, max 2 params, prefer private members, self-documenting code, no commented code).
- The folder structure in `brief.md` section 4 is authoritative.
```

### Instructions
1. Read `brief.md` for current state understanding.
2. Read `docs/event-messaging-convention.md` for convention context.
3. Capture the factual "pre-implementation" state.
4. List next steps derived from `brief.md` sections 4-6 (modules to implement).
5. Write to `.agent/project-info/context.md` using `create_file_code` with `overwrite: false`.
6. Include "Notes for Next Session" to guide the next AI agent session.

---

## Step 3: Create `architecture.md`

**File**: `.agent/project-info/architecture.md`

### Content Structure

```markdown
# ARCHITECTURE — events-toolkit

## 1. System Overview

The `events-toolkit` is a **NestJS library** (not a standalone service). It is imported as a dependency by each microservice in the Cobranza App platform. It does not run independently — it provides modules, services, and decorators consumed by NestJS applications.

```
┌──────────────────────────────────────────────────────────┐
│  Microservice A   Microservice B   Microservice C        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ events-toolkit│ │ events-toolkit│ │ events-toolkit│    │
│  │ (dependency) │ │ (dependency) │ │ (dependency) │     │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘     │
│         │                │                │              │
└─────────┼────────────────┼────────────────┼──────────────┘
          │                │                │
     ┌────▼────────────────▼────────────────▼────┐
     │            NATS + JetStream               │
     │  ┌──────────────────────────────────────┐ │
     │  │ Topics / Subjects / Streams          │ │
     │  └──────────────────────────────────────┘ │
     └──────────────────────────────────────────┘
```

## 2. Module Architecture

### Component Tree

```
src/
├── index.ts                          # Public API barrel exports
├── common/                           # Shared across all modules
│   ├── constants.ts                  # Magic strings, defaults
│   ├── envelope/                     # Event envelope classes
│   │   ├── event-envelope.class.ts   # EventEnvelope<T> base class
│   │   ├── actor-type.enum.ts        # ActorType enum
│   │   ├── event-base.class.ts       # Abstract base for event types
│   │   └── validators/               # Custom class-validator decorators
│   ├── dto/
│   │   └── build-subject.dto.ts      # BuildSubjectDto with validation
│   ├── utils/
│   │   ├── subject.builder.ts        # SubjectBuilder class
│   │   ├── uuid.utils.ts             # UUIDv7 generation
│   │   └── date.utils.ts             # ISO 8601 timestamp helpers
│   └── errors/
│       ├── event-consumer.exception.ts  # Consumer-thrown exception → DLQ
│       └── index.ts                     # Error barrel
├── producer/                         # Fire-and-forget + async emit
│   ├── producer.module.ts            # NestJS DynamicModule
│   ├── producer.service.ts           # publish() + emit<T>()
│   └── decorators/
│       └── emit-event.decorator.ts   # @EmitEvent() decorator
├── consumer/                         # JetStream subscription + handling
│   ├── consumer.module.ts            # NestJS DynamicModule
│   ├── consumer.service.ts           # Core consumer logic
│   ├── jetstream-consumer.service.ts # JetStream-specific operations
│   └── decorators/
│       └── on-event.decorator.ts     # @OnEvent() decorator
├── request-reply/                    # Async request → response
│   ├── request-reply.service.ts      # Request-reply helpers
│   └── request-reply.types.ts        # Type definitions
├── outbox/                           # SQLite-based outbox
│   ├── sqlite-outbox.service.ts      # File-based outbox with BG processor
│   └── outbox.entity.ts              # Outbox record entity
└── logging/                          # Event logging
    └── event-logger.service.ts       # Winston-based event logger
```

### Module Dependency Graph

```
producer ──depends on──▶ common
consumer ──depends on──▶ common
consumer ──depends on──▶ logging
request-reply ──depends on──▶ common
outbox ──depends on──▶ common
outbox ──depends on──▶ producer (to re-publish)
logging ──depends on──▶ (Winston, standalone)
```

## 3. Design Patterns

### NestJS Module Pattern
Each domain concern (producer, consumer, outbox) is a separate NestJS `DynamicModule`. Microservices import only what they need.

### Decorator Pattern
`@EmitEvent()` and `@OnEvent()` decorators provide declarative event handling, reducing boilerplate. Decorators use NestJS metadata reflection for automatic registration.

### Outbox Pattern
Events are saved to a persistent store (SQLite file) before being published. A background processor picks up pending events and publishes them. This ensures at-least-once delivery even if the NATS connection is temporarily unavailable.

### Request-Reply Pattern
`RequestReplyService` manages the async request-response cycle: includes `reply_to` in published events, listens for responses on the reply subject, and correlates them.

### Factory Method
`createEvent<T>(options)` factory creates validated event instances without `new` keyword, ensuring consistent initialization.

### Strategy Pattern (via Dependency Injection)
`EventLoggerService` wraps Winston — consumers can provide custom Winston transports while keeping the standard event log format.

## 4. Data Flow

### Event Publishing Flow
```
1. Microservice code calls ProducerService.publish() or uses @EmitEvent()
2. ProducerService constructs EventEnvelope (UUIDv7, timestamps, actor context)
3. class-validator validates the envelope and data payload
4. SubjectBuilder.build() generates the NATS subject string
5. Event logged via EventLoggerService
6. Published to NATS JetStream
   (or saved to Outbox if OutboxModule is configured)
```

### Event Consumption Flow
```
1. @OnEvent() decorator registers a handler for a subject pattern
2. JetStreamConsumerService subscribes to NATS JetStream
3. On message arrival: parse JSON, validate EventEnvelope
4. If validation fails → EventConsumerException → DLQ routing
5. If valid → invoke registered handler
6. Handler processes business logic
7. Event logged via EventLoggerService
8. Message acknowledged to JetStream
```

### Outbox Processing Flow
```
1. Application calls SqliteOutboxService.saveToOutbox(event)
2. Event envelope serialized and stored in SQLite file
3. Background processor (interval-based) queries pending events
4. Each event: publish to NATS → on success, mark as sent
5. On failure: increment retry count, schedule retry with backoff
6. After max retries: mark as dead, log error
```

## 5. Critical Paths

### Path: Event Envelope Validation
- Every event MUST pass `class-validator` validation before publishing.
- Every consumed event MUST be validated before handler invocation.
- Failure point: If validation rules are insufficient, invalid events enter the system.
- Mitigation: Strong typing with `EventEnvelope<T>` and comprehensive validators.

### Path: Subject Building
- `SubjectBuilder.build(BuildSubjectDto)` is the single entry point for all subject generation.
- Failure point: If `SubjectBuilder` has bugs, ALL subjects across ALL microservices are affected.
- Mitigation: Extensive unit tests for `SubjectBuilder` with edge cases.

### Path: DLQ Routing
- Consumers throw `EventConsumerException` to trigger DLQ routing.
- JetStreamConsumerService catches these and forwards to DLQ subject.
- Failure point: If DLQ routing fails, poison messages block the stream.
- Mitigation: DLQ subject follows the convention pattern; max delivery attempts configured.

### Path: Outbox Durability
- SQLite file must survive container restarts (Docker volume mount).
- Background processor must be robust against crashes mid-processing.
- Failure point: Data loss if SQLite file is not on a persistent volume.
- Mitigation: Document Docker volume requirements clearly.

## 6. Entry Points (Public API via `src/index.ts`)

```
// Modules
export { ProducerModule } from './producer/producer.module';
export { ConsumerModule } from './consumer/consumer.module';
export { OutboxModule } from './outbox/outbox.module';

// Services
export { ProducerService } from './producer/producer.service';
export { ConsumerService } from './consumer/consumer.service';
export { JetStreamConsumerService } from './consumer/jetstream-consumer.service';
export { RequestReplyService } from './request-reply/request-reply.service';
export { SqliteOutboxService } from './outbox/sqlite-outbox.service';
export { EventLoggerService } from './logging/event-logger.service';

// Core classes
export { EventEnvelope } from './common/envelope/event-envelope.class';
export { EventBase } from './common/envelope/event-base.class';
export { ActorType } from './common/envelope/actor-type.enum';

// DTOs
export { BuildSubjectDto } from './common/dto/build-subject.dto';

// Utils
export { SubjectBuilder } from './common/utils/subject.builder';
export { createEvent } from './common/utils/event.factory';
export { generateUuidV7 } from './common/utils/uuid.utils';

// Decorators
export { EmitEvent } from './producer/decorators/emit-event.decorator';
export { OnEvent } from './consumer/decorators/on-event.decorator';

// Errors
export { EventConsumerException } from './common/errors/event-consumer.exception';
```

## 7. Cross-Cutting Concerns

- **Validation**: Every event, every subject DTO — validated via `class-validator`.
- **Observability**: Winston logging with trace IDs; all publishes and consumes logged.
- **Error Handling**: Consumer errors route to DLQ; producer errors logged and optionally retried.
- **Tenant Isolation**: `company_id` mandatory in every event envelope.
- **Idempotency**: `id` + `correlation_id` combination for deduplication at consumer level.
```

### Instructions
1. Read `brief.md` sections 4-7 for module and component definitions.
2. Read `docs/event-messaging-convention.md` sections 2-4 for data flow and patterns.
3. Derive the module dependency graph from `brief.md` module descriptions.
4. Write to `.agent/project-info/architecture.md` using `create_file_code` with `overwrite: false`.
5. Use ASCII diagrams for visual clarity — no external diagram tools required.
6. The entry points section MUST match the planned public API from `brief.md` section 5.

---

## Step 4: Create `tech.md`

**File**: `.agent/project-info/tech.md`

### Content Structure

```markdown
# TECH — events-toolkit

## 1. Technology Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Runtime** | Node.js >= 18 | JavaScript runtime |
| **Language** | TypeScript 5.x | Static typing, decorators |
| **Framework** | NestJS 10.x | Module system, DI, decorators |
| **Validation** | `class-validator` 0.14.x | Runtime validation via decorators |
| **Transformation** | `class-transformer` 0.5.x | Plain object -> class instance |
| **UUID** | `uuid` 9.x | UUIDv7 generation for event IDs |
| **Logging** | `winston` 3.x | Structured logging |
| **Messaging** | `nats` 2.x + `@nestjs/microservices` | NATS client + NestJS integration |
| **Outbox DB** | `better-sqlite3` | Synchronous SQLite for file-based outbox |
| **Package Manager** | npm or pnpm | Dependency management |
| **Testing** | Jest (`@nestjs/testing`) | Unit and integration tests |
| **Linting** | ESLint + Prettier | Code style enforcement |

## 2. Development Setup

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9 or pnpm >= 8
- NATS server (for integration testing) — can use Docker: `docker run -p 4222:4222 nats:latest -js`

### Local Development
```bash
# Clone and install
git clone <repo-url>
cd events-toolkit
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with NATS (integration)
npm run test:e2e
```

### Project Dependencies (`package.json`)
```json
{
  "name": "@cobranza-app/events-toolkit",
  "version": "0.1.0",
  "description": "NestJS library for standardized NATS+JetStream event handling",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:e2e": "jest --config jest.e2e.config.js",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "peerDependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/microservices": "^10.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "nats": "^2.0.0"
  },
  "dependencies": {
    "uuid": "^9.0.0",
    "winston": "^3.0.0",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/uuid": "^9.0.0",
    "@nestjs/testing": "^10.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

## 3. Technical Constraints

### Code Constraints (from `.agent/RULES.md`)
- **Max 200 lines per file** in `src/` (ideally <=125 excluding blanks/comments/imports).
- **Max 50 lines per method body**.
- **Max 2 levels of indentation** (extract deeper logic to separate methods).
- **Max 2 parameters per method/function** (encapsulate more in a class/object).
- **Prefer private members** — public only when necessary for the public API.
- **Self-documenting code** — clear names over comments.
- **No commented-out code** — use git history for restoration.
- **Single-section boolean conditions** — extract complex conditions to named methods.

### Architecture Constraints
- **No domain payloads in the toolkit** — each microservice defines its own event data types.
- **Library, not a service** — no `main.ts`, no bootstrap; only modules, services, utilities.
- **NestJS module pattern** — each concern is a separate DynamicModule.

### Event Constraints (from `docs/event-messaging-convention.md`)
- Subject format: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
- Event ID: UUIDv7 with `evt_` prefix.
- `company_id` mandatory in every envelope.
- `actor_type` and `actor_id` mandatory for audit trails.
- Consumers must be idempotent.

## 4. Tool Usage Patterns

### Subject Builder
```typescript
const subject = subjectBuilder.build({
  companyId: '550e8400e29b41d4a716446655440000', // UUID without dashes
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded',
  version: '1'
});
// Result: "company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1"
```

### Event Publishing
```typescript
// Direct service injection
await this.producerService.publish(subject, eventEnvelope);

// Decorator-based (auto-publish on method return)
@EmitEvent({
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded'
})
async handleProofUpload(data: ProofData, context: EventContext): Promise<PaymentProofUploadedEvent> {
  return new PaymentProofUploadedEvent(data, context);
}
```

### Event Consumption
```typescript
@OnEvent({
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded'
})
async onPaymentProofUploaded(event: EventEnvelope<PaymentProofUploadedData>) {
  // Business logic — toolkit handles validation, parsing, DLQ routing
}
```

### Outbox Pattern
```typescript
// Save to outbox (persisted to SQLite file)
await this.outboxService.saveToOutbox(eventEnvelope);

// Background processor automatically publishes when NATS is available
```

## 5. Build & Output

- TypeScript compiled to `dist/` with `declaration: true` (generates `.d.ts` files).
- Package entry points: `main: "dist/index.js"`, `types: "dist/index.d.ts"`.
- Consumers import: `import { ProducerModule, EventEnvelope } from '@cobranza-app/events-toolkit'`.

## 6. Testing Strategy

- **Unit tests**: Jest with `@nestjs/testing`. Each service, util, and decorator tested in isolation.
- **Integration tests**: Require a running NATS server. Test end-to-end publish->consume, DLQ routing, and outbox processing.
- **Validation tests**: Every `class-validator` rule tested with valid and invalid inputs.
- **Subject builder tests**: Edge cases for UUID formats, special characters in domain/entity/action.

## 7. Version Compatibility

- NestJS 10.x (peer dependency — consumer microservice chooses exact version).
- Node.js >= 18.
- NATS server >= 2.10 with JetStream enabled.
- SQLite 3.x (via `better-sqlite3`).
```

### Instructions
1. Read `brief.md` sections 3 and 8 for technical decisions.
2. Read `docs/event-messaging-convention.md` sections 2-3 for technical constraints from the event standard.
3. Read `.agent/RULES.md` for code constraints that impact implementation.
4. The `package.json` snippet is a preview — actual creation is a separate task.
5. Write to `.agent/project-info/tech.md` using `create_file_code` with `overwrite: false`.
6. Include concrete version ranges based on the NestJS 10.x ecosystem.

---

## Step 5: Update `.initialized` File

**File**: `.agent/project-info/.initialized`

### Current Content
```
THIS MARKS THE FILE AS DEFAULT VERSION
```

### New Content
```
Project info initialized on 2026-06-12.
```

### Instructions
1. Overwrite `.agent/project-info/.initialized` to remove the default marker.
2. This indicates the project info is no longer in the default/template state.
3. The date should be the current date (2026-06-12).

---

## Step 6: Verify Completeness and Consistency

### Verification Checklist

1. **All files exist**: Verify `.agent/project-info/` contains:
   - `brief.md` (existing)
   - `product.md` (new)
   - `context.md` (new)
   - `architecture.md` (new)
   - `tech.md` (new)
   - `instructions.md` (existing)
   - `.initialized` (updated)

2. **Content consistency**:
   - `product.md` objectives match `brief.md` section 2.
   - `context.md` next steps match `brief.md` module list.
   - `architecture.md` component tree matches `brief.md` section 4 folder structure.
   - `architecture.md` public API matches `brief.md` section 5 module descriptions.
   - `tech.md` stack matches `brief.md` section 3 technical decisions.
   - `tech.md` event constraints match `docs/event-messaging-convention.md`.
   - No contradictions between any two files.

3. **Cross-references**:
   - `product.md` references `brief.md` for full technical detail.
   - `architecture.md` references `docs/event-messaging-convention.md` for event standard.
   - `tech.md` references `.agent/RULES.md` for code constraints.

4. **`.initialized` updated**: No longer contains "DEFAULT VERSION" marker.

### Instructions
1. After writing all 4 files, read each one back and compare against `brief.md`.
2. Flag any inconsistency for fix cycle (4.3).
3. Do not proceed to Task 2 — only verify Task 1 deliverables.

---

## Summary of Deliverables

| File | Status | Source Material |
|------|--------|-----------------|
| `.agent/project-info/product.md` | To create | `brief.md` sections 1-3, 9 |
| `.agent/project-info/context.md` | To create | `brief.md` sections 4-5, current git state |
| `.agent/project-info/architecture.md` | To create | `brief.md` sections 4-7, `docs/event-messaging-convention.md` |
| `.agent/project-info/tech.md` | To create | `brief.md` section 3, `.agent/RULES.md`, `docs/event-messaging-convention.md` sections 2-3 |
| `.agent/project-info/.initialized` | To update | Remove default marker |

---

## Comparison to Original Task

Original task: "initialize project info" — creating the 4 missing project info files (`product.md`, `context.md`, `architecture.md`, `tech.md`) and updating the `.initialized` marker.

This plan covers:
- Analysis of existing `brief.md` and `docs/event-messaging-convention.md`
- Detailed content structure for each of the 4 files
- All content grounded in the authoritative `brief.md`
- Step-by-step file creation instructions
- Verification checklist
- `.initialized` file update

The plan is complete and aligned with the original task.
