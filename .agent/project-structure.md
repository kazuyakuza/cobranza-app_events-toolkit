# Project Structure

# Folders in src/

- common/ - Shared types, envelope, DTOs, utilities, and error classes (barrel: index.ts)
- common/envelope/ - EventEnvelope base class, ActorType enum, EventBase, EventContext interface (barrel: index.ts)
- common/envelope/validators/ - Custom class-validator decorators
- common/dto/ - Data Transfer Objects (BuildSubjectDto) (barrel: index.ts)
- common/utils/ - SubjectBuilder, EventFactory, UUID, date, serialization, and security utilities (barrel: index.ts)
- common/errors/ - EventConsumerException and error index (barrel: index.ts)
- producer/ - ProducerModule, ProducerService, EmitEvent decorator (barrel: index.ts)
- producer/decorators/ - @EmitEvent() decorator
- consumer/ - ConsumerModule, ConsumerService, JetStreamConsumerService, RequestReplyConsumerService, provider factories, and message processor (barrel: index.ts)
- consumer/decorators/ - @OnEvent() and @OnRequestReply() decorators, explorers
- request-reply/ - RequestReplyService and type definitions (barrel: index.ts)
- outbox/ - OutboxModule, SqliteOutboxRepository, PostgresOutboxRepository, shared types (barrel: index.ts)
- logging/ - EventLoggerService (Winston-based) (barrel: index.ts)

# Other folders

- .kilo/modes/ - Built-in agent mode prompt overrides
- docs/ - Documentation files
