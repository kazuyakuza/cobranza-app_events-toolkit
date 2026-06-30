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
│   │   ├── subject.builder.ts        # SubjectBuilder, buildSubject, buildResponseSubject, buildDlqSubject
│   │   ├── event.factory.ts          # createEvent<T>() factory
│   │   ├── uuid.utils.ts             # UUIDv7 generation
│   │   ├── date.utils.ts             # ISO 8601 timestamp helpers
│   │   └── serialization.utils.ts    # Serialization helpers
│   └── errors/
│       ├── event-consumer.exception.ts  # Consumer-thrown exception → DLQ
│       └── index.ts                     # Error barrel
├── events-toolkit.module.ts          # Unified DynamicModule: forRoot / forRootAsync
├── events-toolkit-options.interface.ts  # Unified options interfaces
├── producer/                         # Fire-and-forget + async emit
│   ├── producer.module.ts            # NestJS DynamicModule
│   ├── producer.service.ts           # publish() + emit<T>()
│   └── decorators/
│       ├── emit-event.decorator.ts   # @EmitEvent() decorator + interceptor
│       └── index.ts                  # Producer barrel exports
├── consumer/                         # JetStream subscription + handling
│   ├── consumer.module.ts            # NestJS DynamicModule
│   ├── consumer.service.ts           # Core consumer logic
│   ├── jetstream-consumer.service.ts # JetStream-specific operations
│   ├── request-reply-consumer.service.ts    # Request-reply response consumer
│   ├── request-reply-message-processor.ts   # Message processor for reply flows
│   └── decorators/
│       ├── on-event.decorator.ts     # @OnEvent() decorator + explorer
│       ├── on-request-reply.decorator.ts    # @OnRequestReply() decorator + explorer
│       └── index.ts                  # Consumer barrel exports
├── request-reply/                    # Async request → response
│   ├── request-reply.service.ts      # Request-reply helpers
│   ├── request-reply.types.ts        # Type definitions
│   ├── request-reply.helpers.ts      # Helper utilities
│   └── index.ts                      # Request-reply barrel exports
├── outbox/                           # Outbox pattern
│   ├── outbox.module.ts              # NestJS DynamicModule
│   ├── outbox.service.ts             # Unified OutboxService
│   ├── sqlite-outbox.repository.ts   # SQLite outbox storage
│   ├── postgres-outbox.repository.ts # PostgreSQL outbox storage
│   ├── outbox.types.ts               # Shared type definitions
│   ├── outbox.utils.ts               # Outbox helper utilities
│   ├── outbox-request-reply.helpers.ts # Request-reply outbox helpers
│   ├── outbox-request-reply.exception.ts # Request-reply outbox exceptions
│   ├── outbox-logging.helpers.ts     # Outbox logging utilities
│   └── index.ts                      # Outbox barrel exports
├── discovery/                        # Service discovery, manifest generation, schema publishing
│   ├── discovery.module.ts           # NestJS DynamicModule
│   ├── discovery.service.ts          # Orchestrates manifest generation, heartbeat, shutdown
│   ├── discovery.controller.ts       # HTTP endpoints: GET /discovery/manifest, GET /discovery/schemas
│   ├── manifest.service.ts           # Scans decorators, builds ServiceManifestDto
│   ├── manifest-entry.builder.ts     # Builds manifest entries, resolves payloadSchemaRef
│   ├── manifest-deps.interface.ts    # Dependencies interface for ManifestService
│   ├── service-info.interface.ts     # Service info interface
│   ├── service-info-overrides.interface.ts # Service info override interface
│   ├── service-info.resolver.ts      # Resolves service identity from DI context
│   ├── instance-id.utils.ts          # Instance ID generation
│   ├── package-info-reader.utils.ts  # Reads package.json for version info
│   ├── discovery-service-options.interface.ts # Options for discovery subsystem
│   ├── dto/                          # Manifest DTOs (ServiceManifestDto, ManifestConsumeEntry, ManifestProduceEntry, ManifestRequestReplyEntry)
│   ├── events/
│   │   ├── discovery-event-publisher.service.ts # Publishes platform events
│   │   ├── discovery-payloads.interface.ts      # Platform event payloads
│   │   └── platform-event-subjects.ts           # Platform event subject strings
│   ├── utils/
│   │   ├── schema-generator.ts       # Auto-generates JSON Schema from DTOs
│   │   ├── schema-generator-options.interface.ts # Options for schema generator
│   │   ├── schema-persister.ts       # Persists generated schemas
│   │   └── schema-types.interface.ts # Schema type definitions
│   └── index.ts                      # Discovery barrel exports
├── logging/                          # Event logging
│   ├── event-logger.service.ts       # Winston-based event logger
│   └── index.ts                      # Logging barrel exports
└── testing/                          # Testing utilities
    ├── events-toolkit-test.module.ts          # NestJS DynamicModule for testing
    ├── events-toolkit-test-options.interface.ts # Options for test module
    ├── mock-consumer.service.ts              # Mock consumer service
    ├── mock-outbox.service.ts                # Mock outbox service
    ├── mock-request-reply.service.ts         # Mock request-reply service
    ├── mock-event-logger.service.ts          # Mock event logger
    ├── mock-manifest.service.ts              # Mock manifest service
    ├── mock-discovery.service.ts             # Mock discovery service
    ├── mock-discovery-event-publisher.service.ts # Mock discovery event publisher
    ├── assertion.helpers.ts                  # Jest assertion helpers (expectEventPublished, etc.)
    ├── published-event.interface.ts           # Published event tracking interface
    ├── saved-outbox-event.interface.ts        # Saved outbox event tracking interface
    └── index.ts                              # Testing barrel exports
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

The unified barrel file (`src/index.ts`) re-exports all sub-module barrels and the following top-level symbols. The actual list is authoritative from `src/index.ts`; key exports include:

```
// Unified module
EventsToolkitModule
EventsToolkitModuleOptions, EventsToolkitModuleAsyncOptions, EventsToolkitNatsOptions
EventsToolkitOutboxOptions, EventsToolkitLoggingOptions
EventsToolkitConsumerOptions, EventsToolkitDiscoveryOptions

// Common — envelope, DTOs, utils, errors
EventEnvelope, EventBase, ActorType, EventContext
BuildSubjectDto
SubjectBuilder, buildSubject, buildResponseSubject, buildDlqSubject, RESPONSE_SUFFIX, SubjectParseResult
createEvent, generateEventId, generateUuidV7
EventConsumerException

// Producer
ProducerModule, ProducerService, EmitEvent

// Consumer
ConsumerModule, ConsumerService, JetStreamConsumerService
OnEvent, OnRequestReply, EventConsumerException
RequestReplyConsumerService

// Request-Reply
RequestReplyService
(types: request reply options, results, etc.)

// Outbox
OutboxModule, OutboxService, OutboxModuleOptions
EntityManagerLike, TransactionContext, TypeormQueryRunnerContext, SaveInTransactionParams
(send request through outbox helpers, async request event context)

// Discovery
DiscoveryModule, DiscoveryService
(manifest DTOs, manifest entry builders, schema generator, schemas)

// Logging
EventLoggerService

// Testing
EventsToolkitTestModule
MockProducerService, MockConsumerService, MockOutboxService, MockRequestReplyService
MockDiscoveryService, MockManifestService, MockEventLoggerService
expectEventPublished, expectEventConsumed, etc.
PublishedEvent, SavedOutboxEvent
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