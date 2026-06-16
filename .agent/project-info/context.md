# CONTEXT — events-toolkit

## Current Work Focus

**Implementing request-reply patterns — response event naming conventions.**

The project is actively implementing request-reply communication patterns. Task 5 (Response Event Naming Conventions) has been completed, adding `buildResponseSubject()` helper, `RESPONSE_SUFFIX` constant, `SubjectParseResult` type, and `parseSubjectSegments()` utility to support both the preferred (descriptive past-tense) and alternative (`.response` suffix) response naming conventions. Documentation has been updated in both `event-messaging-convention.md` and `request-reply-patterns.md`.

## Recent Changes

### 2026-06-12 — Project Info Initialization
- `brief.md` defined with full project scope, objectives, technical decisions, and folder structure.
- `docs/event-messaging-convention.md` created — the definitive event standard for the platform.
- Task "initialize project info" completed: created `product.md`, `context.md`, `architecture.md`, `tech.md`.
- Branch `feat/initialize-project-info-and-readme` created.

### 2026-06-16 — Task 2: Transactional Outbox Hook
- Added `TransactionContext` and `TypeormQueryRunnerContext` interfaces for discriminated transaction context support.
- Added `SaveInTransactionParams` interface to encapsulate event, subject, and transaction context (max-2-params rule).
- Extended `SaveOutboxEntryParams` with optional `transactionContext` field.
- Added `resolveQueryExecutor()` private method to `PostgresOutboxRepository` for routing INSERT queries to the transaction context's `queryRunner` when provided.
- Added `saveInTransaction()` method to `OutboxService` for persisting events within an active database transaction.
- Exported new types (`TransactionContext`, `TypeormQueryRunnerContext`, `SaveInTransactionParams`) via barrel file.
- Created `docs/outbox-transactional-usage.md` with full usage guide, TypeORM example, and comparison table.
- Updated `docs/outbox-configuration.md` with transactional outbox section.
- Branch: `feat/transactional-outbox`.

### 2026-06-14 — Task 5: Response Event Naming Conventions
- Added `RESPONSE_SUFFIX` constant (`.response`), `SubjectParseResult` type, `parseSubjectSegments()` helper, and `buildResponseSubject()` function in `src/common/utils/subject.builder.ts`.
- Exported new symbols (`buildResponseSubject`, `RESPONSE_SUFFIX`, `SubjectParseResult`) via barrel files.
- Added unit tests for `buildResponseSubject()` and `RESPONSE_SUFFIX` (6 test cases).
- Updated `docs/event-messaging-convention.md` with Section 2.1 documenting both conventions (preferred past-tense and alternative `.response` suffix).
- Updated `docs/request-reply-patterns.md` with response subject helper section, updated code examples, and API reference additions.
- Applied code review fixes: Prettier formatting, valid UUIDs in JSDoc examples, package name typo corrections, removed commented-out code from docs.
- Branch: `feat/request-reply-patterns`.

### Prior State
- `brief.md` was defined by the user during project info brief initialization.
- `docs/event-messaging-convention.md` was provided as the event standard baseline.

## Immediate Next Steps (After Task 5)

1. **Task 6 — Testing & Examples**: Add comprehensive examples in `/docs` for request-reply patterns and update links in the README. Create test cases covering sync request-reply, async request-reply with decorator, outbox + response flows, and timeout/error scenarios.
2. **Task 7 — Guidelines for Developers**: Add a clear decision tree in `/docs` (linked from README) for choosing between sync and async request-reply patterns, documenting when to use each approach.
3. **Update README**: Ensure README contains clear, practical examples and references to all documentation files.
4. **Final verification**: Run full test suite, lint, and typecheck across all modules.

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

## Related Documentation

- [brief.md](brief.md) — Project scope and folder structure.
- [product.md](product.md) — Problem definition and product goals.
- [architecture.md](architecture.md) — System architecture and module design.
- [tech.md](tech.md) — Technology stack and development setup.