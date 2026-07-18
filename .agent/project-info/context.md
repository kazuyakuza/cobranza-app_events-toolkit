# CONTEXT — events-toolkit

## Current Work Focus

**Relax envelope validation & introduce GlobalEventEnvelope (v0.12.0).** `actor_id` is now optional for `system`/`scheduler`/`external_api` actor types via the exported `@IsOptionalForSystemActors()` validator, and a tenant-less `GlobalEventEnvelope` variant (`global.*` subjects, `GlobalEventContext`, `createGlobalEvent()`, `ProducerService.emitGlobal()`) supports cross-tenant operations. Documentation consolidated in `docs/global-events.md`.

## Recent Changes

### 2026-07-17 — Relax envelope validation & GlobalEventEnvelope (v0.12.0)
- `EventEnvelope.actor_id` now optional for `system`, `scheduler`, `external_api` actor types; required for `client`, `company_user`. Enforced via new exported `@IsOptionalForSystemActors()` decorator (`src/common/envelope/validators/`).
- `EventContext.actorId` made optional to mirror the envelope.
- Introduced tenant-less envelope variant: `GlobalEventEnvelope<T>` (no `company_id`), `GlobalEventContext`, `GlobalEventBase<T>`, `createGlobalEvent()` factory, sharing `BaseEventEnvelope<T>` / `BaseEventContext` with the tenant variant.
- Global subject support: `BuildGlobalSubjectDto`, `SubjectBuilder.buildGlobal()`, `buildGlobalSubject()`, `isGlobalSubject()`, `buildGlobalResponseSubject()`. Subject format `global.{domain}.{entity}.{action}.v{version}`.
- `ProducerService.publish()` accepts `AnyEventEnvelope`; new `ProducerService.emitGlobal(options)` builds and publishes global envelopes.
- Consumer-side validation dispatches by subject prefix (`company.*` vs `global.*`); validation utility extracted to keep `JetStreamConsumerService` under 200 lines.
- `OutboxService` accepts `AnyEventEnvelope`; `RequestReplyService` detects `isGlobalContext(context)` and builds the matching envelope via `buildGlobalEnvelope()`.
- New exported union types / guards: `AnyEventEnvelope<T>`, `AnyEventContext`, `isGlobalEnvelope()`, `isGlobalContext()`; new `EventScope` enum drives `@EmitEvent`/`@OnEvent` routing.
- Documentation: new `docs/global-events.md` decision guide; CHANGELOG v0.12.0; README + architecture/brief/CONTEXT updates; cross-links added across related docs.
- Branch: `feat/relax-envelope-validation-and-global-events`.

### 2026-07-16 — Fix push consumer missing deliver_subject (v0.11.4)
- `createDefaultConsumerOpts()` in `src/consumer/subscribe-options.interface.ts` now chains `.deliverTo(createInbox())`, giving each push consumer a unique `deliver_subject` required by NATS 2.29.3 `jetStream.subscribe()` (`push consumer requires deliver_subject`).
- `resolveConsumerSubscribeOpts` gained `ensureValidConsumerConfig` helper: plain `Partial<ConsumerOpts>` now default both `config.ack_policy` (Explicit) and `config.deliver_subject` (unique `createInbox()`) via `??=`, preserving caller values and not mutating the input.
- Added `src/consumer/subscribe-options.interface.spec.ts` (96 lines) covering default + preserve/default paths and the `isConsumerOptsBuilder` type guard.
- Updated `CHANGELOG.md` (`## [0.11.4]`) and `docs/testing-utilities.md` (consumer defaults note + bugs-guarded table).
- Branch: `feat/fix-deliverTo-push-consumer`.

### 2026-07-13 — Fix forRootAsync missing exports (v0.10.2)
- Added `exports` array to `EventsToolkitModule.forRootAsync` so that `EVENTS_TOOLKIT_OPTIONS`, `JETSTREAM_TOKEN`, and `EventLoggerService` are globally available.
- This fixes NestJS DI errors in imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`) when using the async registration path.
- Added DI compilation regression test in `src/events-toolkit.module.di.spec.ts`.
- Branch: `feat/fix-forRootAsync-exports`.

### 2026-06-29 — Task A (v0.8.0 Refactor)
- Made `version`, `description`, `payloadExample` required in `EmitEventOptions`, `OnEventOptions`, `OnRequestReplyOptions`.
- `@OnRequestReply` does **not** have a `version` field (stays absent).
- Removed fallback (`??`) for `version` and `description` in `ManifestEntryBuilder`; kept `tags ?? []` fallback.
- Updated all three decorator specs to pass required fields and removed tests asserting undefined behavior.
- Added dedicated `ManifestEntryBuilder.spec.ts` test coverage.
- Updated `docs/event-messaging-convention.md` §4.1 and `docs/event-discovery-and-service-registry.md` annotations.

### 2026-07-05 — Fix @jest/globals Leak Into Main Entry (v0.10.0)
- Removed `export * from './testing';` from `src/index.ts`.
- Added `exports` map to `package.json` exposing `.` and `./testing` subpaths (types + default conditions).
- Added regression spec `src/entry-point-isolation.spec.ts` and `pretest` build hook.
- Updated README, CHANGELOG, `docs/testing-utilities.md`, `docs/ai-agent-guidelines.md`, and `architecture.md` to document the `@cobranza-apps/events-toolkit/testing` subpath import.
- Branch: `feat/fix-jest-globals-leak`.

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

## Immediate Next Steps

1. **Final verification**: Run full test suite, lint, and typecheck across all modules for v0.12.0.
2. Verify downstream consumers (e.g., `ms-db-gateway`) build correctly against the updated package with optional `actor_id` and `GlobalEventEnvelope`.

## Current Blockers

- None.

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