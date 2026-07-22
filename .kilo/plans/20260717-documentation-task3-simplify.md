# Simplification Plan — Task 3 Documentation

**TODO:** `.agent/todos/20260716/20260716-todo-2.md` — Task 3  
**Original plan:** `.kilo/plans/20260717-documentation-task3.md`  
**Branch:** `feat/relax-envelope-validation-and-global-events`  
**Date:** 2026-07-17

---

## Summary

The Task 3 documentation is accurate and cross-linked, but several files contain redundant prose, duplicate comparison tables, verbose changelog bullets, and outdated or overly detailed sections that can be tightened without removing factual content. This plan identifies simplifications across **9 files**.

### Files impacted

1. `docs/global-events.md`
2. `CHANGELOG.md`
3. `README.md`
4. `docs/ai-agent-guidelines.md`
5. `docs/request-reply-patterns.md`
6. `docs/testing-utilities.md`
7. `.agent/project-info/context.md`
8. `.agent/project-info/brief.md`
9. `.agent/project-info/architecture.md`

### Simplification categories

| Category | Count | Examples |
|----------|-------|----------|
| Redundant prose | 4 | TL;DR paragraph, "What Is" sections, duplicate onboarding table |
| Duplicate tables | 3 | Sync/async comparison, response-subject helpers, onboarding steps |
| Verbose bullets | 3 | CHANGELOG v0.12.0, context.md recent changes, testing-utilities bug table |
| Outdated/duplicated sections | 2 | README architecture tree, brief.md subject-builder examples |

---

## 1. `docs/global-events.md`

### 1.1 Remove redundant TL;DR prose

**Lines:** 24–31  
**Rationale:** The opening paragraph restates the table directly below it.

**Current:**
```markdown
## TL;DR

Use `EventEnvelope` (tenant) for operations scoped to a single `company_id` — subject format `company.{id}.{domain}.{entity}.{action}.v{version}`. Use `GlobalEventEnvelope` (global) for tenant-less operations — subject format `global.{domain}.{entity}.{action}.v{version}` with `company_id` omitted.

| Scope | Envelope | `company_id` | Subject Format |
```

**Proposed:**
```markdown
## TL;DR

Choose the envelope based on whether the operation is scoped to a single tenant.

| Scope | Envelope | `company_id` | Subject Format |
```

---

### 1.2 Shorten "What Is a Tenant Event?" and "What Is a Global Event?"

**Lines:** 47–53  
**Rationale:** Both sections repeat subject formats and tenant/global distinctions already shown in the TL;DR table.

**Current:**
```markdown
## What Is a Tenant Event?

A tenant event is scoped to one `company_id`. Its subject carries the tenant identifier (`company.{company_id}.{domain}.{entity}.{action}.v{version}`), and the envelope enforces tenant isolation by requiring `company_id` as a UUID v4. Tenant events are the default for most business operations — payments, debts, bank statements, notifications, client updates. For step-by-step instructions on creating a tenant event class, see [AI Agent Guidelines — Creating a New Event Class](ai-agent-guidelines.md#step-by-step-creating-a-new-event-class).

## What Is a Global Event?

A global event is tenant-less — `company_id` is omitted entirely. Its subject follows the format `global.{domain}.{entity}.{action}.v{version}`. Global events intentionally bypass tenant isolation; consumers must enforce their own authorization. Use `GlobalEventEnvelope` / `GlobalEventBase` classes and `createGlobalEvent()` factory to produce global events. For the wire format specification, see [Event & Messaging Convention — Global Subject Format](event-messaging-convention.md#global-subject-format).
```

**Proposed:**
```markdown
## What Is a Tenant Event?

A tenant event is scoped to one `company_id` and uses `EventEnvelope` / `EventBase`. It is the default for most business operations. See [AI Agent Guidelines — Creating a New Event Class](ai-agent-guidelines.md#step-by-step-creating-a-new-event-class).

## What Is a Global Event?

A global event has no `company_id` and uses `GlobalEventEnvelope` / `GlobalEventBase`. Consumers must enforce their own authorization because tenant isolation is bypassed by design. See [Event & Messaging Convention — Global Subject Format](event-messaging-convention.md#global-subject-format).
```

