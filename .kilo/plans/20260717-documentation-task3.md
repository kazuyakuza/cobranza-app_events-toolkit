# Plan — Task 3: Update Documentation (v0.12.0)

**TODO:** `.agent/todos/20260716/20260716-todo-2.md` — Task 3
**Global plan:** `.kilo/plans/20260717-relax-envelope-and-global-events.md`
**Branch:** `feat/relax-envelope-validation-and-global-events`
**Date:** 2026-07-17
**Scope:** Documentation only. No `src/` source changes. No tests.

---

## Pre-Analysis

### Current State (verified)

Tasks 1 & 2 are `[DONE]`. The codebase and existing docs already contain the new symbols and partial global-event documentation:

- `docs/event-messaging-convention.md` — already updated (Task 2 4.4): §2 Global Subject Format, §3.2 Global Event Envelope, §5 actor_id conditional requirements, field table.
- `docs/ai-agent-guidelines.md` — already updated (Task 2 4.4): Quick Reference table has tenant + global subject rows; Creating Event Class shows `GlobalEventBase`; Publishing §Option 3 global; Validation Checklist + Common Mistakes + Public API Quick Reference all updated.
- `CHANGELOG.md` — top entry is `[0.11.6]`; **NO `[0.12.0]` section exists yet** (version was bumped in `package.json` to `0.12.0` per Step 3, but CHANGELOG not yet written).
- `README.md` — still describes ONLY tenant events: Core Concepts envelope example has `company_id`; "Tenant isolation" still listed; Event Context interface shows `companyId` mandatory; no mention of `GlobalEventEnvelope`/`createGlobalEvent`/global subjects; Related Documentation lacks the new doc.
- `.agent/project-info/architecture.md` — §7 Cross-Cutting Concerns still says "`company_id` mandatory in every event envelope." (now false); §6 Entry Points list lacks new symbols (`GlobalEventEnvelope`, `GlobalEventBase`, `GlobalEventContext`, `BaseEventEnvelope`, `BaseEventContext`, `AnyEventEnvelope`, `AnyEventContext`, `EventScope`, `IsOptionalForSystemActors`, `BuildGlobalSubjectDto`, `buildGlobalSubject`, `buildGlobalResponseSubject`, `isGlobalSubject`, `createGlobalEvent`); component tree `common/envelope/` does not list the new files; `common/dto/` only lists `build-subject.dto.ts`.
- `.agent/project-info/brief.md` — §4 Folder Structure: `common/envelope/` lists only `event-envelope.class.ts`, `actor-type.enum.ts`, `event-base.class.ts`, `validators/`; `common/dto/` lists only `build-subject.dto.ts`; `Common/dto` and `utils` do not mention global variants.
- `.agent/project-info/CONTEXT.md` — current focus still says "Fix push consumer missing deliver_subject (v0.11.4)"; no v0.12.0 update.

### Verified Public API (from `src/common/envelope/index.ts`, subject builder, producer)

Tenant: `EventEnvelope`, `EventBase`, `EventContext`, `BuildSubjectDto`, `SubjectBuilder`, `buildSubject`, `createEvent`.
Global: `GlobalEventEnvelope`, `GlobalEventBase`, `GlobalEventContext`, `BuildGlobalSubjectDto`, `buildGlobalSubject`, `createGlobalEvent`, `isGlobalSubject`, `buildGlobalResponseSubject`, `ProducerService.emitGlobal`.
Shared: `BaseEventEnvelope`, `BaseEventContext`, `AnyEventEnvelope`, `AnyEventContext`, `isGlobalEnvelope`, `isGlobalContext`, `EventScope`, `ActorType`, `IsOptionalForSystemActors`.
Subject formats: tenant `company.{company_id}.{domain}.{entity}.{action}.v{version}`; global `global.{domain}.{entity}.{action}.v{version}`.
`EmitGlobalOptions<T> = { subject: string; data: T; context: GlobalEventContext }`.
Type guards: `isGlobalEnvelope(envelope)` = `!('company_id' in envelope)`; `isGlobalContext(context)` = `!('companyId' in context)`.

### Design Decisions

1. **New dedicated doc:** `docs/global-events.md` as the canonical decision guide. Existing convention/guidelines docs already have global content (cross-link TOC anchor: `### Global Subject Format`, `### 3.2 Global Event Envelope`). The new doc consolidates the *decision* logic (when to use which) and the comparison tables, then links outward — avoids duplicating code examples already in `ai-agent-guidelines.md`.
2. **No duplication:** The new doc references (does not re-author) the code examples already present in `ai-agent-guidelines.md` §Creating/Publishing and `event-messaging-convention.md` §3. It owns only the decision tree + comparison tables + the global-specific consumer/outbox examples that are NOT yet present anywhere.
3. **CHANGELOG v0.12.0** covers all three tasks (Tasks 1, 2, 3). Uses Keep a Changelog categories: `Added`, `Changed`, `Documentation`. Task 3's doc work is filed under `Documentation`. No `Fixed`/`Removed` needed.
4. **README** updates are minimal and additive: Core Concepts envelope note, Event Context optional-fields note, a new "Global Events (tenant-less)" subsection under Core Concepts, Related Documentation link, and correcting rule #5 in "Guidelines for AI Agents" (tenant isolation no longer universal).
5. **architecture.md** §7 corrected to state tenant isolation applies to *tenant* envelopes, with global envelopes bypassing it by design. §6 entry points list extended additively. Component tree `common/envelope/` and `common/dto/` extended with new files.
6. **brief.md** §4 Folder Structure extended additively to reflect new files actually present in `src/`.
7. **CONTEXT.md** updated as part of this documentation task (it is a project-info doc) to reflect current v0.12.0 focus. This is consistent with the global plan §4.4 "Documentation" scope which permits project-info docs.
8. **Cross-links:** Both directions. New `docs/global-events.md` links to all related docs; each related doc gets a single pointer line to `docs/global-events.md`.
9. All markdown files in `docs/` > 100 lines already have a TOC; `docs/global-events.md` will likewise start with a TOC.

