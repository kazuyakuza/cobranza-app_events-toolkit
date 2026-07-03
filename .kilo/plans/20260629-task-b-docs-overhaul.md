# Task B 4.1 — Comprehensive Documentation Overhaul (Implementation Plan)

**Source TODO:** `.agent/todos/20260629/20260629-todo-0.md` (Task 6)
**Global plan:** `.kilo/plans/20260629-refactor-decorator-options-and-docs.md`
**Branch:** `feat/refactor-decorator-options-and-docs`
**Predecessor:** Task A (decorator refactor) is `[DONE]`; decorator option interfaces now require `version` (emit/on-event), `description`, and `payloadExample`. `ManifestEntryBuilder` no longer falls back for `version`/`description`; `tags ?? []` preserved.

---

## Audit Summary

### Method
Read in full: TODO, global plan, README, CHANGELOG, all 9 in-scope `docs/*.md`, all 3 `docs/examples/*.ts`, `.agent/project-info/{brief,architecture,tech,CONTEXT}.md`, and `src/index.ts`. Sampled 20+ key `src/` exported files for JSDoc coverage (decorators, services, envelope, subject builder, manifest builder, outbox service, request-reply service, events-toolkit module, explorers, mocks, assertion helpers, options interfaces).

### Critical findings

**Stale decorator signatures (post-v0.8.0 required fields omitted):**
- README — `@EmitEvent`/`@OnEvent`/`@OnRequestReply` examples pass only `{ version: '1' }` or no options arg.
- `docs/ai-agent-guidelines.md` — same stale `{ version: '1' }` examples.
- `docs/request-reply-patterns.md` — multiple `{ version: '1' }` examples + `@OnRequestReply('credit.check.completed')` without required options; §10 option table stale.
- `docs/outbox-configuration.md` — one `{ version: '1' }` consumer example.

**Stale OLD object-based decorator signatures (removed in v0.7.x):**
- `docs/examples/async-request-reply.example.ts` — uses `@OnEvent({ domain, entity, action })` and `@OnRequestReply({ eventType })` (broken, will not compile against current public API).
- `.agent/project-info/tech.md` — "Tool Usage Patterns" shows `@EmitEvent({ domain, entity, action })` / `@OnEvent({ domain, entity, action })`.

**Missing README Quickstart:** README has no "Quickstart (for AI agents)" step-by-step checklist at the top (TODO 6.4 mandate).

**11-step onboarding flow not represented as a cohesive path:** No single navigable sequence tying architecture → install → DTO → produce → consume → request-reply → outbox → discovery → schema → testing → deployment across the doc surface.

**Missing/insufficient cross-links:** `ai-agent-guidelines.md` lacks links to outbox, discovery, and testing docs; several docs lack "See also" back-links to README quickstart.

**Stale project-info files:**
- `architecture.md` — `src/index.ts` "Entry Points" list is outdated (lists `SqliteOutboxService`, omits `OutboxService`, `EventsToolkitModule`, `RequestReplyService`, `OnRequestReply`, `buildResponseSubject`, discovery/testing exports); component tree omits discovery sub-tree, request-reply-consumer, postgres repository, testing folder.
- `tech.md` — stale old decorator signatures (above); `package.json` snippet shows `version: 0.1.0` (now 0.8.0); peerDependencies missing `@nestjs/core`.
- `brief.md` — folder structure (§4) omits `discovery/`, `testing/`, `request-reply-consumer`, `postgres-outbox`; §5/§9 reference `SqliteOutboxService` (now unified `OutboxService`); §8 uses old publish pattern. **Preserve the `<!-- DO NOT DELETE NEXT SECTION -->` block verbatim.**
- `CONTEXT.md` — "Current Work Focus" still points to request-reply patterns (Task 5); should reflect v0.8.0 refactor + docs overhaul.

