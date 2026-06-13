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

- The project info files have been initialized. All 5 core files now exist.
- All implementation must respect the coding rules listed in `.agent/RULES.md` (max 200 lines per file, max 50 lines per method, max 2 depth, max 2 params, prefer private members, self-documenting code, no commented code).
- The folder structure in `brief.md` section 4 is authoritative.