### Scope Boundaries

- IN: `docs/global-events.md` (new), `CHANGELOG.md`, `README.md`, `docs/event-messaging-convention.md` (cross-link only — already complete), `docs/ai-agent-guidelines.md` (cross-link only — already complete), `docs/request-reply-patterns.md` (cross-link only), `docs/outbox-usage-guidelines.md` (cross-link only), `.agent/project-info/architecture.md`, `.agent/project-info/brief.md`, `.agent/project-info/CONTEXT.md`.
- OUT: any `src/` file, any test, `package.json` (already bumped), `docs/testing-utilities.md` (no global-event mock surface changes required for this task's scope; if a cross-link is desired it is optional and lower priority — included as optional step), `docs/examples/` (no new runnable example required by Task 3; the convention step already has code snippets).

---

## Implementation Steps

### Step 0 — Pre-flight verification

0.1. Run `git status` and confirm the working tree has the committed Tasks 1 & 2 changes on branch `feat/relax-envelope-validation-and-global-events`. No uncommitted work expected.
0.2. Confirm the files listed in "Current State" match what is on disk (re-read before editing each file — "Check Context Generated File Content" rule). Implementer MUST re-read each file's current content immediately before editing it to obtain exact `oldString`/line numbers.
0.3. Read `.gitignore` and run `git status` after each commit to ensure no gitignored files are staged.

---

### Step 1 — Create `docs/global-events.md` (new file)

**Path:** `docs/global-events.md`  
**No line limit** (docs are exempt), but keep well-structured. Must have TOC (>100 lines).

Structure (exact sections and anchors):

```
# Global Events — When to Use Tenant vs Global Envelopes

> Decision guide for AI agents and developers.

## Table of Contents
- [TL;DR](#tldr)
- [Decision Tree](#decision-tree)
- [What Is a Tenant Event?](#what-is-a-tenant-event)
- [What Is a Global Event?](#what-is-a-global-event)
- [When to Use Global Events](#when-to-use-global-events)
- [When to Use Tenant Events](#when-to-use-tenant-events)
- [Subject Format Comparison](#subject-format-comparison)
- [Envelope Field Comparison](#envelope-field-comparison)
- [Actor Type Requirements](#actor-type-requirements)
- [Producing Global Events](#producing-global-events)
- [Consuming Global Events](#consuming-global-events)
- [Global Events and the Outbox](#global-events-and-the-outbox)
- [Global Events and Request-Reply](#global-events-and-request-reply)
- [Type Guards](#type-guards)
- [Common Mistakes](#common-mistakes)
- [Related Documentation](#related-documentation)
```

Content requirements per section (implementer writes verbatim, NOT placeholders):

1. **TL;DR** — one paragraph + a 2-row mini table: Tenant → `EventEnvelope`, `company_id` required, subject `company.*`; Global → `GlobalEventEnvelope`, `company_id` omitted, subject `global.*`.

2. **Decision Tree** — text-based ASCII flowchart (NOT markdown checklists). Exactly:
   ```
   Start: Does the entity dataset belong to a single tenant?
   ├─ YES → Can the operation be meaningful without a tenant?
   │        ├─ NO  → Use a TENANT event (EventEnvelope / EventBase / createEvent)
   │        └─ YES → Use a TENANT event (tenant context is still required for isolation)
   └─ NO  → Is the entity itself a tenant-scoping boundary (company, user, role)?
            ├─ YES → Use a GLOBAL event (GlobalEventEnvelope / GlobalEventBase / createGlobalEvent)
            └─ NO  → Is it a system-wide config or cross-tenant aggregate query?
                     ├─ YES → Use a GLOBAL event
                     └─ NO  → Revisit; default to TENANT until proven otherwise
   ```

3. **What Is a Tenant Event?** — paragraph: scoped to one `company_id`, subject `company.{company_id}.{domain}.{entity}.{action}.v{version}`, enforced isolation, default for most business operations. Link: `ai-agent-guidelines.md#step-by-step-creating-a-new-event-class`.

4. **What Is a Global Event?** — paragraph: tenant-less, `company_id` omitted, subject `global.{domain}.{entity}.{action}.v{version}`, intentional bypass of tenant isolation; consumers must enforce their own authorization. Link: `event-messaging-convention.md#global-subject-format`.

5. **When to Use Global Events** — bullet list with concrete examples (each one line):
   - Creating cross-tenant entities: `iam.company.created`, `iam.user.created`, `iam.role.created`.
   - System-wide configuration changes: `config.feature-flag.toggled`, `system.config.updated`.
   - Cross-tenant aggregate queries performed with system-wide privileges: `iam.company.lookup.completed`.

6. **When to Use Tenant Events** — bullet list:
   - Most business operations: payments, debts, bank statements, notifications, client updates.
   - Any action owned by a single `company_id`, even initiated by a `system` actor.
   - Request-reply flows scoped to a tenant.

7. **Subject Format Comparison** — markdown table:

   | Scope | Format | Example | Builder |
   |-------|--------|---------|---------|
   | Tenant | `company.{company_id}.{domain}.{entity}.{action}.v{version}` | `company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1` | `SubjectBuilder.build()` / `buildSubject()` |
   | Global | `global.{domain}.{entity}.{action}.v{version}` | `global.iam.company.created.v1` | `SubjectBuilder.buildGlobal()` / `buildGlobalSubject()` |
   | Platform (infra) | `platform.service.{action}.v{version}` | `platform.service.register.v1` | (discovery module) |

   Add one note line: `global.*` must NOT be confused with `platform.*` subjects — platform is for discovery infrastructure only (see `event-messaging-convention.md#22-platform-event-subjects`).

8. **Envelope Field Comparison** — markdown table comparing the JSON fields:

   | Field | Tenant (`EventEnvelope`) | Global (`GlobalEventEnvelope`) | Shared (`BaseEventEnvelope`) |
   |-------|---------------------------|--------------------------------|------------------------------|
   | `id` | required | required | shared |
   | `type`, `version`, `produced_at`, `producer` | required | required | shared |
   | `company_id` | **required** (UUID v4) | **omitted** | tenant-only |
   | `actor_type` | required | required | shared |
   | `actor_id` | required for `client`/`company_user`; optional for `system`/`scheduler`/`external_api` | same rules | shared |
   | `correlation_id` | required | required | shared |
   | `causation_id`, `trace_id`, `reply_to` | optional | optional | shared |
   | `data` | required (typed `T`) | required (typed `T`) | shared |

   Add note: "Do NOT use a placeholder UUID for `company_id` in global events — omit it entirely."

9. **Actor Type Requirements** — table reproduced from `event-messaging-convention.md#actor-id-requirements` verbatim (a copy is justified here because this doc is the decision hub). Columns: Actor Type / `actor_id` Required? / Notes. Rows: `client` (Yes), `company_user` (Yes), `system` (No), `scheduler` (No), `external_api` (No). Note line: "Enforced via `@IsOptionalForSystemActors()` exportable decorator."

10. **Producing Global Events** — two code snippets (write verbatim, accurate to verified API):

   Snippet A (factory + `publish`):
   ```typescript
   import {
     createGlobalEvent, SubjectBuilder, ActorType, GlobalEventContext,
   } from '@cobranza-apps/events-toolkit';

   class IamService {
     constructor(private readonly subjectBuilder: SubjectBuilder) {}

     async createCompany(name: string): Promise<void> {
       const subject = this.subjectBuilder.buildGlobal({
         domain: 'iam', entity: 'company', action: 'created', version: '1',
       });
       const context: GlobalEventContext = {
         type: 'iam.company.created',
         version: '1.0.0',
         producer: 'iam-service',
         actorType: ActorType.SYSTEM,
         correlationId: '987fcdeb-51a2-43e8-9c4f-123456789abc',
       };
       const event = createGlobalEvent({ name }, context);
       await this.producerService.publish(subject, event);
     }
   }
   ```

   Snippet B (`emitGlobal` convenience):
   ```typescript
   await this.producerService.emitGlobal({
     subject,
     data: { name },
     context: {
       type: 'iam.company.created', version: '1.0.0', producer: 'iam-service',
       actorType: ActorType.SYSTEM, correlationId,
     },
   });
   ```

   Note: "Decorator-based: use `@EmitEvent(..., { scope: EventScope.GLOBAL })` to auto-route via `ProducerService.emitGlobal()`."

11. **Consuming Global Events** — snippet for `@OnEvent` with `GlobalEventEnvelope`:
   ```typescript
   import { OnEvent, GlobalEventEnvelope } from '@cobranza-apps/events-toolkit';

   class CompanyCreatedConsumer {
     @OnEvent('iam.company.created', {
       version: '1',
       description: 'Handles company creation events',
       payloadExample: { companyId: 'uuid', name: 'Acme' },
     })
     async onCompanyCreated(event: GlobalEventEnvelope<CompanyCreatedData>): Promise<void> {
       // No event.company_id — global envelopes omit it by design.
       await this.provisionTenant(event.data);
     }
   }
   ```
   Note: "Consumers of global events MUST enforce their own authorization — the toolkit cannot enforce tenant isolation on tenant-less subjects."

12. **Global Events and the Outbox** — short snippet using `OutboxService.saveToOutbox` with a global envelope built via `createGlobalEvent` (referenced). One-liner: "Pass any `AnyEventEnvelope` to `saveToOutbox`; the outbox stores and republishes both tenant and global envelopes unchanged." Link `outbox-usage-guidelines.md`.

13. **Global Events and Request-Reply** — one paragraph: global request-reply uses `GlobalEventContext` (no `companyId`), `buildGlobalSubject()` for request/response subjects, and `buildGlobalResponseSubject()` to derive `.response` suffixed global subjects. `RequestReplyService.sendRequest()` detects `isGlobalContext(context)` internally and builds the right envelope. Link `request-reply-patterns.md`.

14. **Type Guards** — snippet:
   ```typescript
   import { AnyEventEnvelope, isGlobalEnvelope, AnyEventContext, isGlobalContext } from '@cobranza-apps/events-toolkit';

   function handle(envelope: AnyEventEnvelope) {
     if (isGlobalEnvelope(envelope)) {
       // narrowed to GlobalEventEnvelope
     } else {
       // narrowed to EventEnvelope
     }
   }
   ```
   Note: detection is `!('company_id' in envelope)` / `!('companyId' in context)` — do not rely on extra discriminator fields.

15. **Common Mistakes** — table (rows):
   | # | Mistake | Fix |
   |---|---------|-----|
   | 1 | Sending a placeholder `company_id` for a global event | Omit `company_id`; use `GlobalEventEnvelope` / `createGlobalEvent` |
   | 2 | Uses `buildSubject()` for a global subject | Use `buildGlobalSubject()` / `SubjectBuilder.buildGlobal()` |
   | 3 | Consume global events assuming tenant isolation | Global consumers MUST enforce their own authorization |
   | 4 | Use `EventEnvelope` type for a global consumer | Use `GlobalEventEnvelope<T>` (or `AnyEventEnvelope<T>` + `isGlobalEnvelope`) |
   | 5 | Set `actor_id` unnecessarily for `system` actor | Optional for `system`/`scheduler`/`external_api` |

16. **Related Documentation** — bullet list with relative links:
   - `event-messaging-convention.md` (wire format spec)
   - `ai-agent-guidelines.md` (step-by-step)
   - `request-reply-patterns.md` (request-reply)
   - `outbox-usage-guidelines.md` (outbox)
   - `outbox-transactional-usage.md` (transactional outbox)
   - `nats-jetstream-configuration.md` (stream config)
   - `../README.md#core-concepts` (overview)
   - `../.agent/project-info/architecture.md` (architecture)

---

### Step 2 — Update `CHANGELOG.md`

**Path:** `CHANGELOG.md`  
**Action:** Insert a new `## [0.12.0] — 2026-07-17` section immediately after the file header (after line 7: the blank line following the SemVer sentence), i.e. ABOVE the existing `## [0.11.6]` entry.

Structure (exact):

```markdown
## [0.12.0] — 2026-07-17

### Added

- **`GlobalEventEnvelope<T>`** — a tenant-less event envelope variant that omits `company_id` entirely. Intended for operations not scoped to a single tenant (`company`/`user`/`role` lifecycle, system-wide configuration, cross-tenant aggregate queries). Constructed via `createGlobalEvent()` factory or `GlobalEventBase<T>` abstract class. See `docs/global-events.md`.
- **`GlobalEventContext`** — the context variant paired with `GlobalEventEnvelope` (no `companyId`). Pair with `isGlobalContext()` type guard.
- **Shared envelope/context bases** — `BaseEventEnvelope<T>` and `BaseEventContext` now hold all common fields; `EventEnvelope<T>`/`EventContext` extend them with `company_id`/`companyId`, `GlobalEventEnvelope<T>`/`GlobalEventContext` extend them without it. Full backward compatibility for existing `EventEnvelope` consumers.
- **Union types and type guards** — `AnyEventEnvelope<T>`, `AnyEventContext`, `isGlobalEnvelope(envelope)`, `isGlobalContext(context)` exported for code that must accept either variant.
- **`EventScope` enum** — `TENANT` / `GLOBAL` discriminator used by `@EmitEvent` / `@OnEvent` metadata to drive tenant vs global subject routing.
- **`@IsOptionalForSystemActors()` custom validator** — exported decorator. Makes `actor_id` optional for `system`, `scheduler`, and `external_api` actor types, while keeping it required (non-empty string) for `client` and `company_user`. Reusable on consumer-side DTOs.
- **Global subject support** — `BuildGlobalSubjectDto`, `SubjectBuilder.buildGlobal()`, `buildGlobalSubject()`, `isGlobalSubject()`, and `buildGlobalResponseSubject()` produce/inspect subjects in the format `global.{domain}.{entity}.{action}.v{version}`.
- **`ProducerService.emitGlobal(options)`** — convenience method that builds a `GlobalEventEnvelope` from an `EmitGlobalOptions<T>` (`{ subject, data, context: GlobalEventContext }`) and publishes it. `ProducerService.publish()` now accepts `AnyEventEnvelope<unknown>`.
- **`createGlobalEvent()` factory** — returns a populated `GlobalEventEnvelope<T>` from a payload + `GlobalEventContext` (mirrors `createEvent()`).

### Changed

- **`EventEnvelope.actor_id` is now optional for `system`, `scheduler`, and `external_api` actor types.** Previously required (non-empty string) for every actor type. `actor_id` remains required for `client` and `company_user`. Enforced via `@IsOptionalForSystemActors()`. This is a relaxation, not a breaking change — existing envelopes that provide `actor_id` for automated actors continue to validate.
- **`EventContext.actorId` is now optional** (`actorId?: string`) to mirror the envelope. `EventContext.actorId` only required when `actorType` is `client` or `company_user`.
- **Consumer-side validation now dispatches by subject prefix.** `JetStreamConsumerService` and `ConsumerService` validate against `GlobalEventEnvelope` for `global.*` subjects and `EventEnvelope` for `company.*` subjects. Validation logic extracted into a dedicated utility to stay within the 200-line file limit.
- **`OutboxService` accepts `AnyEventEnvelope`** — both tenant and global envelopes can be saved and republished.
- **`RequestReplyService` supports global contexts** — `sendRequest()`/`sendResponse()` detect `isGlobalContext(context)` and build the matching envelope variant via `buildGlobalEnvelope()`.

### Documentation

- New guide: `docs/global-events.md` — canonical decision guide (decision tree, comparison tables, code examples) for choosing tenant (`EventEnvelope`) vs global (`GlobalEventEnvelope`) events. Cross-linked from convention, AI-agent guidelines, request-reply, and outbox docs.
- Updated `docs/event-messaging-convention.md` §2 (Global Subject Format), §3.2 (Global Event Envelope), §5 (`actor_id` conditional requirements via `@IsOptionalForSystemActors()`), and field table.
- Updated `docs/ai-agent-guidelines.md`: Quick Reference rules, global event class/example, validation checklist, common mistakes, and Public API Quick Reference rows for the new exports.
- Updated `README.md` Core Concepts and "Guidelines for AI Agents" rule #5 (tenant isolation no longer universal for all envelopes).
- Refreshed `.agent/project-info/architecture.md` cross-cutting concerns and entry points; `.agent/project-info/brief.md` folder structure; `.agent/project-info/CONTEXT.md` focus.
```

Do NOT modify any other section of `CHANGELOG.md`.

---

### Step 3 — Update `docs/event-messaging-convention.md` (cross-link only)

**Path:** `docs/event-messaging-convention.md`  
Content already complete from Task 2. Add ONE cross-link reference at the end of the existing **Global Subject Format** subsection (right after the line `Use `SubjectBuilder.buildGlobal()` or `buildGlobalSubject()` to construct global subjects — never concatenate strings manually.` — currently around line 79, before the `> **Platform subjects** ...` blockquote).

Insert a new line:
```markdown
> **Decision guide:** For help choosing between tenant and global envelopes, see [Global Events — When to Use Tenant vs Global Envelopes](global-events.md).
```

Do NOT modify any other content.

---

### Step 4 — Update `docs/ai-agent-guidelines.md` (cross-link only)

**Path:** `docs/ai-agent-guidelines.md`  
Content already complete from Task 2. Add ONE cross-link pointer.

In the "See Also" section at the end (after line 524, the last bullet `NATS JetStream Configuration`), add a new bullet:
```markdown
- [Global Events — When to Use Tenant vs Global Envelopes](global-events.md) — Decision guide, comparison tables, and code examples for tenant vs global envelopes
```

Additionally, in the **Quick Reference: Convention Rules** subsection, append a single pointer row OR (preferred, less invasive) add a one-line note directly under the table (after line 39, the tenant isolation row). Insert after the table:
```markdown

> **Decision guide:** see [`global-events.md`](global-events.md) for when to use `EventEnvelope` vs `GlobalEventEnvelope`.
```

Do NOT alter existing rows or any other content.

---

### Step 5 — Update `docs/request-reply-patterns.md` (cross-link only)

**Path:** `docs/request-reply-patterns.md`  
Read the file first to locate the natural insertion point (top of file or first H2). Add a short callout near the top, just after the document title/intro:
```markdown
> **Global request-reply:** Global (tenant-less) request-reply flows use `GlobalEventContext`, `buildGlobalSubject()`, and `buildGlobalResponseSubject()`. See [Global Events — When to Use Tenant vs Global Envelopes](global-events.md#global-events-and-request-reply).
```
If the file already mentions global events, skip this insertion to avoid duplication — verify before editing. Only add the single callout block; do not rewrite existing sections.

---

### Step 6 — Update `docs/outbox-usage-guidelines.md` (cross-link only)

**Path:** `docs/outbox-usage-guidelines.md`  
Read the file first. Add a short callout near the top, just after the intro:
```markdown
> **Global events:** `OutboxService.saveToOutbox()` accepts both tenant (`EventEnvelope`) and global (`GlobalEventEnvelope`) envelopes. See [Global Events — When to Use Tenant vs Global Envelopes](global-events.md#global-events-and-the-outbox).
```
If global-event content already exists, skip; only add the single callout.

---

### Step 7 — Update `README.md`

**Path:** `README.md`

7.1. **Core Concepts → Event Envelope** (around lines 113–141): after the JSON example + "Key fields" list, add a highlighted note:
```markdown
> The toolkit also provides a tenant-less variant, `GlobalEventEnvelope<T>`, which omits `company_id` entirely for operations not scoped to a single tenant (company/user/role lifecycle, system-wide config). See [Global Events](docs/global-events.md).
```

7.2. **Core Concepts → Event Context** (around lines 183–201): the `EventContext` interface listing still shows `companyId: string` as mandatory and `actorId: string` as mandatory. Add a note directly after the interface code block:
```markdown
> `EventContext.companyId` is required for tenant events. For tenant-less events use `GlobalEventContext` (no `companyId`). `actorId` is optional for `system`, `scheduler`, and `external_api` actor types; required only for `client` and `company_user`. See [Global Events](docs/global-events.md).
```

7.3. **Core Concepts → Subject Naming Convention** (around lines 144–168): after the existing tenant examples list and before the "For **Request then Async Response**" line, add a global subject callout:
```markdown
Global (tenant-less) subjects omit the `company_id` segment:

```text
global.{domain}.{entity}.{action}.v{version}
// e.g. global.iam.company.created.v1
```

Build with `SubjectBuilder.buildGlobal()` / `buildGlobalSubject()`. See [Global Events](docs/global-events.md) for when to use this format.
```

7.4. **Guidelines for AI Agents rule #5** (around line 809): change from
`5. **Tenant isolation**: `company_id` is mandatory in every event envelope.`
to
`5. **Tenant isolation**: `company_id` is mandatory in tenant event envelopes (`EventEnvelope`). For tenant-less operations use `GlobalEventEnvelope` (no `company_id`) and `global.*` subjects — see [Global Events](docs/global-events.md).`

7.5. **Related Documentation** (around lines 914–931): add a new bullet after the AI Agent Guidelines line:
```markdown
- [Global Events](docs/global-events.md) — When to use tenant (`EventEnvelope`) vs global (`GlobalEventEnvelope`) events
```

Do NOT rewrite the producer/consumer/outbox examples (already tenant-only; global is documented in the new doc).

---

### Step 8 — Update `.agent/project-info/architecture.md`

**Path:** `.agent/project-info/architecture.md`

8.1. **§6 Entry Points** (lines 230–267): extend the "Common — envelope, DTOs, utils, errors" block. Replace the block
```
EventEnvelope, EventBase, ActorType, EventContext
BuildSubjectDto
SubjectBuilder, buildSubject, buildResponseSubject, buildDlqSubject, RESPONSE_SUFFIX, SubjectParseResult
createEvent, generateEventId, generateUuidV7
EventConsumerException
```
with:
```
EventEnvelope, GlobalEventEnvelope, BaseEventEnvelope
EventBase, GlobalEventBase, ActorType, EventScope
EventContext, GlobalEventContext, BaseEventContext, AnyEventContext
AnyEventEnvelope, isGlobalEnvelope, isGlobalContext
IsOptionalForSystemActors
BuildSubjectDto, BuildGlobalSubjectDto
SubjectBuilder, buildSubject, buildGlobalSubject, buildResponseSubject, buildGlobalResponseSubject, buildDlqSubject, isGlobalSubject, RESPONSE_SUFFIX, SubjectParseResult
createEvent, createGlobalEvent, generateEventId, generateUuidV7
EventConsumerException
```
Add under the Producer section: `ProducerService.emit, ProducerService.emitGlobal`.

8.2. **§2 Component Tree** `common/envelope/` listing (lines 35–39): replace
```
│   │   ├── envelope/                     # Event envelope classes
│   │   │   ├── event-envelope.class.ts   # EventEnvelope<T> base class
│   │   │   ├── actor-type.enum.ts        # ActorType enum
│   │   │   ├── event-base.class.ts       # Abstract base for event types
│   │   │   └── validators/               # Custom class-validator decorators
```
with
```
│   │   ├── envelope/                     # Event envelope classes, contexts, types, scope
│   │   │   ├── base-event-envelope.class.ts  # BaseEventEnvelope<T> shared fields
│   │   │   ├── event-envelope.class.ts        # EventEnvelope<T> (adds company_id)
│   │   │   ├── global-event-envelope.class.ts # GlobalEventEnvelope<T> (no company_id)
│   │   │   ├── event-base.class.ts            # Abstract EventBase (tenant)
│   │   │   ├── global-event-base.class.ts    # Abstract GlobalEventBase (global)
│   │   │   ├── actor-type.enum.ts             # ActorType enum
│   │   │   ├── event-scope.enum.ts            # EventScope enum (TENANT/GLOBAL)
│   │   │   ├── base-event-context.interface.ts # BaseEventContext shared context
│   │   │   ├── event-context.interface.ts       # EventContext (tenant; adds companyId)
│   │   │   ├── global-event-context.interface.ts # GlobalEventContext (no companyId)
│   │   │   ├── envelope-types.ts                # AnyEventEnvelope, AnyEventContext, guards
│   │   │   ├── index.ts                          # Envelope barrel exports
│   │   │   └── validators/                       # Custom class-validator decorators (incl. IsOptionalForSystemActors)
```
Update `common/dto/` listing (line ~40) to add the global DTO:
```
│   │   ├── dto/
│   │   │   ├── build-subject.dto.ts      # BuildSubjectDto (tenant)
│   │   │   └── build-global-subject.dto.ts # BuildGlobalSubjectDto (global)
```
Note: component tree line numbers must be adjusted by the implementer after insertion; do not rely on exact line numbers.

8.3. **§7 Cross-Cutting Concerns** (line 275): replace
`- **Tenant Isolation**: `company_id` mandatory in every event envelope.`
with
```
- **Tenant Isolation**: `company_id` mandatory in **tenant** event envelopes (`EventEnvelope`). Global events (`GlobalEventEnvelope`) intentionally bypass tenant isolation for tenant-less operations (e.g. company/user/role lifecycle, system-wide config); consumers of global events MUST enforce their own authorization.
```

8.4. **§8 Related Documentation** (after line 282): add a bullet:
```
- [global-events.md](../../docs/global-events.md) — When to use tenant vs global envelopes.
```

---

### Step 9 — Update `.agent/project-info/brief.md`

**Path:** `.agent/project-info/brief.md`

9.1. **§4 Folder Structure** `common/envelope/` block (lines 53–57): replace
```
│   │   ├── envelope/
│   │   │   ├── event-envelope.class.ts
│   │   │   ├── actor-type.enum.ts
│   │   │   ├── event-base.class.ts
│   │   │   └── validators/
```
with
```
│   │   ├── envelope/
│   │   │   ├── base-event-envelope.class.ts   # Shared envelope fields
│   │   │   ├── event-envelope.class.ts         # Tenant envelope (company_id required)
│   │   │   ├── global-event-envelope.class.ts # Global envelope (no company_id)
│   │   │   ├── event-base.class.ts            # Abstract EventBase (tenant)
│   │   │   ├── global-event-base.class.ts     # Abstract GlobalEventBase (global)
│   │   │   ├── actor-type.enum.ts
│   │   │   ├── event-scope.enum.ts            # EventScope (TENANT/GLOBAL)
│   │   │   ├── base-event-context.interface.ts
│   │   │   ├── event-context.interface.ts
│   │   │   ├── global-event-context.interface.ts
│   │   │   ├── envelope-types.ts              # Union types + type guards
│   │   │   ├── index.ts
│   │   │   └── validators/                    # @IsOptionalForSystemActors, etc.
```

9.2. **§4 Folder Structure** `common/dto/` block (lines 58–60): replace
```
│   │   ├── dto/
│   │   │   └── build-subject.dto.ts
```
with
```
│   │   ├── dto/
│   │   │   ├── build-subject.dto.ts         # Tenant subject builder DTO
│   │   │   └── build-global-subject.dto.ts  # Global subject builder DTO
```

9.3. **§6 Core Components** (lines 157–167): append (additively) after the `EventEnvelope<T>` bullet:
```
- `GlobalEventEnvelope<T>`: Tenant-less envelope variant (no `company_id`); paired with `GlobalEventContext` and `global.*` subjects
- `EventScope`: `TENANT` / `GLOBAL` discriminator for decorator routing
```
And after the `SubjectBuilder.build(subjectDto: BuildSubjectDto)` bullet, add:
```
- `SubjectBuilder.buildGlobal(subjectDto: BuildGlobalSubjectDto)` + `buildGlobalSubject()` helper
- `createGlobalEvent<T>(options)`: factory for tenant-less events
- `@IsOptionalForSystemActors()`: custom validator making `actor_id` optional for `system`/`scheduler`/`external_api`
```

9.4. **§7 Subject Builder** (lines 169–216): after the existing `BuildSubjectDto` class definition and `buildSubject` usage example, append a short subsection:
```markdown

### Global Subject Builder

```ts
// src/common/dto/build-global-subject.dto.ts
export class BuildGlobalSubjectDto {
  @IsString() @IsNotEmpty() domain: string;
  @IsString() @IsNotEmpty() entity: string;
  @IsString() @IsNotEmpty() action: string;
  @IsString() @IsNotEmpty() version: string = '1';
}
```

**Usage:**

```ts
const subject = subjectBuilder.buildGlobal({
  domain: 'iam', entity: 'company', action: 'created', version: '1'
});
// => 'global.iam.company.created.v1'
```

Or using the helper function:

```ts
const subject = buildGlobalSubject({ domain: 'iam', entity: 'user', action: 'created', version: '1' });
```
```

9.5. **§11 Related Documentation** (after line 282): add a bullet:
```
- [global-events.md](../../docs/global-events.md) — When to use tenant vs global envelopes.
```

---

### Step 10 — Update `.agent/project-info/CONTEXT.md`

**Path:** `.agent/project-info/CONTEXT.md`

10.1. Replace the "## Current Work Focus" section content (currently the v0.11.4 deliver_subject focus). New content:
```markdown
## Current Work Focus

**Relax envelope validation & introduce GlobalEventEnvelope (v0.12.0).** `actor_id` is now optional for `system`/`scheduler`/`external_api` actor types via the exported `@IsOptionalForSystemActors()` validator, and a tenant-less `GlobalEventEnvelope` variant (`global.*` subjects, `GlobalEventContext`, `createGlobalEvent()`, `ProducerService.emitGlobal()`) supports cross-tenant operations. Documentation consolidated in `docs/global-events.md`.
```

10.2. In "## Recent Changes", insert a new entry at the TOP (above the 2026-07-16 v0.11.4 entry):
```markdown
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
```

10.3. Update "## Immediate Next Steps" to reflect: full test suite / typecheck / lint pass for v0.12.0; downstream consumers upgrade validation.

10.4. In "## Notes for Next Session" — no structural change; the coding rules still apply.

Do NOT delete the historical entries below the new one.

---

### Step 11 — Optional: `docs/testing-utilities.md` cross-link

**Path:** `docs/testing-utilities.md`  
Read first. If the file documents mock services and does NOT mention global envelopes, add ONE note near the producer/outbox mock section:
```markdown
> Mock services accept both tenant (`EventEnvelope`) and global (`GlobalEventEnvelope`) envelopes — they type-accept `AnyEventEnvelope` exactly like the real services.
```
Only if natural placement exists and it does not duplicate content. Lower priority — skip if it would force a rewrite.

---

### Step 12 — Verification

12.1. Re-read every modified file end-to-end and confirm:
- No broken internal markdown links (file paths exist; anchors present where used).
- No duplicated content between `docs/global-events.md` and existing docs beyond the explicitly allowed comparison tables / actor table.
- No literal `\n` escape sequences in any file (newline-prevention rule). All multi-line content uses real newlines.
- No commented-out code.
- `docs/global-events.md` has a TOC (it will exceed 100 lines).

12.2. Run validation commands (docs-only, no src changes expected to affect build):
```bash
npm run lint
npm run typecheck
npm run build
```
Expected: all pass (no source code changed). If any fails, investigate — likely a transient issue unrelated to docs; report to caller rather than modifying `src/`.

12.3. Run `git status` and confirm the changeset is limited to:
- New: `docs/global-events.md`
- Modified: `CHANGELOG.md`, `README.md`, `docs/event-messaging-convention.md`, `docs/ai-agent-guidelines.md`, `docs/request-reply-patterns.md`, `docs/outbox-usage-guidelines.md`, `.agent/project-info/architecture.md`, `.agent/project-info/brief.md`, `.agent/project-info/CONTEXT.md`
- Optional: `docs/testing-utilities.md`
No `src/` files. No `package.json`. No `package-lock.json`.

12.4. (Optional) Spot-check internal anchors resolve: search for `#global-subject-format`, `#3-2-global-event-envelope`, `#22-platform-event-subjects`, `#global-events-and-the-outbox`, `#global-events-and-request-reply` in their referenced target files.

---

### Step 13 — Commit

Single commit (all docs work is one cohesive unit):
```
git add docs/global-events.md CHANGELOG.md README.md docs/event-messaging-convention.md docs/ai-agent-guidelines.md docs/request-reply-patterns.md docs/outbox-usage-guidelines.md .agent/project-info/architecture.md .agent/project-info/brief.md .agent/project-info/CONTEXT.md
# (plus docs/testing-utilities.md if Step 11 was applied)
```
Commit message:
```
docs: add global-events guide and changelog v0.12.0

Add docs/global-events.md as the canonical decision guide for tenant vs
global envelopes (decision tree, comparison tables, code examples). Update
CHANGELOG with v0.12.0 entries covering optional actor_id, GlobalEventEnvelope,
and documentation. Refresh README Core Concepts, architecture/brief/CONTEXT
project-info, and cross-link related docs.
```
Do NOT push (push is handled by Step 5 of the Critical Workflow).

---

## File Change Summary

| # | File | Action | Key content |
|---|------|--------|-------------|
| 1 | `docs/global-events.md` | NEW | Decision guide (TOC, decision tree, comparisons, code examples, related docs) |
| 2 | `CHANGELOG.md` | EDIT (insert at top) | `## [0.12.0]` section: Added / Changed / Documentation |
| 3 | `docs/event-messaging-convention.md` | EDIT (1 cross-link) | Pointer to global-events.md decision guide |
| 4 | `docs/ai-agent-guidelines.md` | EDIT (2 cross-links) | Quick Reference note + See Also bullet |
| 5 | `docs/request-reply-patterns.md` | EDIT (1 cross-link) | Top callout to global-events.md#global-events-and-request-reply |
| 6 | `docs/outbox-usage-guidelines.md` | EDIT (1 cross-link) | Top callout to global-events.md#global-events-and-the-outbox |
| 7 | `README.md` | EDIT (5 spots) | Core Concepts envelope/context/subject notes, Rule #5 fix, Related Docs bullet |
| 8 | `.agent/project-info/architecture.md` | EDIT (3 spots) | §6 entry points, §2 component tree, §7 tenant isolation, §8 link |
| 9 | `.agent/project-info/brief.md` | EDIT (5 spots) | §4 folder structure (envelope, dto), §6 components, §7 global subject builder, §11 link |
| 10 | `.agent/project-info/CONTEXT.md` | EDIT (3 spots) | Current focus, top recent change, next steps |
| 11 (opt) | `docs/testing-utilities.md` | EDIT (1 note) | Mocks accept AnyEventEnvelope |

---

## Verification Against Original Task

Original requirement:
> ### Task 3: Update Documentation
> - Add a new /doc file (link to related docs) so an AI Agent can easily understand when to use tenant or global events.
> - Update changelog file and related documentation

Mapped coverage:
- ✅ New `/docs` file → `docs/global-events.md` (Step 1) with cross-links to related docs.
- ✅ Understand when to use tenant or global → Decision Tree section + "When to Use..." sections + comparison tables.
- ✅ Update changelog → `CHANGELOG.md` v0.12.0 (Step 2) covering Tasks 1, 2, 3.
- ✅ Related documentation → README, convention, guidelines, request-reply, outbox, architecture, brief, CONTEXT all updated/cross-linked (Steps 3–10).

Plan is correct and complete. No ambiguities.

---

## Key Design Decisions (Summary for Caller)

1. Single new consolidated decision guide (`docs/global-events.md`) rather than scattering duplication — existing convention/guidelines docs already hold the wire format details and code examples, so the new doc owns the *decision* logic and comparison tables and links outward.
2. CHANGELOG v0.12.0 uses `Added`/`Changed`/`Documentation` (no `Fixed`/`Removed`) — `actor_id` relaxation is additive, not a fix.
3. Cross-links are bidirectional and minimal (one pointer per related doc) to avoid edit churn.
4. Project-info docs (`architecture.md`, `brief.md`, `CONTEXT.md`) updated as part of the documentation task — these are .md files under `.agent/`, permitted for Plan/Docs work, and the global plan §4.4 explicitly calls for updating architecture/brief.
5. No `src/` changes; build/typecheck/lint expected to pass unchanged.