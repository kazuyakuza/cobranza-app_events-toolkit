# CONTEXT — events-toolkit

## Current Work Focus

**Decorator option refactor (v0.8.0) + comprehensive documentation overhaul (Task 6).**

The project has completed tightening decorator option interfaces (`EmitEventOptions`, `OnEventOptions`, `OnRequestReplyOptions`) to require `version`, `description`, and `payloadExample` as mandatory fields. `ManifestEntryBuilder` no longer falls back for `version`/`description`. The entire documentation surface is being overhauled to provide a clear, step-by-step onboarding path for AI agents: README Quickstart + Onboarding Flow + Deployment sections, stale decorator signature fixes, project-info refresh, cross-links, and JSDoc coverage.

## Recent Changes

### 2026-06-29 — Task A (v0.8.0 Refactor)
- Made `version`, `description`, `payloadExample` required in `EmitEventOptions`, `OnEventOptions`, `OnRequestReplyOptions`.
- `@OnRequestReply` does **not** have a `version` field (stays absent).
- Removed fallback (`??`) for `version` and `description` in `ManifestEntryBuilder`; kept `tags ?? []` fallback.
- Updated all three decorator specs to pass required fields and removed tests asserting undefined behavior.
- Added dedicated `ManifestEntryBuilder.spec.ts` test coverage.
- Updated `docs/event-messaging-convention.md` §4.1 and `docs/event-discovery-and-service-registry.md` annotations.

### 2026-06-29 — Task B (Documentation Overhaul)
- Added README Quickstart, Onboarding Flow (11-step), and Deployment sections.
- Fixed stale decorator signatures (added required `description`/`payloadExample`) across all `.md` docs and examples.
- Fixed old object-based decorator patterns in `docs/examples/async-request-reply.example.ts` and `.agent/project-info/tech.md`.
- Refreshed `.agent/project-info/architecture.md` (component tree + entry points), `brief.md` (folder structure + modules), and `CONTEXT.md` (focus + history).
- Added onboarding-flow step pointers across all relevant docs.
- Added missing cross-links between related documentation files.
- Expanded CHANGELOG with Task B documentation entries.
- JSDoc/TSDoc gap sweep across all `src/` exported symbols.

### 2026-06-18 — Task 4: Enhance Existing Decorators
- Decorators (`@OnEvent`, `@EmitEvent`, `@OnRequestReply`) now accept `eventType: string` as the first argument instead of the old object-based signature `{ domain, entity, action }`.
- Rich metadata fields (`description`, `tags`, `payloadSchemaRef`, `payloadExample`) added to all three decorators via optional second argument.
- `ManifestEntryBase` DTO now includes `payloadExample` field for discovery manifest documentation.
- Explorers and `EmitEventInterceptor` updated to use the new metadata shapes.
- `ManifestEntryBuilder` extracted from `ManifestService` to keep the service under the 200-line limit.
- Payload schema reference extraction (reflection helpers) moved into `ManifestEntryBuilder`.
- Branch: `feat/event-discovery-module`.

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

## Immediate Next Steps (After Task 6)

1. **Final verification**: Run full test suite, lint, and typecheck across all modules.

## Current Blockers

- None. Documentation overhaul is in progress.

## Active Decisions

- UUIDv7 for event IDs (via `uuid` library).
- Winston for logging.
- SQLite (file-based) for outbox in non-gateway services.
- `class-validator` + `class-transformer` for validation.
- Official `@nestjs/microservices` + `nats` package for NATS/JetStream.
- Decorator options now require `version`, `description`, `payloadExample` to enforce documentation quality.

## Notes for Next Session

- The project info files have been initialized. All 5 core files now exist.
- All implementation must respect the coding rules listed in `.agent/RULES.md` (max 200 lines per file, max 50 lines per method, max 2 depth, max 2 params, prefer private members, self-documenting code, no commented code).
- The folder structure in `brief.md` section 4 is authoritative.

## Related Documentation

- [brief.md](brief.md) — Project scope and folder structure.
- [product.md](product.md) — Problem definition and product goals.
- [architecture.md](architecture.md) — System architecture and module design.
- [tech.md](tech.md) — Technology stack and development setup.