**JSDoc/TSDoc coverage (src/):** Sampling shows the high-traffic public API already has thorough JSDoc (`@param`/`@returns`/`@example` where applicable): `EmitEvent`/`OnEvent`/`OnRequestReply` decorators and their `*Options`/`*Metadata` interfaces, `ProducerService`, `ManifestEntryBuilder`, `SubjectBuilder`/`buildSubject`/`buildResponseSubject`/`buildDlqSubject`, `OutboxService`, `RequestReplyService`, `EventEnvelope`/`EventContext`/`ActorType`, `EventsToolkitModule`+options interfaces, `OnEventExplorer`, `RequestReplyConsumerService`, `MockProducerService`, discovery assertion helpers. Remaining gaps to verify exhaustively (Priority 3): files not yet sampled — modules (`producer/consumer/outbox/discovery/*.module.ts`), controllers (`discovery.controller.ts`), repositories (`postgres-outbox.repository.ts`, `sqlite-outbox.repository.ts`), discovery services/utils (`discovery.service.ts`, `manifest.service.ts`, `schema-generator.ts`, `schema-persister.ts`, `service-info.resolver.ts`, `instance-id.utils.ts`, `package-info-reader.utils.ts`, `discovery-event-publisher.service.ts`), explorers (`on-request-reply.explorer.ts`), `consumer.service.ts`/`jetstream-consumer.service.ts`, `request-reply.types.ts`/`request-reply.helpers.ts`, `event-logger.service.ts` interfaces, all barrel `index.ts`, discovery DTOs, remaining mocks (`mock-consumer/outbox/request-reply/event-logger/manifest/discovery`), and `published-event`/`saved-outbox-event` interfaces.

---

## Priority 1 — Critical

### P1.1 README Quickstart section
**File:** `README.md`
- Insert immediately after the badge block (after line 8, before the `---` at line 10) a new `## Quickstart (for AI agents)` section.
- Content (literal step-by-step checklist mirroring TODO 6.4 + 11-step flow condensed):

```markdown
## Quickstart (for AI agents)

1. `npm install @cobranza-apps/events-toolkit`
2. Register NATS + subsystems in `AppModule`:
   ```ts
   EventsToolkitModule.forRoot({
     nats: { servers: ['nats://localhost:4222'] },
     discovery: { enabled: true, registerOnStartup: true, service: { name: 'payment-service', version: '1.0.0' } },
   })
   ```
3. Define an event DTO — extend `EventEnvelope<T>`, decorate every field with `class-validator`.
4. Emit: decorate a service method with `@EmitEvent('domain.entity.action', { version, description, payloadExample })`.
5. Consume: decorate a handler with `@OnEvent('domain.entity.action', { version, description, payloadExample })`.
6. Run: `npm run start`.

See the [Onboarding Flow](#onboarding-flow) section for the full 11-step path (architecture → deploy).
```

- Add a new `## Onboarding Flow` section (after Quickstart, before `## Overview` umbrella or merged into Overview) that lists the 11 steps as a numbered checklist, each linking to the doc that covers it:

```markdown
## Onboarding Flow

1. **Architecture** — NATS + JetStream, event envelope, actors, tenant isolation → [Core Concepts](#core-concepts) · [Architecture](.agent/project-info/architecture.md)
2. **Install & configure** — `EventsToolkitModule.forRoot()` → [Installation](#installation) · [Setup (Unified Module)](#setup-unified-module)
3. **Define an event DTO** — `EventEnvelope<T>` + `class-validator` → [Defining an Event](#defining-an-event)
4. **Produce an event** — `@EmitEvent()` · `ProducerService.emit()` → [Producer](#producer-publishing-events)
5. **Consume an event** — `@OnEvent()` · DLQ routing → [Consumer](#consumer-subscribing-to-events) · [Error Handling & DLQ](#error-handling--dlq)
6. **Request-reply** — `request()` / `sendRequest()` + `@OnRequestReply()` → [Request-Reply Pattern](#request-reply-pattern)
7. **Outbox** — `OutboxService.saveToOutbox()` · `sendAsyncRequestThroughOutbox()` → [Outbox Pattern](#outbox-pattern)
8. **Service discovery** — manifests · `GET /discovery/manifest` · platform events → [Discovery](#discovery)
9. **Schema generation** — auto JSON Schema from DTOs · `payloadSchemaRef` → [Event Discovery & Service Registry](docs/event-discovery-and-service-registry.md)
10. **Testing** — `EventsToolkitTestModule` · mock services · assertion helpers → [Testing Utilities](#testing-utilities)
11. **Deployment** — JetStream stream config · env vars · health checks → [Deployment](#deployment) *(new section)*
```

