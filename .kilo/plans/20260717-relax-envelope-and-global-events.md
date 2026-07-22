# Global Plan — Modify EventEnvelope Validation & Introduce GlobalEventEnvelope

**Source TODO:** `.agent/todos/20260716/20260716-todo-2.md`  
**Date:** 2026-07-17  
**Branch:** `feat/relax-envelope-validation-and-global-events`  
**Version bump:** Minor (`0.11.6` → `0.12.0`) — new features (GlobalEventEnvelope) + behavior change (optional actor_id)

---

## Step 2: Git Feature Branch Setup
- `main` is master. Commit any unstaged work. Create `feat/relax-envelope-validation-and-global-events`.

## Step 3: Version Update
- Bump `package.json` version to `0.12.0`. Commit: `chore: bump version to 0.12.0`.

---

## Task 1: Toolkit — Make `actor_id` optional for SYSTEM/SCHEDULER/EXTERNAL_API

### 4.1 Analysis & Planning
- Research `class-validator` custom decorators. Design `@IsOptionalForSystemActors` validator.
- Identify all call sites that construct `actorId` / `actor_id` and need to handle optionality.
- Plan file changes staying within 200-line/50-line/method/2-param rules.
- Save per-task plan to `.kilo/plans/20260717-optional-actor-id-task1.md`.

### 4.2 Implementation
- Create `src/common/envelope/validators/is-optional-for-system-actors.validator.ts`
- Modify `EventEnvelope`: replace `@IsString() @IsNotEmpty()` on `actor_id` with `@IsOptionalForSystemActors()`
- Modify `EventContext`: make `actorId` optional (`actorId?: string`)
- Update `createEvent` factory, `ProducerService.buildEnvelope`, `buildEnvelope` helper, `envelopeToContext` to handle optional `actorId`
- Update `src/common/envelope/index.ts` to export new validator
- Add/extend tests:
  - `event-envelope.validation.spec.ts` — validates `actor_id` optional for system/scheduler/external_api, required for client/company_user
  - `event.factory.spec.ts` — factory works without `actorId`
  - New spec for custom validator

### 4.3 Code Review & Simplification
- Review for rule compliance, backward compatibility, test coverage.
- Simplify where possible.
- Save fix/simplification plan. Implement fixes.

### 4.4 Documentation
- JSDoc on `@IsOptionalForSystemActors`
- Update `docs/ai-agent-guidelines.md` validation checklist (actor_id no longer always required)
- Cross-links to related docs

### 4.5 Verification
- Confirm all tests pass (`npm test`)
- Confirm typecheck passes (`npm run typecheck`)
- Confirm lint passes (`npm run lint`)
- Verify implementation matches plan

### 4.6 Task Completion
- Mark Task 1 as `[DONE]` in TODO file. Commit.

---

## Task 2: Toolkit — Introduce GlobalEventEnvelope type

### 4.1 Analysis & Planning
- Design class hierarchy: `BaseEventEnvelope<T>` → `EventEnvelope<T>` (adds `company_id`) and `GlobalEventEnvelope<T>` (no `company_id`).
- Design context hierarchy: `BaseEventContext` → `EventContext` (adds `companyId`) and `GlobalEventContext` (no `companyId`).
- Design subject hierarchy: `BuildSubjectDto` (tenant) and `BuildGlobalSubjectDto` (global). Global format: `global.{domain}.{entity}.{action}.v{version}`.
- Identify all services that must accept both envelope types: `ProducerService`, `ConsumerService`, `JetStreamConsumerService`, `OutboxService`, `RequestReplyService`.
- Plan extraction of envelope validation from `JetStreamConsumerService` into a dedicated utility to stay under 200-line file limit.
- Save per-task plan to `.kilo/plans/20260717-global-event-envelope-task2.md`.

### 4.2 Implementation
- Create `src/common/envelope/base-event-envelope.class.ts`
- Refactor `src/common/envelope/event-envelope.class.ts` to extend base
- Create `src/common/envelope/global-event-envelope.class.ts`
- Create `src/common/envelope/base-event-context.interface.ts`
- Refactor `src/common/envelope/event-context.interface.ts` to extend base
- Create `src/common/envelope/global-event-context.interface.ts`
- Create `src/common/dto/build-global-subject.dto.ts`
- Update `SubjectBuilder` with `buildGlobal()` and `buildGlobalSubject()`
- Create `src/common/envelope/envelope-types.ts` (union types: `AnyEventEnvelope`, `AnyEventContext`)
- Update `ProducerService` to accept `AnyEventEnvelope`, add `emitGlobal()`
- Update `ConsumerService` / `JetStreamConsumerService` to dispatch both envelope types (extract validation utility)
- Update `OutboxService` to accept `AnyEventEnvelope`
- Update `RequestReplyService` and helpers to support both contexts
- Update `EventBase` (kept as-is extending `EventEnvelope`); add `GlobalEventBase`
- Update barrel files (`src/common/envelope/index.ts`, `src/common/index.ts`, `src/index.ts`)
- Add tests:
  - `global-event-envelope.validation.spec.ts`
  - `build-global-subject.dto.spec.ts`
  - `subject.builder.global.spec.ts`
  - Updated consumer/producer/outbox/request-reply tests for dual-type acceptance