---

### 1.3 Simplify Envelope Field Comparison table

**Lines:** 79–88  
**Rationale:** The `Shared (BaseEventEnvelope)` column only repeats the word "shared" and adds visual noise.

**Current:**
```markdown
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
```

**Proposed:**
```markdown
| Field | Tenant (`EventEnvelope`) | Global (`GlobalEventEnvelope`) |
|-------|---------------------------|--------------------------------|
| `id` | required | required |
| `type`, `version`, `produced_at`, `producer` | required | required |
| `company_id` | **required** (UUID v4) | **omitted** |
| `actor_type` | required | required |
| `actor_id` | required for `client`/`company_user`; optional for `system`/`scheduler`/`external_api` | same rules |
| `correlation_id` | required | required |
| `causation_id`, `trace_id`, `reply_to` | optional | optional |
| `data` | required (typed `T`) | required (typed `T`) |

All other fields are inherited from `BaseEventEnvelope<T>`.
```

---

### 1.4 Compact Producing Global Events section

**Lines:** 104–146  
**Rationale:** Two full code snippets plus a decorator note can be reduced to one canonical factory snippet and a short `emitGlobal` example.

**Current:**
```markdown
## Producing Global Events

### Snippet A: Factory + `publish`

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

### Snippet B: `emitGlobal` convenience

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

> **Decorator-based:** Use `@EmitEvent(..., { scope: EventScope.GLOBAL })` to auto-route via `ProducerService.emitGlobal()`.
```

**Proposed:**
```markdown
## Producing Global Events

Use `createGlobalEvent()` with `SubjectBuilder.buildGlobal()`:

```typescript
const subject = this.subjectBuilder.buildGlobal({
  domain: 'iam', entity: 'company', action: 'created', version: '1',
});
const event = createGlobalEvent({ name }, {
  type: 'iam.company.created',
  version: '1.0.0',
  producer: 'iam-service',
  actorType: ActorType.SYSTEM,
  correlationId,
});
await this.producerService.publish(subject, event);
```

Or use the convenience method:

```typescript
await this.producerService.emitGlobal({ subject, data: { name }, context });
```

For decorator-based publishing, use `@EmitEvent(..., { scope: EventScope.GLOBAL })`.
```

---

## 2. `CHANGELOG.md`

### 2.1 Tighten v0.12.0 `Added` bullets

**Lines:** 12–20  
**Rationale:** Bullets are verbose and some overlap (e.g., `GlobalEventEnvelope`, `createGlobalEvent`, and shared bases).

**Current:**
```markdown
- **`GlobalEventEnvelope<T>`** — a tenant-less event envelope variant that omits `company_id` entirely. Intended for operations not scoped to a single tenant (`company`/`user`/`role` lifecycle, system-wide configuration, cross-tenant aggregate queries). Constructed via `createGlobalEvent()` factory or `GlobalEventBase<T>` abstract class. See `docs/global-events.md`.
- **`GlobalEventContext`** — the context variant paired with `GlobalEventEnvelope` (no `companyId`). Pair with `isGlobalContext()` type guard.
- **Shared envelope/context bases** — `BaseEventEnvelope<T>` and `BaseEventContext` now hold all common fields; `EventEnvelope<T>`/`EventContext` extend them with `company_id`/`companyId`, `GlobalEventEnvelope<T>`/`GlobalEventContext` extend them without it. Full backward compatibility for existing `EventEnvelope` consumers.
- **Union types and type guards** — `AnyEventEnvelope<T>`, `AnyEventContext`, `isGlobalEnvelope(envelope)`, `isGlobalContext(context)` exported for code that must accept either variant.
- **`EventScope` enum** — `TENANT` / `GLOBAL` discriminator used by `@EmitEvent` / `@OnEvent` metadata to drive tenant vs global subject routing.
- **`@IsOptionalForSystemActors()` custom validator** — exported decorator. Makes `actor_id` optional for `system`, `scheduler`, and `external_api` actor types, while keeping it required (non-empty string) for `client` and `company_user`. Reusable on consumer-side DTOs.
- **Global subject support** — `BuildGlobalSubjectDto`, `SubjectBuilder.buildGlobal()`, `buildGlobalSubject()`, `isGlobalSubject()`, and `buildGlobalResponseSubject()` produce/inspect subjects in the format `global.{domain}.{entity}.{action}.v{version}`.
- **`ProducerService.emitGlobal(options)`** — convenience method that builds a `GlobalEventEnvelope` from an `EmitGlobalOptions<T>` (`{ subject, data, context: GlobalEventContext }`) and publishes it. `ProducerService.publish()` now accepts `AnyEventEnvelope<unknown>`.
- **`createGlobalEvent()` factory** — returns a populated `GlobalEventEnvelope<T>` from a payload + `GlobalEventContext` (mirrors `createEvent()`).
```