- Update README "Table of Contents" to include `Quickstart (for AI agents)` and `Onboarding Flow` as the first two entries.

### P1.2 Add README "Deployment" section
**File:** `README.md`
- Add a concise `## Deployment` section near the end (before `## Related Documentation`) covering:
  - JetStream stream config for event stream (`subjects: ['company.>']`, retention `limits`, `max_age` 7 days, `max_msgs_per_subject` 10000, `dedupe_window` 2min) — port from `docs/event-messaging-convention.md` §4.4.
  - DLQ stream config (`subjects: ['dlq.>']`, 30 days, 100000) — port from §4.4.
  - Platform events stream (`subjects: ['platform.service.>']`) — link to discovery doc.
  - Required environment variables: `NATS_URLS`, `SERVICE_NAME`, `SERVICE_VERSION`, `OUTBOX_DB_PATH` (SQLite) — minimal table.
  - Health checks: `GET /discovery/manifest` as liveness probe; heartbeat via `heartbeatIntervalMinutes`.
  - SQLite Docker volume reminder (link outbox-configuration.md).

### P1.3 Fix stale decorator signatures in all docs (required fields)
Apply to every `@EmitEvent`/`@OnEvent`/`@OnRequestReply` code example across docs: ensure second arg is present and includes all now-required fields (`version` for emit/on-event; `description`; `payloadExample`). `tags` optional (omit or keep).

**File: `README.md`**
- Line ~259: `@EmitEvent('payment.proof.uploaded', { version: '1' })` →
  ```ts
  @EmitEvent('payment.proof.uploaded', {
    version: '1',
    description: 'A payment proof file was uploaded',
    payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
  })
  ```
- Lines ~298–299, ~314–315: `@OnEvent('payment.proof.uploaded', { version: '1' })` → add `description` + `payloadExample`.
- Line ~463: `@OnRequestReply('credit.check.completed')` →
  ```ts
  @OnRequestReply('credit.check.completed', {
    description: 'Handles credit check completion responses',
    payloadExample: { clientId: 'uuid', score: 750, approved: true },
  })
  ```

**File: `docs/ai-agent-guidelines.md`**
- Lines ~114, ~152, ~165: replace `{ version: '1' }` examples with full required-options objects (matching README examples). Keep narrative text.
- Add a short `@OnRequestReply` step-by-step subsection (after "Consuming Events") with the required-options signature + link to `request-reply-patterns.md`.

**File: `docs/request-reply-patterns.md`**
- Lines ~229, ~419, ~497: `@OnEvent('credit.check.requested', { version: '1' })` → add `description` + `payloadExample`.
- Line ~265: `@OnRequestReply('credit.check.completed')` → add `{ description, payloadExample }`.
- §10 `@OnRequestReply(options)` table (lines ~588–592): replace with full options table including `description: string (required)`, `payloadExample: Record<string, unknown> (required)`, `tags?: string[]`, `payloadSchemaRef?: string`, `companyId?: string`. Note `version` is NOT applicable.
- §10 add a `@OnEvent`/`@EmitEvent` options reference row-set or pointer to convention §4.1 for completeness.

**File: `docs/outbox-configuration.md`**
- Line ~295: `@OnEvent('credit.check.requested', { version: '1' })` → add `description` + `payloadExample`.

### P1.4 Fix stale OLD object-based decorator signatures in examples
**File: `docs/examples/async-request-reply.example.ts`** (broken against current API)
- Line ~109: `@OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })` →
  ```ts
  @OnEvent('credit.check.requested', {
    version: '1',
    description: 'Handles incoming credit check requests',
    payloadExample: { clientId: 'uuid', fullName: 'Jane Doe' },
  })
  ```
- Line ~154: `@OnRequestReply({ eventType: 'credit.check.completed' })` →
  ```ts
  @OnRequestReply('credit.check.completed', {
    description: 'Handles credit check completion responses',
    payloadExample: { clientId: 'uuid', score: 750, approved: true },
  })
  ```
- The `DebtService.requestCreditCheck` reply-subject uses `action: 'completed'` for the reply subject — keep (preferred past-tense convention). Ensure imports still valid post-edit.

