# Project Structure

# Folders in src/

- common/ - Shared types, envelope, DTOs, utilities, and error classes (barrel: index.ts)
- common/envelope/ - BaseEventEnvelope, EventEnvelope, GlobalEventEnvelope, EventBase, GlobalEventBase, ActorType, EventScope, EventContext, GlobalEventContext, BaseEventContext, envelope types/guards (barrel: index.ts)
- common/dto/ - BuildSubjectDto, BuildGlobalSubjectDto (barrel: index.ts)
- common/utils/ - SubjectBuilder, subject-parser, EventFactory (createEvent/createGlobalEvent), UUID, date, serialization, and security utilities (barrel: index.ts)
- common/errors/ - EventConsumerException and error index (barrel: index.ts)
- producer/ - ProducerModule, ProducerService, EmitEvent decorator, EmitEventInterceptor (barrel: index.ts)
- producer/decorators/ - @EmitEvent() decorator and EmitEventInterceptor
- producer/decorators/__tests__/ - Shared test helpers for EmitEvent tests
- consumer/ - ConsumerService, JetStreamConsumerService, RequestReplyConsumerService, RequestReplyMessageProcessor, EnvelopeValidationUtil, GatewayConsumerOptions, consumer-opts-merger, provider factories, and decorators (barrel: index.ts)
- consumer/decorators/ - @OnEvent() and @OnRequestReply() decorators, explorers
- request-reply/ - RequestReplyService and type definitions (barrel: index.ts)
- outbox/ - OutboxModule, OutboxService, SqliteOutboxRepository, PostgresOutboxRepository, transaction context types, async request contexts (barrel: index.ts)
- logging/ - EventLoggerService (Winston-based) (barrel: index.ts)
- testing/ - Mock services, test module, and assertion helpers for unit-testing (barrel: index.ts)
- discovery/ - DiscoveryModule, DiscoveryService, manifest registration and heartbeat (barrel: index.ts)

# Other folders

- .kilo/modes/ - Built-in agent mode prompt overrides
- docs/ - Documentation files
