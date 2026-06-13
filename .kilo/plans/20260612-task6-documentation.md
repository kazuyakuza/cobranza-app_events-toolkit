# Task 6 — Documentation: Implementation Plan

**Date**: 2026-06-13
**Task**: Review README.md and ensure docs/event-convention.md is in the right place
**Branch**: `feat/initialize-project-core`
**TODO File**: `.agent/todos/20260611/20260611-todo-1.md`

## Pre-Analysis

### Current State

- **README.md**: 488 lines. Already comprehensive — was created in Task 2 (plan `20260612-task2-update-readme.md`) and updated by the docs-specialist during Task 5 documentation step.
- **docs/event-messaging-convention.md**: 134 lines. Exists and is correctly referenced from README.md, brief.md, architecture.md, and tech.md.
- **TODO discrepancy**: TODO file line 66 says `docs/event-convention.md` but the actual filename throughout the project is `docs/event-messaging-convention.md`. This is a typo in the TODO — no action needed.
- **Source code**: All implemented code files exist in `src/` — the README examples can be verified against actual implementations.

### What This Task Requires

The task is primarily a **review and verification**, not creation. Both files already exist. The work is:

1. Review README.md for correctness and completeness
2. Verify `docs/event-messaging-convention.md` is correctly placed and referenced
3. Commit any fixes found during review

### Code Rules Compliance (for any changes made)
- Max 200 lines per file in src/
- Max 50 lines per method body
- Max 2 levels of indentation
- Max 2 parameters per method
- Prefer private members
- Self-documenting code
- No commented-out code
- Single-section boolean conditions

---

## Step 1: Review README.md — Project Identity & Overview (lines 1-31)

**Action**: Read README.md lines 1-31.

**Checklist**:
- [ ] Package name `@cobranza-app/events-toolkit` matches `package.json` and brief.md
- [ ] Overview accurately describes the library's purpose
- [ ] "What it provides" list covers all 7 modules (Event Envelope, Subject Builder, Producer, Consumer, Request-Reply, Outbox, Event Logger)
- [ ] "Non-goals" accurately describe what the toolkit does NOT do

**Verification method**: Manual reading. No code changes expected here.

---

## Step 2: Review README.md — Installation (lines 33-59)

**Action**: Read README.md lines 33-59.

**Checklist**:
- [ ] Installation command: `npm install @cobranza-app/events-toolkit`
- [ ] Peer dependencies match `tech.md` and `package.json`: `@nestjs/common`, `@nestjs/microservices`, `class-transformer`, `class-validator`, `nats`
- [ ] Node.js >= 18 requirement stated
- [ ] NATS server >= 2.10 with JetStream requirement stated

**Verification method**: Cross-reference with `tech.md` section 2 and `.agent/project-info/tech.md`.

---

## Step 3: Review README.md — Core Concepts (lines 61-149)

**Action**: Read README.md lines 61-149.

**Checklist**:
- [ ] Event Envelope JSON structure matches `docs/event-messaging-convention.md` §3
- [ ] Subject naming pattern: `company.{company_id}.{domain}.{entity}.{action}.v{version}` — correct
- [ ] Subject examples are valid
- [ ] Request-Reply `.response` suffix documented
- [ ] ActorType enum values match `src/common/envelope/actor-type.enum.ts`: `client`, `company_user`, `system`, `scheduler`, `external_api`
- [ ] EventContext interface matches the conceptual model

**Verification method**: Cross-reference with `src/common/envelope/actor-type.enum.ts` and `src/common/envelope/event-envelope.class.ts`.

---

## Step 4: Review README.md — Usage: Setup & Defining Events (lines 151-218)

**Action**: Read README.md lines 151-218.

**Checklist**:
- [ ] Module registration pattern: `ProducerModule.register({ natsServers, producerName })` — forward-looking
- [ ] Event definition example: `PaymentProofUploadedEvent extends EventEnvelope<PaymentProofUploadedData>` — correct pattern
  - Note: `EventBase<T>` extends `EventEnvelope<T>` and declares `abstract type` and `abstract version`. Using `EventEnvelope` directly with `readonly type` and `readonly version` is semantically equivalent.