### P1.5 Update stale `.agent/project-info/` files
**File: `.agent/project-info/tech.md`**
- §4 "Tool Usage Patterns" (lines ~122–156): replace the old `@EmitEvent({ domain, entity, action })` and `@OnEvent({ domain, entity, action })` examples with the current string-first + required-options signatures (mirror README examples). Update the Outbox snippet `outboxService.saveToOutbox(eventEnvelope)` to `saveToOutbox(event, subject)`.
- §2 `package.json` snippet (lines ~46–82): update `version` to `0.8.0`; add `"@nestjs/core": "^11.1.0"` to peerDependencies; keep remaining fields current.

**File: `.agent/project-info/architecture.md`**
- §2 Component Tree (lines ~30–68): refresh to current `src/` tree — add `discovery/` sub-tree (dto, events, utils, controller, service, module, manifest.service, manifest-entry.builder, service-info.resolver, instance-id.utils, package-info-reader.utils), `consumer/request-reply-consumer.service.ts` + `request-reply-message-processor.ts`, `outbox/postgres-outbox.repository.ts` + `sqlite-outbox.repository.ts` + helpers, `testing/` folder (mocks, test module, assertion helpers), `events-toolkit.module.ts` + `events-toolkit-options.interface.ts`, `common/utils/subject.builder.ts` extended helpers. Replace `SqliteOutboxService` with unified `OutboxService`.
- §6 "Entry Points (Public API via `src/index.ts`)" (lines ~163–198): replace export list with the ACTUAL current `src/index.ts` barrel exports — `EventsToolkitModule` + options interfaces, `ProducerModule`/`ProducerService`/`EmitEvent`, `ConsumerModule`/`ConsumerService`/`JetStreamConsumerService`/`OnEvent`/`OnRequestReply`/`EventConsumerException`, `RequestReplyService` + types, `OutboxModule`/`OutboxService`/`OutboxModuleOptions`/`EntityManagerLike`/`TransactionContext`/`TypeormQueryRunnerContext`, `EventLoggerService`, `DiscoveryModule`/`DiscoveryService`/manifest+schema symbols, `EventEnvelope`/`EventBase`/`ActorType`/`EventContext`, `SubjectBuilder`/`buildSubject`/`buildResponseSubject`/`buildDlqSubject`/`RESPONSE_SUFFIX`/`DLQ_SUBJECT_PREFIX`/`SubjectParseResult`, `createEvent`/`generateEventId`/`generateUuidV7`, `EventsToolkitTestModule` + mock services + assertion helpers. Use `src/index.ts` as source of truth.

**File: `.agent/project-info/brief.md`**
- §4 Folder Structure: refresh to current tree (add discovery/, testing/, request-reply-consumer, postgres-outbox, events-toolkit.module).
- §5 Main Modules: replace `SqliteOutboxService` with `OutboxService`; mention `@OnRequestReply` and discovery.
- §8 Example Usage: update decorator/publish snippet to current string-first + required-options signature.
- §7 `BuildSubjectDto` snippet: keep (still accurate); note `buildSubject()` helper.
- **Preserve the `<!-- DO NOT DELETE NEXT SECTION -->` block and everything after it verbatim.**

**File: `.agent/project-info/CONTEXT.md`**
- Update "Current Work Focus" to: v0.8.0 decorator option refactor (required `version`/`description`/`payloadExample`) + comprehensive documentation overhaul (Task 6).
- Add v0.8.0 entry under "Recent Changes" summarizing Tasks 1–5 (from CHANGELOG) + Task 6 (docs overhaul).
- Update "Immediate Next Steps" to reflect docs overhaul completion and any follow-ups.

---

## Priority 2 — High