**Proposed:**
```markdown
- **`GlobalEventEnvelope<T>`**, `GlobalEventBase<T>`, and `createGlobalEvent()`** — tenant-less envelope variant (no `company_id`) for cross-tenant operations. See `docs/global-events.md`.
- **`GlobalEventContext`** and `isGlobalContext()` — context variant and type guard for global events.
- **`BaseEventEnvelope<T>` and `BaseEventContext`** — shared bases extracted so tenant and global variants reuse common fields while remaining backward compatible.
- **Union types and type guards** — `AnyEventEnvelope<T>`, `AnyEventContext`, `isGlobalEnvelope()`, `isGlobalContext()`.
- **`EventScope` enum** — `TENANT` / `GLOBAL` discriminator for `@EmitEvent` / `@OnEvent` routing.
- **`@IsOptionalForSystemActors()`** — exported validator making `actor_id` optional for `system`, `scheduler`, and `external_api` actor types.
- **Global subject support** — `BuildGlobalSubjectDto`, `SubjectBuilder.buildGlobal()`, `buildGlobalSubject()`, `isGlobalSubject()`, `buildGlobalResponseSubject()`.
- **`ProducerService.emitGlobal(options)`** — convenience method for publishing global envelopes. `ProducerService.publish()` now accepts `AnyEventEnvelope<unknown>`.
```

---

### 2.2 Tighten v0.12.0 `Changed` bullets

**Lines:** 24–28  
**Rationale:** The `@IsOptionalForSystemActors` validator is already listed in `Added`; the `Changed` bullet can be shorter. Implementation-detail sentences (file-limit extraction) can be removed.

**Current:**
```markdown
- **`EventEnvelope.actor_id` is now optional for `system`, `scheduler`, and `external_api` actor types.** Previously required (non-empty string) for every actor type. `actor_id` remains required for `client` and `company_user`. Enforced via `@IsOptionalForSystemActors()`. This is a relaxation, not a breaking change — existing envelopes that provide `actor_id` for automated actors continue to validate.
- **`EventContext.actorId` is now optional** (`actorId?: string`) to mirror the envelope. `EventContext.actorId` only required when `actorType` is `client` or `company_user`.
- **Consumer-side validation now dispatches by subject prefix.** `JetStreamConsumerService` and `ConsumerService` validate against `GlobalEventEnvelope` for `global.*` subjects and `EventEnvelope` for `company.*` subjects. Validation logic extracted into a dedicated utility to stay within the 200-line file limit.
- **`OutboxService` accepts `AnyEventEnvelope`** — both tenant and global envelopes can be saved and republished.
- **`RequestReplyService` supports global contexts** — `sendRequest()`/`sendResponse()` detect `isGlobalContext(context)` and build the matching envelope variant via `buildGlobalEnvelope()`.
```