- [ ] `class-validator` decorators on data class are correct

---

## Step 5: Review README.md — Usage: Producer (lines 219-255)

**Action**: Read README.md lines 219-255.

**Checklist**:
- [ ] `@EmitEvent()` decorator example correct — passes domain/entity/action config
- [ ] `SubjectBuilder.build()` call matches actual API: `build({ companyId, domain, entity, action, version })`
- [ ] `ProducerService.publish(subject, event)` signature correct (forward-looking)

---

## Step 6: Review README.md — Usage: Consumer (lines 257-291)

**Action**: Read README.md lines 257-291.

**Checklist**:
- [ ] `@OnEvent()` decorator example correct
- [ ] Consumer handler signature: `onProofUploaded(event: EventEnvelope<PaymentProofUploadedData>)` — correct
- [ ] Error handling with `EventConsumerException` — verify code example matches `src/common/errors/event-consumer.exception.ts`
  - README (line 289): `throw new EventConsumerException({ message, eventId, eventType, correlationId })`
  - Implementation: Constructor takes `{ message, eventId, eventType, correlationId?, cause? }` ✅ — matches
- [ ] DLQ subject format: `dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}` — correct

---

## Step 7: Review README.md — Usage: Structured Logging (lines 293-312)

**Action**: Read README.md lines 293-312.

**Checklist**:
- [ ] `EventLoggerService` constructor matches `EventLoggerOptions` interface
- [ ] `logEventEmitted()` method signature matches `EventLogContext` interface
- [ ] Cross-reference with `src/logging/event-logger.service.ts` — all match ✅

---

## Step 8: Review README.md — Usage: Request-Reply & Outbox (lines 314-372)

**Action**: Read README.md lines 314-372.

**Checklist**:
- [ ] `RequestReplyService.sendAndWait<T>(subject, event, { timeout })` — forward-looking
- [ ] `SqliteOutboxService.saveToOutbox(event)` — forward-looking
- [ ] `OutboxModule.register({ dbPath, publishInterval, maxRetries })` — forward-looking

No fixes needed — these are forward-looking and match the brief.md specification.

---

## Step 9: Review README.md — Usage: Subject Builder & Event Factory (lines 374-403)

**Action**: Read README.md lines 374-403.

**Checklist**:
- [ ] `SubjectBuilder.build()` example matches `src/common/utils/subject.builder.ts` implementation
  - README: `companyId: '550e8400e29b41d4a716446655440000'` → `company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1`
  - Actual code: `companyId.replace(/-/g, '')` → `company.${companyId}...` ✅
- [ ] `createEvent()` factory is forward-looking (not yet implemented)

---

## Step 10: Review README.md — Architecture (lines 405-427)

**Action**: Read README.md lines 405-427.

**Checklist**:
- [ ] Folder structure matches `src/` actual layout — all directories match ✅
- [ ] "Each concern is a separate NestJS DynamicModule" — correct architectural description

---

## Step 11: Review README.md — Guidelines for AI Agents (lines 429-445)

**Action**: Read README.md lines 429-445.

**Checklist**:
- [ ] All 10 rules present and consistent with `docs/event-messaging-convention.md`
- [ ] `generateUuidV7()` mentioned in rule 2 — exists in `src/common/utils/uuid.utils.ts` ✅

---

## Step 12: Review README.md — Development & Related Docs (lines 447-488)

**Action**: Read README.md lines 447-488.

**Checklist**:
- [ ] Development scripts match `package.json`: `build`, `test`, `test:e2e`, `lint`, `format`
- [ ] Local NATS Docker command correct
- [ ] Related Documentation links all point to existing files:
  - `docs/event-messaging-convention.md` ✅
  - `.agent/project-info/architecture.md` ✅
  - `.agent/project-info/tech.md` ✅
  - `.agent/project-info/product.md` ✅
- [ ] License: MIT

---

## Step 13: Verify docs/event-messaging-convention.md Placement & References

**Action**: Verify the convention document is correctly placed and all references are consistent.