### P2.1 Onboarding flow representation across docs
- `docs/event-messaging-convention.md`: add a one-line "Onboarding: this document covers steps 1 (architecture) and 3 (event DTO/envelope)." at top of §1 Purpose.
- `docs/outbox-configuration.md`, `docs/outbox-usage-guidelines.md`, `docs/outbox-transactional-usage.md`: add top "Onboarding: step 7 (Outbox)" pointer line.
- `docs/event-discovery-and-service-registry.md`: add "Onboarding: steps 8 & 9 (Discovery + Schema)" pointer.
- `docs/request-reply-patterns.md`, `docs/request-reply-guidelines.md`: add "Onboarding: step 6 (Request-reply)" pointer.
- `docs/testing-utilities.md`: add "Onboarding: step 10 (Testing)" pointer.
- `docs/ai-agent-guidelines.md`: add "Onboarding: steps 3–7 condensed" pointer + a new subsection linking each step to the relevant doc.

### P2.2 Add missing cross-links ("See also")
- `docs/ai-agent-guidelines.md`: in "Public API Quick Reference", add rows for `EventsToolkitModule`, `DiscoveryModule`/`DiscoveryService`, testing utilities (`EventsToolkitTestModule`, `MockProducerService`, assertion helpers), `OutboxService`, `buildResponseSubject`/`buildDlqSubject`. Add a "See also" block at file end linking to: outbox-configuration, outbox-usage-guidelines, outbox-transactional-usage, testing-utilities, event-discovery-and-service-registry.
- `docs/outbox-transactional-usage.md`, `docs/testing-utilities.md`, `docs/outbox-usage-guidelines.md`: add reciprocal "See also" links back to README quickstart, ai-agent-guidelines, and convention where missing.
- README "Related Documentation": confirm `.agent/project-info/` links + add `Deployment` anchor and `Onboarding Flow` anchor.

### P2.3 Rewrite unclear / overly verbose sections
- `docs/request-reply-guidelines.md` "Decision Tree — Sync vs Async" flowchart: keep but ensure the §4 comment block at top of `request-reply-patterns.md` (`> For a visual decision flowchart...`) points here. No content rewrite needed (already concise).
- README "Usage" section is long; ensure each subsection opens with a one-line "what + when to use" so an agent extracts steps in <5s.
- **`@OutboxEvent()` discrepancy (IMPORTANT):** TODO §7 references a `@OutboxEvent()` decorator, but no such decorator exists in the current barrel (`src/index.ts`) or sampled source. The outbox is driven by `OutboxService` methods (`saveToOutbox`, `saveInTransaction`, `sendAsyncRequestThroughOutbox`). **Do NOT fabricate a `@OutboxEvent()` decorator.** Onboarding step 7 MUST describe the real `OutboxService` API. If the caller intended for a `@OutboxEvent()` decorator to exist, flag this as an open question rather than inventing a symbol. (Plan assumes `OutboxService` API is the correct onboarding step 7 surface.)

### P2.4 CHANGELOG update
**File:** `CHANGELOG.md`
- Add a new `## [Unreleased]` (or extend `[0.8.0]`) sub-section "### Documentation" summarizing: README Quickstart + Onboarding Flow + Deployment sections; stale decorator signature fixes across all docs + examples; onboarding-flow pointers; cross-link additions; project-info refresh (architecture/tech/brief/CONTEXT); JSDoc coverage pass. (Task A already has the `[0.8.0]` "Documentation" entry for convention + discovery docs; append the Task B doc changes.)

---

## Priority 3 — Medium

### P3.1 JSDoc/TSDoc gap sweep across `src/`
For each file below (not yet confirmed to have complete JSDoc), the implementer MUST:
1. Open the file.
2. For every exported symbol (`export class`, `interface`, `enum`, `type`, `function`, `const`, `@Injectable`), ensure a `/** ... */` block describing **what** it does and **when/how to use** it.
3. For exported methods/functions, add `@param` and `@returns` where applicable.
4. Do NOT add JSDoc to spec (`*.spec.ts`) or fixture (`*.fixture.ts`) files.
5. Preserve the project rules: no commented-out code, self-documenting names, private-by-default.

Files to verify/complete (grouped):

**Modules:**
- `src/producer/producer.module.ts`
- `src/consumer/consumer.module.ts`
- `src/outbox/outbox.module.ts`
- `src/discovery/discovery.module.ts`

**Services / controllers / repositories:**
- `src/consumer/consumer.service.ts`
- `src/consumer/jetstream-consumer.service.ts`
- `src/discovery/discovery.service.ts`
- `src/discovery/discovery.controller.ts`
- `src/discovery/manifest.service.ts`
- `src/discovery/events/discovery-event-publisher.service.ts`
- `src/outbox/postgres-outbox.repository.ts`
- `src/outbox/sqlite-outbox.repository.ts`

