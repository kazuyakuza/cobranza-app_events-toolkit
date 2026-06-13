# ARCHITECTURE — events-toolkit

## 1. System Overview

The `events-toolkit` is a **NestJS library** (not a standalone service). It is imported as a dependency by each microservice in the Cobranza App platform. It does not run independently — it provides modules, services, and decorators consumed by NestJS applications.

```
┌──────────────────────────────────────────────────────────────┐
│  Microservice A       Microservice B       Microservice C    │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│ │ events-toolkit  │  │ events-toolkit  │  │ events-toolkit  ││
│ │  (dependency)   │  │  (dependency)   │  │  (dependency)   ││
│ └────────┬────────┘  └────────┬────────┘  └────────┬────────┘│
│          │                   │                    │          │
└──────────┼───────────────────┼────────────────────┼──────────┘
           │                   │                    │
      ┌────▼───────────────────▼────────────────────▼────────┐
      │                NATS + JetStream                       │
      │  ┌────────────────────────────────────────────────┐  │
      │  │ Topics / Subjects / Streams                     │  │
      │  └────────────────────────────────────────────────┘  │
      └──────────────────────────────────────────────────────┘
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
│   │   ├── event.factory.ts          # createEvent<T>() factory
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
│   ├── outbox.module.ts              # NestJS DynamicModule
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

## 8. Related Documentation

- [brief.md](brief.md) — Project scope, objectives, and folder structure.
- [tech.md](tech.md) — Technology stack, constraints, and testing strategy.
- [event-messaging-convention.md](../../docs/event-messaging-convention.md) — Event & messaging convention standard.