**Checklist**:
- [ ] File exists at `docs/event-messaging-convention.md` ✅
- [ ] Referenced in `README.md` line 14 ✅
- [ ] Referenced in `brief.md` §2, §10, §11 ✅
- [ ] Referenced in `architecture.md` §7 and §8 ✅
- [ ] Referenced in `tech.md` §3 and §8 ✅
- [ ] Referenced in source code JSDoc comments:
  - `event-envelope.class.ts` ✅
  - `event-base.class.ts` ✅
  - `subject.builder.ts` ✅
  - `uuid.utils.ts` ✅

**TODO discrepancy**: The TODO file (line 66) says `docs/event-convention.md` but the actual convention document is named `docs/event-messaging-convention.md`. This name is consistently used throughout the codebase. The TODO has a typo — no action needed.

---

## Step 14: Overall README.md Consistency Check

**Action**: Cross-reference all README claims against source code reality.

| README Claim | Source Code Reality | Status |
|---|---|---|
| `EventEnvelope<T>` base class | `src/common/envelope/event-envelope.class.ts` | ✅ |
| `EventBase` abstract class | `src/common/envelope/event-base.class.ts` | ✅ |
| `ActorType` enum with 5 values | `src/common/envelope/actor-type.enum.ts` | ✅ |
| `SubjectBuilder.build(dto)` | `src/common/utils/subject.builder.ts` | ✅ |
| `buildSubject()` helper | Same file | ✅ |
| `generateUuidV7()` | `src/common/utils/uuid.utils.ts` | ✅ |
| `generateEventId()` | Same file | ✅ |
| `EventConsumerException` | `src/common/errors/event-consumer.exception.ts` | ✅ |
| `EventLoggerService` | `src/logging/event-logger.service.ts` | ✅ |
| `createEvent` factory | Not yet implemented — forward-looking | ✅ Acceptable |
| `ProducerService`/`@EmitEvent()` | Not yet implemented — forward-looking | ✅ Acceptable |
| `ConsumerService`/`@OnEvent()` | Not yet implemented — forward-looking | ✅ Acceptable |
| `RequestReplyService` | Not yet implemented — forward-looking | ✅ Acceptable |
| `SqliteOutboxService`/`OutboxModule` | Not yet implemented — forward-looking | ✅ Acceptable |

**Minor gap**: `nowIso()` is exported from `src/index.ts` but not mentioned in README. This is a minor utility — no fix required.

**Conclusion**: No changes needed to README.md — it is complete and accurate.

---

## Step 15: Git Commit

**Action**: Verify working tree state. If any changes were made, commit them.

If no changes were made (expected outcome), the working tree should be clean.

**Commands** (only if changes exist):
```powershell
git add README.md
git commit -m "docs: final review of README.md — verified all sections against source code"
```

---

## Summary

| Step | File | Action | Expected Changes |
|------|------|--------|-----------------|
| 1 | README.md §1 | Review identity/overview | None |
| 2 | README.md §2 | Review installation | None |
| 3 | README.md §3 | Review core concepts | None |
| 4 | README.md §4.1-4.2 | Review setup & event definition | None |
| 5 | README.md §4.3 | Review producer examples | None |
| 6 | README.md §4.4 | Review consumer examples | None |
| 7 | README.md §4.5 | Review logging examples | None |
| 8 | README.md §4.6-4.7 | Review request-reply & outbox | None |
| 9 | README.md §4.8-4.9 | Review subject builder & factory | None |
| 10 | README.md §5 | Review architecture | None |
| 11 | README.md §6 | Review AI agent guidelines | None |
| 12 | README.md §7 | Review development & related docs | None |
| 13 | docs/ | Verify convention doc placement | None |
| 14 | README.md | Cross-reference all claims vs code | None |
| 15 | — | Git commit (if any changes) | None expected |

**Conclusion**: Both README.md and docs/event-messaging-convention.md are in a correct and complete state. The docs-specialist already updated the README during Task 5, and the convention document has been correctly placed since the project was initialized. No code or documentation changes are required. The TODO file's reference to `event-convention.md` is a typo — the actual file `event-messaging-convention.md` is the authoritative name used consistently throughout the project.