**Utils / helpers:**
- `src/discovery/utils/schema-generator.ts`
- `src/discovery/utils/schema-persister.ts`
- `src/discovery/service-info.resolver.ts`
- `src/discovery/instance-id.utils.ts`
- `src/discovery/package-info-reader.utils.ts`
- `src/request-reply/request-reply.types.ts`
- `src/request-reply/request-reply.helpers.ts`
- `src/outbox/outbox.utils.ts`
- `src/outbox/outbox-request-reply.helpers.ts`
- `src/outbox/outbox-request-reply.exception.ts`
- `src/outbox/outbox-logging.helpers.ts`
- `src/consumer/request-reply-message-processor.ts`
- `src/common/utils/event.factory.ts`
- `src/common/utils/uuid.utils.ts`
- `src/common/utils/date.utils.ts`
- `src/common/utils/serialization.utils.ts`
- `src/common/envelope/event-base.class.ts`
- `src/common/envelope/index.ts`
- `src/common/dto/build-subject.dto.ts`
- `src/common/errors/event-consumer.exception.ts`

**Explorers:**
- `src/consumer/decorators/on-request-reply.explorer.ts`
- `src/consumer/decorators/on-event-explorer-deps.interface.ts`
- `src/consumer/decorators/on-request-reply-explorer-deps.interface.ts`

**Discovery DTOs / interfaces:**
- `src/discovery/dto/*.ts` (manifest DTOs)
- `src/discovery/events/discovery-payloads.interface.ts`
- `src/discovery/events/platform-event-subjects.ts`
- `src/discovery/service-info.interface.ts`
- `src/discovery/service-info-overrides.interface.ts`
- `src/discovery/manifest-deps.interface.ts`
- `src/discovery/discovery-service-options.interface.ts`
- `src/discovery/utils/schema-types.interface.ts`
- `src/discovery/utils/schema-generator-options.interface.ts`

**Outbox / consumer / request-reply interfaces:**
- `src/outbox/*.interface.ts` (transaction-context, save-in-transaction-params, send-async-request-*, outbox-service-options, outbox-service-deps, outbox-error-context-params, async-request-event-context)
- `src/outbox/outbox.types.ts`
- `src/consumer/*.interface.ts` (subscribe-options, move-to-dlq-options, dispatch-options, register-handler-options, request-reply-consumer-deps, jetstream-consumer-deps)
- `src/request-reply/index.ts` and barrel re-export shape

**Logging:**
- `src/logging/event-logger.service.ts` (interfaces `EventLoggerOptions`, `EventLogContext`, etc. — confirm doc blocks)

**Barrel `index.ts` files:**
- `src/common/index.ts`
- `src/consumer/index.ts`
- `src/producer/index.ts`
- `src/outbox/index.ts`
- `src/discovery/index.ts`
- `src/discovery/utils/index.ts`
- `src/logging/index.ts`
- `src/request-reply/index.ts`
- `src/testing/index.ts`
- Confirm each barrel has a `@packageDocumentation` block (like `src/index.ts`) describing its re-export scope.

**Testing mocks + helpers + interfaces:**
- `src/testing/mock-consumer.service.ts`
- `src/testing/mock-outbox.service.ts`
- `src/testing/mock-request-reply.service.ts`
- `src/testing/mock-event-logger.service.ts`
- `src/testing/mock-manifest.service.ts`
- `src/testing/mock-discovery.service.ts`
- `src/testing/mock-discovery-event-publisher.service.ts`
- `src/testing/events-toolkit-test.module.ts`
- `src/testing/events-toolkit-test-options.interface.ts`
- `src/testing/assertion.helpers.ts`
- `src/testing/published-event.interface.ts`
- `src/testing/saved-outbox-event.interface.ts`

**Acceptance for P3:** After the sweep, running `grep -rE '^export (class|interface|enum|type|function|const)' src/ --include='*.ts' | grep -v spec` and sampling 30 random results should show every line is immediately preceded by (or adjacent to) a JSDoc block. Any gap found by code review (B.3) is a fix-item.