**Proposed:**
```markdown
- **`EventEnvelope.actor_id` and `EventContext.actorId` are now optional** for `system`, `scheduler`, and `external_api` actor types; they remain required for `client` and `company_user`.
- **Consumer-side validation dispatches by subject prefix** — `global.*` subjects validate against `GlobalEventEnvelope`, `company.*` subjects against `EventEnvelope`.
- **`OutboxService` accepts `AnyEventEnvelope`** — both tenant and global envelopes can be saved and republished.
- **`RequestReplyService` supports global contexts** — `sendRequest()`/`sendResponse()` detect `isGlobalContext(context)` and build the matching envelope variant.
```

---

### 2.3 Shorten v0.12.0 `Documentation` bullets

**Lines:** 32–36  
**Rationale:** Each bullet repeats the file path and action verb; can be collapsed into a compact list.

**Current:**
```markdown
- New guide: `docs/global-events.md` — canonical decision guide (decision tree, comparison tables, code examples) for choosing tenant (`EventEnvelope`) vs global (`GlobalEventEnvelope`) events. Cross-linked from convention, AI-agent guidelines, request-reply, and outbox docs.
- Updated `docs/event-messaging-convention.md` §2 (Global Subject Format), §3.2 (Global Event Envelope), §5 (`actor_id` conditional requirements via `@IsOptionalForSystemActors()`), and field table.
- Updated `docs/ai-agent-guidelines.md`: Quick Reference rules, global event class/example, validation checklist, common mistakes, and Public API Quick Reference rows for the new exports.
- Updated `README.md` Core Concepts and "Guidelines for AI Agents" rule #5 (tenant isolation no longer universal for all envelopes).
- Refreshed `.agent/project-info/architecture.md` cross-cutting concerns and entry points; `.agent/project-info/brief.md` folder structure; `.agent/project-info/CONTEXT.md` focus.
```

**Proposed:**
```markdown
- New guide `docs/global-events.md` — decision tree, comparison tables, and code examples for tenant vs global events.
- Updated `docs/event-messaging-convention.md`, `docs/ai-agent-guidelines.md`, `docs/request-reply-patterns.md`, `docs/outbox-usage-guidelines.md`, and `README.md` with global-event concepts and cross-links.
- Refreshed `.agent/project-info/architecture.md`, `.agent/project-info/brief.md`, and `.agent/project-info/CONTEXT.md`.
```

---

## 3. `README.md`

### 3.1 Replace outdated Architecture component tree with a summary

**Lines:** 775–810  
**Rationale:** The tree is outdated (does not list `BaseEventEnvelope`, `GlobalEventEnvelope`, `EventScope`, `build-global-subject.dto.ts`, etc.) and duplicates the authoritative tree in `architecture.md`.

**Current:**
```markdown
## Architecture

```text
src/
├── index.ts                    # Public API barrel exports
├── common/                     # Shared across all modules
│   ├── constants.ts            # Magic strings, defaults
│   ├── envelope/               # EventEnvelope<T>, ActorType, EventBase
│   │   └── validators/         # Custom class-validator decorators
│   ├── dto/                    # BuildSubjectDto
│   ├── utils/                  # SubjectBuilder, EventFactory, uuid.utils, date utils
│   └── errors/                 # EventConsumerException
├── producer/
...
```

Each concern is a separate NestJS `DynamicModule` — microservices import only what they need.
```

**Proposed:**
```markdown
## Architecture

The toolkit is organized as separate NestJS `DynamicModule`s (producer, consumer, request-reply, outbox, discovery, logging) over a shared `common/` layer that contains envelopes, subjects, validation utilities, and errors. Each microservice imports only the modules it needs.

For the full component tree and public API entry points, see [Architecture](.agent/project-info/architecture.md).
```

---

## 4. `docs/ai-agent-guidelines.md`

### 4.1 Remove duplicate Onboarding Step Links table

**Lines:** 451–465  
**Rationale:** The table duplicates the README Onboarding Flow and adds maintenance burden.

