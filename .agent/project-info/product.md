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