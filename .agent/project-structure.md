# Project Structure

# Folders in src/

- common/ - Shared types, envelope, DTOs, utilities, and error classes
- common/envelope/ - EventEnvelope base class, ActorType enum, EventBase, EventContext interface
- common/envelope/validators/ - Custom class-validator decorators
- common/dto/ - Data Transfer Objects (BuildSubjectDto)
- common/utils/ - SubjectBuilder, EventFactory, UUID and date utilities
- common/errors/ - EventConsumerException and error index
- producer/ - ProducerModule, ProducerService, EmitEvent decorator
- producer/decorators/ - @EmitEvent() decorator
- consumer/ - ConsumerModule, ConsumerService, JetStreamConsumerService
- consumer/decorators/ - @OnEvent() decorator
- request-reply/ - RequestReplyService and type definitions
- outbox/ - OutboxModule, SqliteOutboxService, Outbox entity
- logging/ - EventLoggerService (Winston-based)

# Other folders

- .kilo/modes/ - Built-in agent mode prompt overrides
- docs/ - Documentation files