**Current:**
```markdown
## Onboarding Step Links

| Step | Topic | Key Resources |
|------|-------|---------------|
| 1 | **Architecture** — NATS, JetStream, envelope, actors | [Core Concepts](../README.md#core-concepts) · [Architecture](../.agent/project-info/architecture.md) |
| 2 | **Install & configure** — `EventsToolkitModule.forRoot()` | [Installation](../README.md#installation) · [Setup](../README.md#setup-unified-module) |
...
| 11 | **Deployment** — JetStream streams · env vars · health checks | [Deployment](../README.md#deployment) · [NATS JetStream Config](nats-jetstream-configuration.md) |
```

**Proposed:**
```markdown
## Onboarding Step Links

For the full 11-step onboarding path, see [Onboarding Flow](../README.md#onboarding-flow).
```

---

### 4.2 Reference `global-events.md` for global-specific mistakes

**Lines:** 479–492  
**Rationale:** Items 8 and 9 in the Common Mistakes table duplicate the global-events Common Mistakes table.

**Current:**
```markdown
| 8 | Using tenant envelope for global operations | Use `GlobalEventEnvelope`/`GlobalEventBase` + `buildGlobalSubject()` for tenant-less events |
| 9 | Sending placeholder `company_id` for global events | Omit `company_id` entirely; use `createGlobalEvent()` and `GlobalEventContext` |
```

**Proposed:**
```markdown
| 8 | Mixing tenant and global envelopes | See [Global Events Common Mistakes](global-events.md#common-mistakes) |
```

(Adjust the table row numbering if needed.)

---

## 5. `docs/request-reply-patterns.md`

### 5.1 Remove duplicate Sync vs Async comparison table

**Lines:** 320–333  
**Rationale:** The table repeats the overview table in §1.

**Current:**
```markdown
| Aspect | Sync (`request()`) | Async (`sendRequest()` + `@OnRequestReply`) |
| ------ | ------------------ | --------------------------------------------- |
| **Blocking** | Blocks caller until response or timeout | Non-blocking; caller continues immediately |
...
| **Use case** | Fetch by ID, validation, status checks | Workflows, batch processing, cross-service chains |

### When to choose sync
...
```

**Proposed:**
```markdown
### When to choose sync
...
```

(Keep the "When to choose sync/async" paragraphs; remove only the duplicated table.)

---

### 5.2 Replace duplicated Building Response Subjects section with a link

**Lines:** 286–316  
**Rationale:** The preferred/alternative response-subject conventions are fully documented in `event-messaging-convention.md` §2.1.

**Current:**
```markdown
#### Building Response Subjects

The toolkit provides two approaches for constructing response subjects:

**Preferred approach — Descriptive past-tense action:**

```typescript
import { buildSubject } from '@cobranza-apps/events-toolkit';
...
```

**Alternative approach — `.response` suffix via `buildResponseSubject`:**
...

See [Event & Messaging Convention §2.1](event-messaging-convention.md#21-response-subject-naming-convention) for the full convention details.
```

**Proposed:**
```markdown
#### Building Response Subjects

Use `buildSubject()` with a descriptive past-tense action (preferred), or `buildResponseSubject()` to append `.response`. See [Event & Messaging Convention §2.1](event-messaging-convention.md#21-response-subject-naming-convention).
```

---

## 6. `docs/testing-utilities.md`

### 6.1 Simplify Runtime Regression Guard bug table

**Lines:** 379–389  
**Rationale:** The table provides root-cause and guard details for each bug that are already captured in `CHANGELOG.md` and the spec files.

**Current:**
```markdown
### Bugs Guarded

| Bug | Root Cause | Guard |
|-----|-----------|-------|
| Explorer accessor-property crash | `OnEventExplorer` / `OnRequestReplyExplorer` called `Reflect.getMetadata` on getter/setter property descriptors, yielding `undefined` | `HandlerWithAccessorsProvider` declares `get`/`set` alongside `@OnEvent` and `@OnRequestReply` handlers; `moduleRef.init()` must not throw |
| Empty consumer-options crash | `JetStreamConsumerService` / `RequestReplyConsumerService` passed `{}` to `jetStream.subscribe`, causing NATS to read `undefined.ack_policy` | Assertions verify every `subscribe` call receives a config with a defined `ack_policy` (via `consumerOpts` builder or explicit config) |
| Push consumer missing `deliver_subject` (0.11.4) | Default push-consumer options lacked `deliver_subject`; NATS 2.29.3 `jetStream.subscribe()` throws `push consumer requires deliver_subject` | `createDefaultConsumerOpts()` chains `.deliverTo(createInbox())`; `resolveConsumerSubscribeOpts` defaults `config.deliver_subject` for plain `Partial<ConsumerOpts>`; covered by `subscribe-options.interface.spec.ts` |
```