---

## Execution Notes for Implementer (B.2)

### Order
P1.1 → P1.2 → P1.3 (README) → P1.4 (example) → P1.5 (project-info) → P2.1–P2.4 → P3.1.

### Commit grouping (suggested messages)
1. `docs: add README Quickstart, Onboarding Flow, and Deployment sections`
2. `docs: fix stale decorator signatures with required fields across all docs and examples`
3. `docs: refresh stale .agent/project-info architecture/tech/brief/context files`
4. `docs: add onboarding-flow pointers and cross-links across docs surface`
5. `docs: sweep JSDoc coverage on exported src/ symbols`
6. `docs: update changelog for v0.8.0 documentation overhaul`

### Verification commands (after each commit group)
- `npm run build` — ensure doc-level TS examples do not break compilation (they are `// @ts-nocheck` but verify no source touched).
- `npm run lint` — keep Prettier/ESLint clean for any touched `src/` JSDoc.
- `npm test` — no behavioral source changes; tests must remain green.

### Constraints
- Do NOT modify source logic. JSDoc additions only. Do not rename, restructure, or move exported symbols.
- Do NOT invent a `@OutboxEvent()` decorator if it does not exist. Use the actual `OutboxService` API for onboarding step 7. If the TODO implies `@OutboxEvent()` exists, flag to caller (Plan Agent) rather than fabricating.
- Preserve `.agent/project-info/brief.md` `<!-- DO NOT DELETE NEXT SECTION -->` block verbatim.
- `docs/how-to-set-up-git.md` and `docs/how-to-write-todo-files.md` are explicitly excluded (TODO 6.1).
- Git merge / branch finalization handled in Step 5 (TODO File Completion), not B.1.

---

## Definition of Done Checklist (mapped)

- [ ] `EmitEventOptions`, `OnEventOptions`, `OnRequestReplyOptions` have required fields — **done in Task A** (verify untouched).
- [ ] `ManifestEntryBuilder` no longer falls back for `version`/`description` — **done in Task A** (verify untouched).
- [ ] `ManifestEntryBuilder` still falls back for `tags` — **done in Task A** (verify untouched).
- [ ] All decorator spec tests pass — **done in Task A** (verify `npm test` green).
- [ ] No TypeScript compilation errors — verify `npm run build` after doc/JSDoc changes.
- [ ] `ManifestEntryBuilder` has test coverage — **done in Task A**.
- [ ] Refactor-specific doc updates applied to both `.md` files — **done in Task A** (convention §4.1 + discovery annotations). **B does not undo these.**
- [x Plan only] All documentation files (README, docs/, .agent/project-info/) audited — audit complete; fixes scheduled in P1/P2.
- [ ] Onboarding flow from 6.2 clearly represented across the documentation surface — P1.1 (README Quickstart + Onboarding Flow), P2.1 (per-doc step pointers).
- [ ] `README.md` has a **Quickstart** section at top with literal step-by-step checklist — P1.1.
- [ ] Every exported symbol in `src/` has JSDoc with `@param`/`@returns` — P3.1 (gap sweep on unconfirmed files; high-traffic public API already confirmed).

---

## Out of Scope / Not Done by This Plan

- No source-code logic changes (only JSDoc additions in `src/`).
- No new tests (JSDoc-only changes require no new specs).
- `docs/how-to-set-up-git.md` and `docs/how-to-write-todo-files.md` — explicitly excluded by TODO 6.1.
- Git merge / branch finalization — handled in Step 5 (TODO File Completion), not B.1.

---

## Open Question for Caller (Plan Agent)

The TODO §7 onboarding step references `@OutboxEvent()` as part of the Outbox step. No `@OutboxEvent()` decorator exists in `src/index.ts` or sampled source — the outbox is exposed via `OutboxService` methods. **Recommendation:** the docs should describe the real `OutboxService` API (`saveToOutbox`, `saveInTransaction`, `sendAsyncRequestThroughOutbox`) for onboarding step 7, not a non-existent decorator. If a `@OutboxEvent()` decorator is intended to be built as a separate task, that belongs in a new TODO, not in this docs overhaul.