### 4.3 Code Review & Simplification
- Review for type-safety, backward compatibility, rule compliance.
- Simplify where possible.
- Save fix/simplification plan. Implement fixes.

### 4.4 Documentation
- JSDoc on all new public symbols
- Update `docs/event-messaging-convention.md` with global event subject format, GlobalEventEnvelope fields, actor_id rules
- Update `docs/ai-agent-guidelines.md` with global event examples and when to use global vs tenant events

### 4.5 Verification
- Full test suite passes
- Typecheck passes
- Lint passes
- Verify no breaking changes for existing `EventEnvelope` consumers

### 4.6 Task Completion
- Mark Task 2 as `[DONE]` in TODO file. Commit.

---

## Task 3: Update Documentation

### 4.1 Analysis & Planning
- Design new documentation file structure: `docs/global-events.md` with decision guide, examples, and subject format reference.
- Plan updates to `CHANGELOG.md` for v0.12.0.
- Save per-task plan to `.kilo/plans/20260717-documentation-task3.md`.

### 4.2 Implementation
- Create `docs/global-events.md`:
  - When to use tenant-scoped (`EventEnvelope`) vs global (`GlobalEventEnvelope`) events
  - Decision tree / examples (company creation, system config, cross-tenant queries)
  - Subject format comparison table
  - Actor type requirements table
  - Code examples for producing and consuming global events
  - Links to related docs
- Update `CHANGELOG.md` with v0.12.0 entries for all changes
- Update `docs/event-messaging-convention.md` §3 and §5 with global event info and actor_id rules
- Update `docs/ai-agent-guidelines.md` validation checklist and public API quick reference
- Update `.agent/project-info/architecture.md` cross-cutting concerns section (tenant isolation is no longer universal)
- Update `.agent/project-info/brief.md` if folder structure changed

### 4.3 Code Review & Simplification
- Review docs for accuracy, consistency with implementation, and completeness.

### 4.4 Documentation
- Ensure all new files have proper TOC/Index if > 100 lines
- Cross-link between docs

### 4.5 Verification
- Verify all doc examples compile conceptually
- Check for broken internal links

### 4.6 Task Completion
- Mark Task 3 as `[DONE]` in TODO file. Commit.

---

## Step 5: TODO File Completion
- Rename TODO file to `20260716-todo-2-DONE.md`
- Merge feature branch into `main`
- Push `main` to `origin` only

---

## Global Pre-Analysis

### Technical Decisions
1. **Custom validator for actor_id**: Use `class-validator` `registerDecorator` to create `@IsOptionalForSystemActors()`. This is exported so library consumers can reuse it on their own DTOs if needed.
2. **Base class hierarchy**: `BaseEventEnvelope<T>` holds all common fields. `EventEnvelope<T>` adds `company_id`. `GlobalEventEnvelope<T>` adds nothing. This keeps `EventEnvelope` backward-compatible.
3. **Global subject format**: `global.{domain}.{entity}.{action}.v{version}`. Chosen over `system.*` to avoid confusion with platform events (`platform.*`) and `system` actor type.
4. **Dual-type acceptance**: Services accept `AnyEventEnvelope = EventEnvelope<unknown> | GlobalEventEnvelope<unknown>` via union types. No runtime polymorphism needed — the envelope is just a validated object.
5. **File size management**: Extract envelope validation from `JetStreamConsumerService` into `src/consumer/envelope-validation.util.ts` to keep the service under 200 lines. Similarly, envelope building helpers may be consolidated into `src/common/envelope/envelope-builder.ts`.

### Architecture Impact
- **Tenant Isolation**: No longer universal. Global events bypass tenant isolation by design. Consumers of global events must enforce their own authorization.
- **EventContext**: Split into tenant and global variants. Services that work with both use the union type.
- **Subject Builder**: Now has two entry points: `build()` (tenant) and `buildGlobal()` (global).
- **Validation**: Consumer-side validation inspects the subject prefix (`company.` vs `global.`) to determine which envelope class to validate against.

### Risk & Mitigation
| Risk | Mitigation |
|------|-----------|
| Breaking existing `EventEnvelope` consumers | `EventEnvelope` keeps its name and structure; only `actor_id` validation relaxes. All type changes are additive (optional fields). |
| `JetStreamConsumerService` exceeding 200 lines | Extract validation logic into a dedicated utility before adding global envelope support. |
| `OutboxService` exceeding 200 lines | Changes are limited to type signature updates (accept union type); no new methods added. |
| Confusion between `global.*` and `platform.*` subjects | Document clearly in `docs/global-events.md` and `event-messaging-convention.md` with comparison table. |

### Testing Strategy
- Unit tests for every new validator, DTO, and utility.
- Updated existing specs to cover optional `actorId` paths.
- New specs for global envelope validation, global subject building, and dual-type consumer dispatch.
- Full `npm test` + `npm run typecheck` + `npm run lint` before each task completion.