**Proposed:**
```markdown
### Bugs Guarded

- Explorer accessor-property crash
- Empty consumer-options crash
- Push consumer missing `deliver_subject`

The spec exercises these runtime paths through `moduleRef.init()` to prevent regressions.
```

---

## 7. `.agent/project-info/context.md`

### 7.1 Shorten the v0.12.0 Recent Changes entry

**Lines:** 9–19  
**Rationale:** The entry duplicates the full `CHANGELOG.md` v0.12.0 section. CONTEXT.md should summarize current focus and link to CHANGELOG for details.

**Current:**
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

**Proposed:**
```markdown
### 2026-07-17 — Relax envelope validation & GlobalEventEnvelope (v0.12.0)
- `actor_id` / `actorId` optional for `system`, `scheduler`, `external_api` actor types.
- New tenant-less `GlobalEventEnvelope<T>`, `GlobalEventContext`, `GlobalEventBase<T>`, `createGlobalEvent()`, plus global subject helpers.
- `ProducerService.emitGlobal()`, consumer validation by subject prefix, and `AnyEventEnvelope` support in outbox/request-reply.
- New `EventScope`, `@IsOptionalForSystemActors()`, `isGlobalEnvelope()`, `isGlobalContext()`.
- New `docs/global-events.md` guide and CHANGELOG v0.12.0. See [CHANGELOG.md](../../CHANGELOG.md) for full details.
- Branch: `feat/relax-envelope-validation-and-global-events`.
```

---

## 8. `.agent/project-info/brief.md`

### 8.1 Shorten Subject Builder code examples

**Lines:** 183–258  
**Rationale:** The tenant and global DTO definitions plus two usage examples each duplicate README content.

**Current:**
```markdown
## 7. Subject Builder

```ts
// src/common/dto/build-subject.dto.ts
export class BuildSubjectDto {
  @IsUUID()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsString()
  @IsNotEmpty()
  entity: string;

  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsNotEmpty()
  version: string = '1';
}
```

**Usage:**

```ts
const subject = subjectBuilder.build({
  companyId,
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded',
  version: '1'
});
```

Or using with helper function:

```ts
const subject = buildSubject({
  companyId: sanitizedCompanyId,
  domain: 'debt',
  entity: 'schedule',
  action: 'generated',
  version: '1'
});
```

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

**Proposed:**
```markdown
## 7. Subject Builder

Tenant subjects use `BuildSubjectDto` (requires `companyId`):

```ts
const subject = subjectBuilder.build({
  companyId, domain: 'payment', entity: 'proof', action: 'uploaded', version: '1'
});
// => 'company.{companyId}.payment.proof.uploaded.v1'
```

Global subjects use `BuildGlobalSubjectDto` (no `companyId`):

```ts
const subject = subjectBuilder.buildGlobal({
  domain: 'iam', entity: 'company', action: 'created', version: '1'
});
// => 'global.iam.company.created.v1'
```

Helpers `buildSubject()` and `buildGlobalSubject()` are also available.
```

---

### 8.2 Shorten Example Usage section

**Lines:** 260–301  
**Rationale:** The full DTO + decorator + service example duplicates README Core Concepts and Usage sections.

**Current:**
```markdown
## 8. Example Usage (in a Microservice)

```ts
// payment-service/src/events/payment-proof-uploaded.event.ts
export class PaymentProofUploadedData {
  @IsUUID()
  paymentAttemptId: string;

  @IsUrl()
  fileUrl: string;

  @IsNumber()
  amount: number;

  @IsEnum(Currency)
  currency: string;
}

export class PaymentProofUploadedEvent extends EventEnvelope<PaymentProofUploadedData> {
  readonly type = 'payment.proof.uploaded';
  readonly version = '1.0.0';
}
```

```ts
// In a controller or service

// Using the decorator (auto-publishes on method return)
@EmitEvent('payment.proof.uploaded', {
  version: '1',
  description: 'A payment proof file was uploaded',
  payloadExample: { paymentAttemptId: 'uuid', fileUrl: 'https://...', amount: 100, currency: 'MXN' },
})
async handleUpload(data: UploadDto, context: EventContext): Promise<PaymentProofUploadedEvent> {
  return new PaymentProofUploadedEvent(data, context);
}

// Or using direct service injection
const subject = buildSubject({ companyId, domain: 'payment', entity: 'proof', action: 'uploaded', version: '1' });
const event = createEvent(data, context);
await this.producerService.publish(subject, event);
```
```

**Proposed:**
```markdown
## 8. Example Usage (in a Microservice)

Define a typed event class, publish via `@EmitEvent()` or `ProducerService.publish()`, and consume with `@OnEvent()`. For a complete walkthrough, see [README Usage](../../README.md#usage).
```

---

## 9. `.agent/project-info/architecture.md`

### 9.1 Condense Entry Points list

**Lines:** 229–282  
**Rationale:** The block is a near-verbatim copy of `src/index.ts` and is hard to scan.

**Current:**
```markdown
## 6. Entry Points (Public API via `src/index.ts`)

The unified barrel file (`src/index.ts`) re-exports all sub-module barrels and the following top-level symbols. The actual list is authoritative from `src/index.ts`; key exports include:

```
// Unified module
EventsToolkitModule
EventsToolkitModuleOptions, EventsToolkitModuleAsyncOptions, EventsToolkitNatsOptions
...
// Testing — exported via the `@cobranza-apps/events-toolkit/testing` subpath ONLY.
...
```
```

**Proposed:**
```markdown
## 6. Entry Points (Public API via `src/index.ts`)

The barrel file re-exports all sub-module barrels. Key groups:

- **Unified module:** `EventsToolkitModule`, `EventsToolkitModuleOptions`, `EventsToolkitNatsOptions`, `EventsToolkitOutboxOptions`, `EventsToolkitConsumerOptions`, `EventsToolkitDiscoveryOptions`
- **Envelopes & context:** `EventEnvelope`, `GlobalEventEnvelope`, `BaseEventEnvelope`, `EventBase`, `GlobalEventBase`, `EventContext`, `GlobalEventContext`, `BaseEventContext`, `AnyEventEnvelope`, `AnyEventContext`, `isGlobalEnvelope`, `isGlobalContext`, `ActorType`, `EventScope`, `IsOptionalForSystemActors`
- **Subjects & factories:** `SubjectBuilder`, `buildSubject`, `buildGlobalSubject`, `buildResponseSubject`, `buildGlobalResponseSubject`, `buildDlqSubject`, `isGlobalSubject`, `createEvent`, `createGlobalEvent`, `generateEventId`, `generateUuidV7`
- **Producer / consumer / request-reply / outbox / discovery / logging:** modules, services, decorators, and configuration types
- **Testing:** exported only from `@cobranza-apps/events-toolkit/testing`

See `src/index.ts` for the authoritative list.
```

---

## Verification

After applying simplifications:

1. Re-read each modified file to confirm no factual content was removed.
2. Confirm all internal markdown links resolve.
3. Confirm `docs/global-events.md` still has a Table of Contents and exceeds 100 lines.
4. Run `npm run lint` and `npm run typecheck` (docs-only changes; no `src/` changes expected).

---

## What Was NOT Simplified

- `docs/event-messaging-convention.md` — already concise; the global-subject and actor-type additions are the authoritative specification and should not be shortened.
- `docs/outbox-usage-guidelines.md` — decision trees and trade-off tables are already minimal.
- `docs/global-events.md` Actor Type Requirements table — intentionally duplicated here as the decision-hub copy per the original plan.
