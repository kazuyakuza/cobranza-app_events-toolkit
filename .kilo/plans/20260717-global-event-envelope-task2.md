# Task 2 — Introduce `GlobalEventEnvelope` Type

**Source TODO:** `.agent/todos/20260716/20260716-todo-2.md` (Task 2)
**Global plan:** `.kilo/plans/20260717-relax-envelope-and-global-events.md`
**Date:** 2026-07-17
**Branch:** `feat/relax-envelope-validation-and-global-events` (already checked out)
**Version:** `0.12.0` (already bumped by Step 3)

> This plan covers **Task 2 only**. Task 1 (`@IsOptionalForSystemActors`) is already complete — `actor_id`/`actorId` are already optional for automated actors and the existing tests pass. Task 3 (documentation) is handled in a separate per-task plan.

---

## 1. Pre-Analysis

### 1.1 Current state of the codebase (post-Task 1)

| File | State |
|------|-------|
| `src/common/envelope/event-envelope.class.ts` | Has `actor_id?` with `@IsOptionalForSystemActors()`. `company_id` is still `@IsUUID('4')` and required. 130 lines. |
| `src/common/envelope/event-context.interface.ts` | `actorId?` optional. `companyId` required. 73 lines. |
| `src/common/envelope/event-base.class.ts` | Extends `EventEnvelope`, abstract `type`/`version`. 24 lines. |
| `src/common/dto/build-subject.dto.ts` | `BuildSubjectDto` with required `companyId`. 53 lines. |
| `src/common/utils/subject.builder.ts` | `SubjectBuilder.build()`, `buildSubject()`, `RESPONSE_SUFFIX`, `buildResponseSubject()` (parse-based), `DLQ_SUBJECT_PREFIX`, `buildDlqSubject()`. 160 lines. Parser regex is hardcoded to `company.{uuid}.{domain}.{entity}.{action}.v{version}`. |
| `src/common/utils/event.factory.ts` | `createEvent<T>(data, context): EventEnvelope<T>`. 53 lines. |
| `src/producer/producer.service.ts` | `EmitOptions<T>{ subject; data; context: EventContext }`, `publish(subject, event: EventEnvelope<unknown>)`, `emit<T>(options)`, private `buildEnvelope`. Uses `EventEnvelope`/`EventContext`. 109 lines. |
| `src/consumer/consumer.service.ts` | `EventHandler = (event: EventEnvelope<unknown>, context: EventContext) => Promise<void>`. `dispatch(options: DispatchOptions)`. 58 lines. |
| `src/consumer/dispatch-options.interface.ts` | `event: EventEnvelope<unknown>`, `context: EventContext`. 12 lines. |
| `src/consumer/subscribe-options.interface.ts` | `envelopeToContext(envelope): EventContext` maps `company_id` → `companyId`. 113 lines. |
| `src/consumer/jetstream-consumer.service.ts` | 198 lines — contains `parseMessageData`, `validateEnvelope` (uses `plainToInstance(EventEnvelope, plain)`), `createValidationException`, `isInvalidEventPayload`. **Near 200-line limit**. |
| `src/consumer/request-reply-message-processor.ts` | 185 lines — duplicates `parseMessageData`/`validateEnvelope` logic. |
| `src/consumer/request-reply-consumer.service.ts` | 127 lines; `dispatch` uses `event.company_id`. |
| `src/consumer/decorators/on-event.explorer.ts` | `buildWildcardSubject() = company.*.${eventType}.v${version}`. 83 lines. |
| `src/consumer/decorators/on-event.decorator.ts` | `OnEventMetadata`, `OnEventOptions`. 61 lines. |
| `src/producer/decorators/emit-event.decorator.ts` | `EmitEventMetadata`, `EmitEventOptions`. 61 lines. |
| `src/producer/decorators/emit-event-interceptor.ts` | `buildSubject() = company.${eventContext.companyId}.${eventType}.v${version}`; `hasRequiredContextFields` checks `'companyId' in arg`. 90 lines. |
| `src/outbox/outbox.service.ts` | 194 lines — `EventEnvelope<unknown>` typed `saveToOutbox`/`sendRequestThroughOutbox`. **Near 200-line limit** (type-only changes here). |
| `src/outbox/outbox.types.ts` | `SaveOutboxEntryParams.event: EventEnvelope<unknown>`. |
| `src/outbox/outbox.utils.ts` | `parseEnvelope(): EventEnvelope<unknown>`, `createDlqEnvelope(envelope, payload)` reads `envelope.company_id` etc. 61 lines. |
| `src/outbox/outbox-request-reply.helpers.ts` | `ensureReplyToPresent(event: EventEnvelope<unknown>)`. 15 lines. |
| `src/outbox/save-in-transaction-params.interface.ts` | `event: EventEnvelope<unknown>`. 12 lines. |
| `src/outbox/async-request-event-context.interface.ts` | `AsyncRequestEventContext extends EventContext` adds required `replyTo`. |
| `src/outbox/send-async-request-through-outbox-options.interface.ts` | `context: AsyncRequestEventContext`. |
| `src/request-reply/request-reply.service.ts` | 125 lines — `request<T,R>`, `sendResponse`, `isRequestReplyMessage`, `sendRequest<T>`, `buildResponseEnvelope<R>` (uses `EventContext`/`EventEnvelope<unknown>`). |
| `src/request-reply/request-reply.helpers.ts` | `buildEnvelope<T>(context: EventContext, payload: T): EventEnvelope<T>`; log/wrap helpers. 108 lines. |
| `src/request-reply/request-reply.types.ts` | `SendRequestOptions<T>.context: EventContext`, `BuildResponseEnvelopeOptions<R>.requestEvent/responseContext/responseData`. 79 lines. |
| `src/testing/*.ts` | Mocks that build `EventEnvelope` instances — must accept both types but the mocks themselves can keep building tenant envelopes (backward compatible). No required changes. |

### 1.2 Call sites that MUST be updated for global events

| Concern | Files |
|---------|-------|
| Envelope class hierarchy | `event-envelope.class.ts`, new `base-event-envelope.class.ts`, new `global-event-envelope.class.ts`, `event-base.class.ts`, new `global-event-base.class.ts`, `event-envelope.fixture.ts` |
| Context interface hierarchy | `event-context.interface.ts`, new `base-event-context.interface.ts`, new `global-event-context.interface.ts` |
| Union types / type guards | new `envelope-types.ts` |
| Subject building (global format) | new `build-global-subject.dto.ts`; new `subject-parser.ts` (extracted); `subject.builder.ts` (add `buildGlobal`/`buildGlobalSubject`/`isGlobalSubject`); `subject.builder.spec.ts` |
| Event factory (global) | `event.factory.ts` |
| Producer | `producer.service.ts`, `emit-event.decorator.ts`, `emit-event-interceptor.ts` |
| Consumer (dispatch types + validation) | `consumer.service.ts`, `dispatch-options.interface.ts`, `subscribe-options.interface.ts`, `jetstream-consumer.service.ts`, new `envelope-validation.util.ts`, `request-reply-message-processor.ts`, `request-reply-consumer.service.ts`, `on-event.decorator.ts`, `on-event.explorer.ts` |
| Outbox | `outbox.service.ts`, `outbox.types.ts`, `outbox.utils.ts`, `outbox-request-reply.helpers.ts`, `save-in-transaction-params.interface.ts`, `send-async-request-through-outbox-options.interface.ts`, new `async-global-request-event-context.interface.ts` |
| Request-Reply | `request-reply.service.ts`, `request-reply.helpers.ts`, `request-reply.types.ts` |
| Barrel re-exports | `src/common/envelope/index.ts`, `src/common/dto/index.ts`, `src/common/utils/index.ts`, `src/consumer/index.ts`, `src/outbox/index.ts`, `src/request-reply/index.ts`, `src/producer/index.ts` |

### 1.3 Technical decisions

1. **Class hierarchy (`BaseEventEnvelope<T>` → `EventEnvelope<T>` / `GlobalEventEnvelope<T>`)**
   - `BaseEventEnvelope<T>` declares **all common fields** with their class-validator decorators: `id`, `type`, `version`, `produced_at`, `producer`, `actor_type`, `actor_id` (with `@IsOptionalForSystemActors()`), `correlation_id`, optional `causation_id` / `trace_id` / `reply_to`, and `data`.
   - **No `company_id`** in the base.
   - `EventEnvelope<T>` extends `BaseEventEnvelope<T>` and adds **only** `company_id` with `@IsUUID('4')`.
   - `GlobalEventEnvelope<T>` extends `BaseEventEnvelope<T>` and adds nothing extra.
   - Both classes keep the same constructor signature shape (`Partial<...>`) and call `super(properties)`; the base constructor does `Object.assign(this, properties)`. Because `company_id` is included in the `properties` object for `EventEnvelope`, `Object.assign` populates it automatically. The inheriting constructors therefore only call `super(properties)`.
   - class-validator inheritance: `plainToInstance(EventEnvelope, plain)` populates parent decorators correctly via prototype metadata. `plainToInstance(GlobalEventEnvelope, plain)` ignores the absent `company_id` and validates only the base fields.

2. **Context hierarchy (`BaseEventContext` → `EventContext` / `GlobalEventContext`)**
   - `BaseEventContext` declares the common context fields (no `companyId`).
   - `EventContext` extends `BaseEventContext` and adds `companyId: string`.
   - `GlobalEventContext` extends `BaseEventContext` and adds nothing extra.

3. **Union types & guards**
   - `AnyEventEnvelope<T = unknown> = EventEnvelope<T> | GlobalEventEnvelope<T>`.
   - `AnyEventContext = EventContext | GlobalEventContext`.
   - Type guards `isGlobalEnvelope(envelope)` and `isGlobalContext(context)` based on `ActorType`/shape — actually use a structural check: `'company_id' in envelope` (tenant). Inverse for global.

4. **Subject routing**
   - Tenant format unchanged: `company.{company_id_dashless}.{domain}.{entity}.{action}.v{version}`.
   - Global format: `global.{domain}.{entity}.{action}.v{version}`.
   - New `BuildGlobalSubjectDto` with `domain`, `entity`, `action`, `version` (no `companyId`).
   - New `SubjectBuilder.buildGlobal(dto: BuildGlobalSubjectDto)` and standalone `buildGlobalSubject(dto)`.
   - New `isGlobalSubject(subject)` predicate (`/^(global\.)/`).
   - `buildDlqSubject(originalSubject)` already works for any subject (just prepends `dlq.`) — **no change needed**.
   - `buildResponseSubject(requestSubject)` currently only parses tenant subjects. We:
     - Extract `parseSubjectSegments`, `SubjectParseResult`, `RESPONSE_SUFFIX` into a new `subject-parser.ts` file.
     - Add `parseGlobalSubjectSegments` and `buildGlobalResponseSubject` to that file.
     - Both regimes share the same `.response` insertion logic but different parsers.

5. **Event factory**
   - Keep `createEvent<T>(data, context: EventContext): EventEnvelope<T>` for tenant events.
   - Add `createGlobalEvent<T>(data, context: GlobalEventContext): GlobalEventEnvelope<T>`. Auto-fills `id` and `produced_at`, maps base fields.

6. **Service updates (file-limit aware)**
   - `ProducerService.publish(subject, event)` accepts `AnyEventEnvelope`. Bodies (`encodeEvent`, `logEmission`, `toLogContext`, `toErrorLogContext`) already only read common fields (`id`, `type`, `correlation_id`, `trace_id`), so changing the parameter type is sufficient.
   - `ProducerService.emit<T>` stays for tenant events (uses `EventContext`). Add `emitGlobal<T>(options: EmitGlobalOptions<T>)` for global events (uses `GlobalEventContext`) and a private `buildGlobalEnvelope` helper. `ProducerService` grows by ~25 lines → ~130 lines (safe).
   - `ProducerService` gets a new exported `EmitGlobalOptions<T>` interface in the same file.
   - `ConsumerService.EventHandler` becomes `(event: AnyEventEnvelope, context: AnyEventContext) => Promise<void>`.
   - `DispatchOptions.event` becomes `AnyEventEnvelope<unknown>`, `.context` becomes `AnyEventContext`.
   - `subscribe-options.interface.ts`'s `envelopeToContext` is split into two helpers — the subject determines which branch:
     - `envelopeToTenantContext(envelope: EventEnvelope<unknown>): EventContext`
     - `envelopeToGlobalContext(envelope: GlobalEventEnvelope<unknown>): GlobalEventContext`
     - A new dispatcher `envelopeToContext(envelope: AnyEventEnvelope<unknown>, subject: string): AnyEventContext` calls the appropriate helper based on `isGlobalSubject(subject)`. The signature uses two params; the max-2-params rule is satisfied.
   - **Envelope validation util extraction** is mandatory — `jetstream-consumer.service.ts` (198 lines) and `request-reply-message-processor.ts` (185 lines) both duplicate `parseMessageData`/`validateEnvelope`/`createValidationException`/`isInvalidEventPayload`. Both need to switch between envelope classes based on subject. The cleanest approach is to extract a shared `EnvelopeValidationUtil` / set of exported helpers into `src/consumer/envelope-validation.util.ts`:
     - `parseMessageData(msg): Record<string, unknown>` (JSON parsing + shape check).
     - `validateEnvelope(plain, subject): AnyEventEnvelope<unknown>` — picks `EventEnvelope` or `GlobalEventEnvelope` based on `isGlobalSubject(subject)` via a small `pickEnvelopeClass(subject)` helper.
     - `createValidationException(options): EventConsumerException`.
     - This util is then called from both consumer services, shrinking them well below 200 lines.
   - `outbox.service.ts` (194 lines) — only type signature updates: `EventEnvelope<unknown>` → `AnyEventEnvelope`. **No new methods, no new logic.** Stays under 200.
   - `outbox.utils.ts`:
     - `parseEnvelope(entry): AnyEventEnvelope<unknown>` (returns the typed union).
     - `createDlqEnvelope(envelope: AnyEventEnvelope, payload): AnyEventEnvelope` — preserves the original envelope class via `isGlobalEnvelope`. For tenant: build `EventEnvelope`; for global: build `GlobalEventEnvelope`. Carries only the fields present on each.
   - `OutboxService.sendAsyncRequestThroughOutbox<T>` needs to handle both `AsyncRequestEventContext` (tenant) and a new `AsyncGlobalRequestEventContext` (global). We add a new `AsyncGlobalRequestEventContext extends GlobalEventContext` interface, generalize the `SendAsyncRequestThroughOutboxOptions<T>.context` to `AsyncRequestEventContext | AsyncGlobalRequestEventContext`, and branch internally:
     - Tenant → `createEvent(payload, context)`.
     - Global → `createGlobalEvent(payload, context)`.
     - The branch can read `isGlobalContext(context)` (uses structural check `'companyId' in context`).
   - `RequestReplyService`:
     - `sendResponse(correlationId, responseEvent: AnyEventEnvelope<unknown>)`.
     - `isRequestReplyMessage(event: AnyEventEnvelope<unknown>)` (uses `reply_to` — same logic for both).
     - `sendRequest<T>(options: SendRequestOptions<T>)` — `context: EventContext | GlobalEventContext`; the private `buildEnvelope` helper is split into `buildTenantEnvelope` / `buildGlobalEnvelope` (or the existing `request-reply.helpers.ts` exports both).
     - `buildResponseEnvelope<R>(options)` — `requestEvent: AnyEventEnvelope<unknown>`, `responseContext: AnyEventContext`; returns `AnyEventEnvelope<R>`. Branches on context type.
   - `request-reply.helpers.ts`'s `buildEnvelope` is split: `buildEnvelope(context: EventContext, payload)` and new `buildGlobalEnvelope(context: GlobalEventContext, payload)`. The existing `buildEnvelope` keeps its current name (tenant). Log/wrap helpers already only read common fields → only type signature updates.

7. **Decorators / explorers (for `@EmitEvent` and `@OnEvent` to support global scope)**
   - Add an `EventScope` enum (`'tenant' | 'global'`) in `src/common/envelope/event-scope.enum.ts`. Default `'tenant'` (preserves backward compatibility).
   - `EmitEventOptions` and `EmitEventMetadata` gain optional `scope?: EventScope`.
   - `OnEventOptions` and `OnEventMetadata` gain optional `scope?: EventScope`.
   - `OnEventExplorer.buildWildcardSubject(metadata)` branches on `scope`:
     - tenant: `company.*.${eventType}.v${version}` (unchanged).
     - global: `global.${eventType}.v${version}`.
   - `EmitEventInterceptor.buildSubject(metadata, eventContext)` branches on `scope`:
     - tenant: `company.${eventContext.companyId}.${eventType}.v${version}` (unchanged).
     - global: `global.${eventType}.v${version}`.
   - `EmitEventInterceptor.hasRequiredContextFields` must accept tenant (`companyId` + `type`) OR global (`type` only). For global scope, do not require `companyId`.
   - The explorers `findEventContext` predicate stays the same (`isEventContext`). For global context we add a parallel guard `isGlobalContext`.

8. **Manual subscription path**
   - `JetStreamConsumerService.subscribe({ subject, handler, consumerOpts })` works for both — the subject already determines the routing. The handler signature widens to `EventHandler` (already updated). No new method needed; users just pass `global.*` subjects to subscribe to global streams.

### 1.4 File-size management summary

| File | Estimated lines | Status |
|------|-----------------|--------|
| `base-event-envelope.class.ts` (new) | ~95 | OK |
| `event-envelope.class.ts` (refactored) | ~30 | OK |
| `global-event-envelope.class.ts` (new) | ~40 | OK |
| `global-event-base.class.ts` (new) | ~25 | OK |
| `base-event-context.interface.ts` (new) | ~60 | OK |
| `event-context.interface.ts` (refactored) | ~25 | OK |
| `global-event-context.interface.ts` (new) | ~25 | OK |
| `envelope-types.ts` (new) | ~30 | OK |
| `event-scope.enum.ts` (new) | ~10 | OK |
| `build-global-subject.dto.ts` (new) | ~50 | OK |
| `subject-parser.ts` (new, extracted) | ~110 | OK |
| `subject.builder.ts` (refactored) | ~85 | OK |
| `event.factory.ts` (extended) | ~85 | OK |
| `producer.service.ts` (extended) | ~140 | OK |
| `emit-event.decorator.ts` (extended) | ~70 | OK |
| `emit-event-interceptor.ts` (extended) | ~110 | OK |
| `consumer.service.ts` (type widen) | ~60 | OK |
| `dispatch-options.interface.ts` (type widen) | ~15 | OK |
| `subscribe-options.interface.ts` (extended) | ~125 | OK (under 200) |
| `envelope-validation.util.ts` (new) | ~110 | OK |
| `jetstream-consumer.service.ts` (uses util) | ~150 | OK |
| `request-reply-message-processor.ts` (uses util) | ~130 | OK |
| `request-reply-consumer.service.ts` (type widen) | ~130 | OK |
| `on-event.decorator.ts` (extended) | ~70 | OK |
| `on-event.explorer.ts` (extended) | ~95 | OK |
| `outbox.service.ts` (type widen only) | ~196 | **borderline — verified no new methods are added; if it crosses 200 during implementation, extract `createEvent` call into a small private helper module. Mitigation documented below.** |
| `outbox.utils.ts` (extended) | ~75 | OK |
| `outbox.types.ts` (type widen) | ~75 | OK |
| `save-in-transaction-params.interface.ts` | ~13 | OK |
| `outbox-request-reply.helpers.ts` (type widen) | ~16 | OK |
| `async-request-event-context.interface.ts` | unchanged | OK |
| `async-global-request-event-context.interface.ts` (new) | ~12 | OK |
| `send-async-request-through-outbox-options.interface.ts` (type widen) | ~18 | OK |
| `request-reply.service.ts` (extended) | ~155 | OK |
| `request-reply.helpers.ts` (extended) | ~125 | OK |
| `request-reply.types.ts` (type widen) | ~85 | OK |

**Risk mitigation for `outbox.service.ts`:** The only logic changes are (a) parameter type widening and (b) a single `if (isGlobalContext(context))` branch inside `sendAsyncRequestThroughOutbox`. If the file crosses 200 lines, extract the `createEvent`/`createGlobalEvent` branching into a new helper `src/common/utils/event-context-resolver.ts` exporting `createEventFromContext(context, payload)`. The plan currently assumes the branch stays inline — re-evaluate during step 4.2.I.7 and split if needed.

### 1.5 Backward compatibility

- `EventEnvelope`, `EventContext`, `EventBase`, `BuildSubjectDto`, `SubjectBuilder.build()`, `buildSubject()`, `buildResponseSubject()`, `buildDlqSubject()`, `createEvent()`, `ProducerService.publish()`, `ProducerService.emit()`, `ConsumerService.dispatch()`, `ProducerService`/`OutboxService`/`RequestReplyService` method shapes — all keep their existing signatures from the consumer's perspective. Only the *accepted parameter types* are widened to unions; existing call sites using `EventEnvelope` still type-check (a narrower type is widening-compatible in TypeScript).
- New exports (`GlobalEventEnvelope`, `GlobalEventContext`, `GlobalEventBase`, `BuildGlobalSubjectDto`, `buildGlobalSubject`, `isGlobalSubject`, `AnyEventEnvelope`, `AnyEventContext`, `createGlobalEvent`, `EventScope`, `EmitGlobalOptions`, `ProducerService.emitGlobal`, `AsyncGlobalRequestEventContext`, `buildGlobalResponseSubject`, `isGlobalEnvelope`, `isGlobalContext`) — all additive.
- Existing specs preserve their assertions.

### 1.6 Testing strategy

- Unit tests for every new class/interface/validator/DTO/helper.
- Dual-dispatch tests for consumer (`EventHandler` invoked with both envelope types based on subject).
- Global subject building and parsing tests.
- Global event factory tests.
- Producer `emitGlobal` and `publish` of a `GlobalEventEnvelope`.
- Outbox `saveToOutbox` accepts both envelopes; DLQ envelope preserves type.
- Request-Reply `sendRequest`/`buildResponseEnvelope` with global context preserves correlation/causation; response envelope is `GlobalEventEnvelope`.
- Decorator/explorer scope tests (`@EmitEvent({scope:'global'})`, `@OnEvent({scope:'global'})`).
- Full `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass.

---

## 2. Implementation Steps (very detailed, atomic, verifiable)

> Each step contains: file path, what to do, snippets where helpful, and a verification command.

### Step 0 — Pre-flight checklist

```bash
npm run typecheck
npm run lint
npm test
```
All three must pass before starting. Commit any pending work from Step 5/previous cycle before tuning.

### Step 1 — Create `BaseEventEnvelope` class

**File (new):** `src/common/envelope/base-event-envelope.class.ts`

Move all common fields (excluding `company_id`) from `EventEnvelope` into a new base class. Keep all class-validator decorators verbatim (including `@IsOptionalForSystemActors()` on `actor_id`).

```ts
import { IsString, IsEnum, IsOptional, IsNotEmpty, IsObject, IsISO8601, Matches } from 'class-validator';
import { ActorType } from './actor-type.enum';
import { IsOptionalForSystemActors } from './validators/is-optional-for-system-actors.validator';

/**
 * Common fields shared by every event envelope variant in the Cobranza App platform.
 *
 * Concrete envelope classes ({@link EventEnvelope}, {@link GlobalEventEnvelope})
 * extend this base and add their domain-specific tenancy/scope information.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @see docs/event-messaging-convention.md — Section 3 (Event Envelope)
 */
export class BaseEventEnvelope<T = Record<string, unknown>> {
  // Copy every field EXCEPT company_id from the current EventEnvelope,
  // preserving decorator stacks and JSDoc verbatim.
  @IsString() @IsNotEmpty() @Matches(/^evt_/) id!: string;
  @IsString() @IsNotEmpty() type!: string;
  @IsString() @IsNotEmpty() version!: string;
  @IsString() @IsNotEmpty() @IsISO8601({ strict: true }) produced_at!: string;
  @IsString() @IsNotEmpty() producer!: string;
  @IsEnum(ActorType) actor_type!: ActorType;
  @IsOptionalForSystemActors() actor_id?: string;
  @IsUUID('4') correlation_id!: string;
  @IsOptional() @IsUUID('4') causation_id?: string;
  @IsOptional() @IsString() trace_id?: string;
  @IsOptional() @IsString() reply_to?: string;
  @IsObject() data!: T;

  constructor(properties?: Partial<BaseEventEnvelope<T>>) {
    if (properties) Object.assign(this, properties);
  }
}
```

Note: preserve all JSDoc comments one-by-one from the existing `event-envelope.class.ts` while moving them.

**Verification:** `npm run typecheck` (will fail until Step 2 is done — see below).

### Step 2 — Refactor `EventEnvelope` to extend `BaseEventEnvelope`

**File (modify):** `src/common/envelope/event-envelope.class.ts`

Replace the entire class body with the tenant-specific subclass that adds `company_id`:

```ts
import { IsUUID } from 'class-validator';
import { BaseEventEnvelope } from './base-event-envelope.class';

/**
 * Tenant-scoped event envelope — adds the mandatory {@link company_id} for tenant isolation.
 *
 * @typeParam T - The domain-specific business payload type.
 * @see BaseEventEnvelope
 * @see GlobalEventEnvelope
 */
export class EventEnvelope<T = Record<string, unknown>> extends BaseEventEnvelope<T> {
  /** Company UUID with dashes — mandatory for tenant isolation. */
  @IsUUID('4')
  company_id!: string;

  constructor(properties?: Partial<EventEnvelope<T>>) {
    super(properties);
  }
}
```

Imports of `ActorType` / `IsOptionalForSystemActors` and other decorators are removed from this file (they now live in `BaseEventEnvelope`).

**Line estimate:** ~30 lines.

**Verification:**
- `npm run typecheck`
- `npm test -- event-envelope` (existing `event-envelope.spec.ts`, `event-envelope.metadata.spec.ts`, `event-envelope.actor-id-optional.spec.ts`, `event-base.spec.ts` must still pass without edits — class-validator inheritance preserves parent-decorator validation on `plainToInstance(EventEnvelope, plain)`).

### Step 3 — Create `GlobalEventEnvelope` class

**File (new):** `src/common/envelope/global-event-envelope.class.ts`

```ts
import { BaseEventEnvelope } from './base-event-envelope.class';

/**
 * Event envelope for tenant-less (global) operations such as creating
 * cross-tenant entities (`company`, `user`, `role`) or system-wide
 * configuration changes.
 *
 * Extends {@link BaseEventEnvelope} and adds no `company_id` field;
 * consumers subscribing to `global.**` subjects are responsible for
 * their own authorization.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @see docs/global-events.md (created in Task 3)
 * @see EventEnvelope for the tenant-scoped counterpart.
 */
export class GlobalEventEnvelope<T = Record<string, unknown>> extends BaseEventEnvelope<T> {
  constructor(properties?: Partial<GlobalEventEnvelope<T>>) {
    super(properties);
  }
}
```

**Line estimate:** ~25 lines.

### Step 4 — Create `GlobalEventBase` abstract base

**File (new):** `src/common/envelope/global-event-base.class.ts`

```ts
import { GlobalEventEnvelope } from './global-event-envelope.class';

/**
 * Abstract base for domain-specific **global** event types.
 *
 * Mirror of {@link EventBase} for the {@link GlobalEventEnvelope} variant.
 * Concrete subclasses MUST define `type` and `version`.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @example
 * ```ts
 * class CompanyCreatedEvent extends GlobalEventBase<CompanyCreatedData> {
 *   readonly type = 'iam.company.created';
 *   readonly version = '1.0.0';
 * }
 * ```
 */
export abstract class GlobalEventBase<T = Record<string, unknown>> extends GlobalEventEnvelope<T> {
  declare abstract type: string;
  declare abstract version: string;
}
```

**Line estimate:** ~25 lines.

### Step 5 — Create `BaseEventContext` interface

**File (new):** `src/common/envelope/base-event-context.interface.ts`

Move all common context fields **except** `companyId` from `EventContext`:

```ts
import { ActorType } from './actor-type.enum';

/**
 * Common context metadata shared by every event-producing call site.
 *
 * Captures the minimal set of fields needed to build an event envelope
 * without tenancy information. Concrete contexts ({@link EventContext},
 * {@link GlobalEventContext}) add their scope-specific fields.
 */
export interface BaseEventContext {
  type: string;
  version: string;
  producer: string;
  actorType: ActorType;
  actorId?: string;
  correlationId: string;
  causationId?: string;
  traceId?: string;
  replyTo?: string;
}
```

**Line estimate:** ~60 lines (preserve JSDoc from current `EventContext`).

### Step 6 — Refactor `EventContext` to extend `BaseEventContext`

**File (modify):** `src/common/envelope/event-context.interface.ts`

```ts
import { BaseEventContext } from './base-event-context.interface';

/**
 * Context metadata for tenant-scoped events. Adds the mandatory `companyId`.
 *
 * @see BaseEventContext
 * @see GlobalEventContext
 */
export interface EventContext extends BaseEventContext {
  /** Company UUID with dashes — mandatory for tenant isolation. */
  companyId: string;
}
```

**Line estimate:** ~25 lines.

### Step 7 — Create `GlobalEventContext` interface

**File (new):** `src/common/envelope/global-event-context.interface.ts`

```ts
import { BaseEventContext } from './base-event-context.interface';

/**
 * Context metadata for tenant-less (global) events.
 *
 * Extends {@link BaseEventContext} without adding `companyId`. Used by
 * global producers and the global event factory.
 *
 * @see BaseEventContext
 * @see EventContext
 */
export interface GlobalEventContext extends BaseEventContext {}
```

**Line estimate:** ~15 lines.

### Step 8 — Create union types and guards

**File (new):** `src/common/envelope/envelope-types.ts`

```ts
import type { EventEnvelope } from './event-envelope.class';
import type { GlobalEventEnvelope } from './global-event-envelope.class';
import type { EventContext } from './event-context.interface';
import type { GlobalEventContext } from './global-event-context.interface';

/** Union of all supported event envelope variants. */
export type AnyEventEnvelope<T = unknown> = EventEnvelope<T> | GlobalEventEnvelope<T>;

/** Union of all supported event context variants. */
export type AnyEventContext = EventContext | GlobalEventContext;

/** Returns true when the envelope is the {@link GlobalEventEnvelope} variant. */
export function isGlobalEnvelope(envelope: AnyEventEnvelope): envelope is GlobalEventEnvelope {
  return !('company_id' in envelope);
}

/** Returns true when the context is the {@link GlobalEventContext} variant. */
export function isGlobalContext(context: AnyEventContext): context is GlobalEventContext {
  return !('companyId' in context);
}
```

**Line estimate:** ~30 lines.

### Step 9 — Create `EventScope` enum

**File (new):** `src/common/envelope/event-scope.enum.ts`

```ts
/**
 * Identifies whether an event is scoped to a tenant or to the global/platform scope.
 *
 * Used by `@EmitEvent` / `@OnEvent` metadata to drive subject routing:
 * - `tenant` → subject prefix `company.{companyId}...` (default; backward-compatible)
 * - `global` → subject prefix `global....`
 */
export enum EventScope {
  TENANT = 'tenant',
  GLOBAL = 'global',
}
```

**Line estimate:** ~15 lines.

### Step 10 — Update envelope barrel file

**File (modify):** `src/common/envelope/index.ts`

```ts
export { BaseEventEnvelope } from './base-event-envelope.class';
export { EventEnvelope } from './event-envelope.class';
export { GlobalEventEnvelope } from './global-event-envelope.class';
export { EventBase } from './event-base.class';
export { GlobalEventBase } from './global-event-base.class';
export { ActorType } from './actor-type.enum';
export { EventScope } from './event-scope.enum';
export { BaseEventContext } from './base-event-context.interface';
export { EventContext } from './event-context.interface';
export { GlobalEventContext } from './global-event-context.interface';
export { AnyEventEnvelope, AnyEventContext, isGlobalEnvelope, isGlobalContext } from './envelope-types';
export { IsOptionalForSystemActors } from './validators';
```

**Line estimate:** ~16 lines.

### Step 11 — Create `BuildGlobalSubjectDto`

**File (new):** `src/common/dto/build-global-subject.dto.ts`

```ts
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Validated parameter object for building GLOBAL NATS subjects.
 *
 * The {@link SubjectBuilder.buildGlobal} uses this DTO to generate subjects
 * in the format: `global.{domain}.{entity}.{action}.v{version}`
 */
export class BuildGlobalSubjectDto {
  @IsString() @IsNotEmpty() domain!: string;
  @IsString() @IsNotEmpty() entity!: string;
  @IsString() @IsNotEmpty() action!: string;
  @IsString() @IsNotEmpty() version: string = '1';
}
```

**Line estimate:** ~30 lines (with JSDoc).

### Step 12 — Update DTO barrel file

**File (modify):** `src/common/dto/index.ts`

```ts
export { BuildSubjectDto } from './build-subject.dto';
export { BuildGlobalSubjectDto } from './build-global-subject.dto';
```

### Step 13 — Extract subject parser into new file

**File (new):** `src/common/utils/subject-parser.ts`

Move from `subject.builder.ts`:
- `RESPONSE_SUFFIX` constant
- `SubjectParseResult` interface
- `SUBJECT_SEGMENTS_PATTERN` const + `parseSubjectSegments` function
- `buildResponseSubject` function

Then add:
- `GlobalSubjectParseResult` interface
- `GLOBAL_SUBJECT_SEGMENTS_PATTERN` const: `/^global\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-.]+)\.v(\d+)$/i`
- `parseGlobalSubjectSegments(subject)` function (mirror of tenant parser)
- `buildGlobalResponseSubject(requestSubject)` function — mirrors `buildResponseSubject` but prefixes with `global.` and skips companyId.

**Line estimate:** ~110 lines.

### Step 14 — Refactor `subject.builder.ts`

**File (modify):** `src/common/utils/subject.builder.ts`

Remove the moved symbols and re-export them from `subject-parser.ts` (to preserve public API for `RESPONSE_SUFFIX`, `SubjectParseResult`, `buildResponseSubject`).

Add to `SubjectBuilder`:
```ts
buildGlobal(dto: BuildGlobalSubjectDto): string {
  return `global.${dto.domain}.${dto.entity}.${dto.action}.v${dto.version}`;
}
```

Add standalone functions:
```ts
export function buildGlobalSubject(dto: BuildGlobalSubjectDto): string {
  return new SubjectBuilder().buildGlobal(dto);
}

export function isGlobalSubject(subject: string): boolean {
  return subject.startsWith('global.');
}
```

Add a new export for `GlobalSubjectParseResult` and `buildGlobalResponseSubject` (re-export from `subject-parser.ts`).

**Line estimate:** ~85 lines.

### Step 15 — Update utils barrel file

**File (modify):** `src/common/utils/index.ts`

```ts
export {
  SubjectBuilder,
  buildSubject,
  buildGlobalSubject,
  isGlobalSubject,
  buildDlqSubject,
  DLQ_SUBJECT_PREFIX,
} from './subject.builder';
export type { SubjectParseResult } from './subject.builder';
export {
  RESPONSE_SUFFIX,
  buildResponseSubject,
  buildGlobalResponseSubject,
  GlobalSubjectParseResult,
} from './subject-parser';
export { generateUuidV7, generateEventId } from './uuid.utils';
export { nowIso } from './date.utils';
export { createEvent, createGlobalEvent } from './event.factory';
export { encodeEvent, decodeEvent } from './serialization.utils';
export { sanitizeCompanyId, assertValidCompanyId, validateSubject, sanitizeSubjectPart } from './security.utils';
```

### Step 16 — Extend `event.factory.ts` with `createGlobalEvent`

**File (modify):** `src/common/utils/event.factory.ts`

Add:
```ts
import { GlobalEventContext } from '../envelope/global-event-context.interface';
import { GlobalEventEnvelope } from '../envelope/global-event-envelope.class';

/**
 * Creates a fully-populated {@link GlobalEventEnvelope} for tenant-less operations.
 *
 * Auto-fills `id` (UUIDv7 `evt_`-prefixed) and `produced_at` (ISO 8601 UTC).
 *
 * @typeParam T - The domain-specific business payload type.
 * @returns A fully-initialized {@link GlobalEventEnvelope} instance.
 */
export function createGlobalEvent<T>(data: T, context: GlobalEventContext): GlobalEventEnvelope<T> {
  return new GlobalEventEnvelope<T>({
    id: generateEventId(),
    produced_at: nowIso(),
    type: context.type,
    version: context.version,
    producer: context.producer,
    actor_type: context.actorType,
    actor_id: context.actorId,
    correlation_id: context.correlationId,
    causation_id: context.causationId,
    trace_id: context.traceId,
    reply_to: context.replyTo,
    data,
  });
}
```

**Line estimate:** ~85 lines total.

### Step 17 — Update `ProducerService`

**File (modify):** `src/producer/producer.service.ts`

1. Import `AnyEventEnvelope`, `GlobalEventContext`, `GlobalEventEnvelope`, `isGlobalContext`.
2. Add exported interface:
   ```ts
   export interface EmitGlobalOptions<T> {
     subject: string;
     data: T;
     context: GlobalEventContext;
   }
   ```
3. Widen `publish(subject, event: AnyEventEnvelope<unknown>)`.
4. In `toLogContext` and `toErrorLogContext`, change parameter type to `AnyEventEnvelope<unknown>` (body unchanged — only common fields are read).
5. Add:
   ```ts
   async emitGlobal<T>(options: EmitGlobalOptions<T>): Promise<void> {
     const envelope = this.buildGlobalEnvelope(options);
     await this.publish(options.subject, envelope);
   }

   private buildGlobalEnvelope<T>(options: EmitGlobalOptions<T>): GlobalEventEnvelope<T> {
     const { context, data } = options;
     return new GlobalEventEnvelope<T>({
       id: generateEventId(),
       produced_at: nowIso(),
       type: context.type,
       version: context.version,
       producer: context.producer,
       actor_type: context.actorType,
       actor_id: context.actorId,
       correlation_id: context.correlationId,
       causation_id: context.causationId,
       trace_id: context.traceId,
       reply_to: context.replyTo,
       data,
     });
   }
   ```

**Line estimate:** ~140 lines.

### Step 18 — Update producer barrel

**File (modify):** `src/producer/index.ts`

Add `EmitGlobalOptions`:
```ts
export { ProducerService, EmitOptions, EmitGlobalOptions } from './producer.service';
```

### Step 19 — Extend `EmitEvent` decorator with scope

**File (modify):** `src/producer/decorators/emit-event.decorator.ts`

1. Import `EventScope` from `'../../common/envelope/event-scope.enum'`.
2. Add optional field `scope?: EventScope` to both `EmitEventMetadata` and `EmitEventOptions`.
3. In `EmitEvent(eventType, options)`: `metadata = { eventType, ...options }` already carries `scope` when provided (TS spreads it).

**Line estimate:** ~65 lines.

### Step 20 — Update `EmitEventInterceptor` for global scope

**File (modify):** `src/producer/decorators/emit-event-interceptor.ts`

1. Import `EventScope`, `GlobalEventContext`.
2. Add `scope` to `EmitEventInput` (`scope?: EventScope`).
3. Pass `scope` from `metadata` into `emitEvent`.
4. Modify `buildSubject`:
   ```ts
   private buildSubject(metadata: EmitEventMetadata, eventContext: EventContext, scope?: EventScope): string {
     if (scope === EventScope.GLOBAL) return `global.${metadata.eventType}.v${metadata.version}`;
     return `company.${eventContext.companyId}.${metadata.eventType}.v${metadata.version}`;
   }
   ```
5. Modify `emitEvent` to branch on scope:
   - If scope `GLOBAL`: ensure context is a `GlobalEventContext` (duck-typed: has `type` and not `companyId`), then `await this.producerService.emitGlobal({ subject, data, context: ctxAsGlobal })`.
   - Else: existing tenant flow.
   Because TS can't narrow a union on a duck-typed object easily, cast context based on scope. Provide a small helper `private isGlobalContextScope(scope?: EventScope): boolean { return scope === EventScope.GLOBAL; }`.
6. Modify `hasRequiredContextFields` to accept either tenant or global: just check `'type' in arg`. Tenant additionally requires `'companyId' in arg`. Use a guard helper rather than a complex condition (single-section boolean rule):
   ```ts
   private hasRequiredContextFields(arg: Record<string, unknown>): boolean {
     return 'type' in arg;
   }
   ```
   (We retain widening — both contexts have `type`.)

**Line estimate:** ~115 lines.

### Step 21 — Widen `ConsumerService`

**File (modify):** `src/consumer/consumer.service.ts`

1. Import `AnyEventEnvelope`, `AnyEventContext`.
2. Change `EventHandler = (event: AnyEventEnvelope<unknown>, context: AnyEventContext) => Promise<void>`.
3. `DispatchOptions` unchanged at this file level ( wired via the interface file in Step 22).

**Line estimate:** ~60 lines.

### Step 22 — Widen `DispatchOptions`

**File (modify):** `src/consumer/dispatch-options.interface.ts`

```ts
import { AnyEventEnvelope, AnyEventContext } from '../common/envelope/envelope-types';

export interface DispatchOptions {
  subject: string;
  event: AnyEventEnvelope<unknown>;
  context: AnyEventContext;
}
```

### Step 23 — Update `subscribe-options.interface.ts`

**File (modify):** `src/consumer/subscribe-options.interface.ts`

1. Import `AnyEventEnvelope`, `AnyEventContext`, `GlobalEventEnvelope`, `GlobalEventContext`, `isGlobalSubject`, `buildDlqSubject` is already imported.
2. Replace `envelopeToContext` with:
   ```ts
   export function envelopeToTenantContext(envelope: EventEnvelope<unknown>): EventContext { /* existing body */ }
   export function envelopeToGlobalContext(envelope: GlobalEventEnvelope<unknown>): GlobalEventContext {
     return { type, version, producer, actorType, actorId, correlationId, causationId, traceId, replyTo };
   }
   export function envelopeToContext(envelope: AnyEventEnvelope<unknown>, subject: string): AnyEventContext {
     return isGlobalSubject(subject)
       ? envelopeToGlobalContext(envelope as GlobalEventEnvelope<unknown>)
       : envelopeToTenantContext(envelope as EventEnvelope<unknown>);
   }
   ```
3. Keep `defaultDlqSubjectBuilder`, `SubscribeOptions`, `ValidationErrorOptions`, `ErrorHandlingOptions`, `DlqRoutingOptions` unchanged.

**Line estimate:** ~125 lines.

### Step 24 — Create shared `envelope-validation.util.ts`

**File (new):** `src/consumer/envelope-validation.util.ts`

Extract the duplicated logic from `jetstream-consumer.service.ts` and `request-reply-message-processor.ts`:

```ts
import { JsMsg } from 'nats';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { isGlobalSubject } from '../common/utils/subject.builder';
import { ValidationErrorOptions } from './subscribe-options.interface';

export class EnvelopeValidationUtil {
  static parseMessageData(msg: JsMsg): Record<string, unknown> { /* lifted */ }
  static validateEnvelope(plain: Record<string, unknown>, subject: string): AnyEventEnvelope<unknown> {
    const cls = this.pickEnvelopeClass(subject);
    const envelope = plainToInstance(cls, plain);
    const errors = validateSync(envelope);
    if (errors.length > 0) throw this.createValidationException({ errors, subject, plain });
    return envelope as AnyEventEnvelope<unknown>;
  }
  static createValidationException(options: ValidationErrorOptions): EventConsumerException { /* lifted */ }
  private static pickEnvelopeClass(subject: string): typeof EventEnvelope | typeof GlobalEventEnvelope {
    return isGlobalSubject(subject) ? GlobalEventEnvelope : EventEnvelope;
  }
  private static isInvalidEventPayload(parsed: unknown): boolean { /* lifted */ }
}
```

**Line estimate:** ~110 lines.

### Step 25 — Refactor `jetstream-consumer.service.ts` to use the util

**File (modify):** `src/consumer/jetstream-consumer.service.ts`

1. Remove `plainToInstance`/`validateSync` imports and local `parseMessageData`, `validateEnvelope`, `createValidationException`, `isInvalidEventPayload` methods.
2. Import `EnvelopeValidationUtil` and `AnyEventEnvelope`.
3. In `handleMessage`, replace validation logic with `const envelope = EnvelopeValidationUtil.validateEnvelope(plain, msg.subject)` and `const context = envelopeToContext(envelope, msg.subject)`.
4. Update `toLogContext(envelope: AnyEventEnvelope<unknown>)` (already only reads common fields).

**Line estimate:** ~150 lines (down from 198).

### Step 26 — Refactor `request-reply-message-processor.ts` to use the util

**File (modify):** `src/consumer/request-reply-message-processor.ts`

Same approach as Step 25. Replace duplicated methods with `EnvelopeValidationUtil` calls and `envelopeToContext(envelope, subject)`.

**Line estimate:** ~130 lines (down from 185).

### Step 27 — Update `RequestReplyConsumerService.dispatch`

**File (modify):** `src/consumer/request-reply-consumer.service.ts`

Change `options.event.company_id` to a safe lookup — only used for handler keying. Tenant lookup path:
```ts
const tenantId = 'company_id' in options.event ? options.event.company_id : undefined;
const handler = this.findHandler(options.event.type, tenantId);
```
No other body change.

### Step 28 — Extend `OnEvent` decorator and explorer with scope

**File (modify):** `src/consumer/decorators/on-event.decorator.ts`

Add optional `scope?: EventScope` to `OnEventMetadata` and `OnEventOptions`. `EventScope` imported.

**File (modify):** `src/consumer/decorators/on-event.explorer.ts`

Update `buildWildcardSubject`:
```ts
private buildWildcardSubject(metadata: OnEventMetadata): string {
  if (metadata.scope === EventScope.GLOBAL) return `global.${metadata.eventType}.v${metadata.version}`;
  return `company.*.${metadata.eventType}.v${metadata.version}`;
}
```
Add `EventScope` import.

### Step 29 — Widen outbox types

**File (modify):** `src/outbox/outbox.types.ts`

```ts
import { AnyEventEnvelope } from '../common/envelope/envelope-types';

export interface SaveOutboxEntryParams {
  event: AnyEventEnvelope<unknown>;
  subject: string;
  metadata?: unknown;
  transactionContext?: TransactionContext;
}
```

### Step 30 — Widen `SaveInTransactionParams`

**File (modify):** `src/outbox/save-in-transaction-params.interface.ts`

```ts
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
export interface SaveInTransactionParams {
  readonly event: AnyEventEnvelope<unknown>;
  readonly subject: string;
  readonly transactionContext: TransactionContext;
}
```

### Step 31 — Create `AsyncGlobalRequestEventContext`

**File (new):** `src/outbox/async-global-request-event-context.interface.ts`

```ts
import type { GlobalEventContext } from '../common/envelope/global-event-context.interface';

/**
 * GlobalEventContext with `replyTo` required — used by async request-reply
 * operations through the outbox that publish GLOBAL request events.
 */
export interface AsyncGlobalRequestEventContext extends GlobalEventContext {
  replyTo: string;
}
```

### Step 32 — Widen `SendAsyncRequestThroughOutboxOptions`

**File (modify):** `src/outbox/send-async-request-through-outbox-options.interface.ts`

```ts
import type { AsyncRequestEventContext } from './async-request-event-context.interface';
import type { AsyncGlobalRequestEventContext } from './async-global-request-event-context.interface';

export interface SendAsyncRequestThroughOutboxOptions<T> {
  subject: string;
  payload: T;
  context: AsyncRequestEventContext | AsyncGlobalRequestEventContext;
}
```

### Step 33 — Update `OutboxService`

**File (modify):** `src/outbox/outbox.service.ts`

1. Import `AnyEventEnvelope`, `GlobalEventEnvelope`, `GlobalEventContext`, `AsyncGlobalRequestEventContext`, `createGlobalEvent`, `isGlobalContext`.
2. Replace every `EventEnvelope<unknown>` parameter type with `AnyEventEnvelope<unknown>` in `saveToOutbox`, `sendRequestThroughOutbox`, `publishEntry` (via repository), `routeToDlq` (via `createDlqEnvelope`).
3. Inside `sendAsyncRequestThroughOutbox`:
   ```ts
   const envelope = isGlobalContext(options.context)
     ? createGlobalEvent(options.payload, options.context)
     : createEvent(options.payload, options.context);
   ```

**Line estimate:** ~196 lines (borderline). If exceeding 200 after implementation, follow the mitigation in §1.4.

### Step 34 — Update `outbox-request-reply.helpers.ts`

**File (modify):** `src/outbox/outbox-request-reply.helpers.ts`

```ts
import { AnyEventEnvelope } from '../common/envelope/envelope-types';

export function ensureReplyToPresent(event: AnyEventEnvelope<unknown>): asserts event is AnyEventEnvelope<unknown> & { reply_to: string } {
  if (!event.reply_to) {
    throw new OutboxRequestReplyException({
      message: `sendRequestThroughOutbox requires event with reply_to; event ${event.id} (${event.type}) is missing reply_to`,
      eventId: event.id,
      eventType: event.type,
    });
  }
}
```

### Step 35 — Update `outbox.utils.ts`

**File (modify):** `src/outbox/utils.ts`

1. Import `AnyEventEnvelope`, `EventEnvelope`, `GlobalEventEnvelope`, `isGlobalEnvelope`.
2. `parseEnvelope(entry): AnyEventEnvelope<unknown>` — JSON-parse returns `AnyEventEnvelope<unknown>`.
3. `createDlqEnvelope(envelope: AnyEventEnvelope<unknown>, payload): AnyEventEnvelope<unknown>`:
   ```ts
   export function createDlqEnvelope(envelope, dlqPayload): AnyEventEnvelope<unknown> {
     const base = {
       id: envelope.id, produced_at: new Date().toISOString(),
       type: envelope.type, version: envelope.version, producer: envelope.producer,
       actor_type: envelope.actor_type, actor_id: envelope.actor_id,
       correlation_id: envelope.correlation_id, causation_id: envelope.causation_id,
       trace_id: envelope.trace_id, reply_to: envelope.reply_to, data: dlqPayload,
     };
     return isGlobalEnvelope(envelope)
       ? new GlobalEventEnvelope<unknown>(base)
       : new EventEnvelope<unknown>({ ...base, company_id: envelope.company_id });
   }
   ```

**Line estimate:** ~75 lines.

### Step 36 — Update Request-Reply types

**File (modify):** `src/request-reply/request-reply.types.ts`

```ts
import type { EventContext, GlobalEventContext, AnyEventEnvelope, AnyEventContext } from '../common/envelope/envelope-types';

export interface SendRequestOptions<T> {
  subject: string;
  payload: T;
  context: EventContext | GlobalEventContext;
}

export interface BuildResponseEnvelopeOptions<R> {
  requestEvent: AnyEventEnvelope<unknown>;
  responseContext: AnyEventContext;
  responseData: R;
}
```

### Step 37 — Update `request-reply.helpers.ts`

**File (modify):** `src/request-reply/request-reply.helpers.ts`

1. Import `GlobalEventContext`, `GlobalEventEnvelope`, `AnyEventEnvelope`, `AnyEventContext`, `isGlobalContext`.
2. Keep `buildEnvelope(context: EventContext, payload: T)` (tenant).
3. Add:
   ```ts
   export function buildGlobalEnvelope<T>(context: GlobalEventContext, payload: T): GlobalEventEnvelope<T> {
     return new GlobalEventEnvelope<T>({
       id: generateEventId(), produced_at: nowIso(),
       type: context.type, version: context.version, producer: context.producer,
       actor_type: context.actorType, actor_id: context.actorId,
       correlation_id: context.correlationId, causation_id: context.causationId,
       trace_id: context.traceId, reply_to: context.replyTo, data: payload,
     });
   }
   ```
4. Widen helper signatures (`logRequestSent`, `logReplyReceived`, `logRequestError`, `toLogContext`, `toErrorLogContext`, `wrapRequestError`) to `AnyEventEnvelope<unknown>`. Bodies unchanged (only read common fields).

**Line estimate:** ~125 lines.

### Step 38 — Update `RequestReplyService`

**File (modify):** `src/request-reply/request-reply.service.ts`

1. Imports: `AnyEventEnvelope`, `AnyEventContext`, `EventContext`, `GlobalEventContext`, `buildEnvelope`, `buildGlobalEnvelope`, `isGlobalContext`.
2. `request<T, R>(subject, payload, options: … & { context: EventContext | GlobalEventContext })` — branch envelope build:
   ```ts
   const envelope = isGlobalContext(context) ? buildGlobalEnvelope(context, payload) : buildEnvelope(context, payload);
   ```
3. `sendResponse(correlationId, responseEvent: AnyEventEnvelope<unknown>)` — type widen only.
4. `isRequestReplyMessage(event: AnyEventEnvelope<unknown>)` — type widen only.
5. `sendRequest<T>(options: SendRequestOptions<T>)` — branch:
   ```ts
   const envelope = isGlobalContext(options.context)
     ? buildGlobalEnvelope(options.context, options.payload)
     : buildEnvelope(options.context, options.payload);
   ```
6. `buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): AnyEventEnvelope<R>` — branch on response context type:
   ```ts
   const preservedContext: AnyEventContext = {
     ...options.responseContext,
     correlationId: options.requestEvent.correlation_id,
     causationId: options.requestEvent.id,
   };
   return isGlobalContext(preservedContext)
     ? buildGlobalEnvelope(preservedContext, options.responseData)
     : buildEnvelope(preservedContext, options.responseData);
   ```
   Note: when `responseContext` is a partial-spread `EventContext`, `isGlobalContext` returns true only if `companyId` is absent.

**Line estimate:** ~155 lines.

### Step 39 — Update Request-Reply barrel

**File (modify):** `src/request-reply/index.ts`

No new top-level exports needed beyond the widened method shapes (already exported via `RequestReplyService`). No change required; verify `AsyncGlobalRequestEventContext`/`GlobalEventContext` are reachable via `src/common/...`.

### Step 40 — Update consumer barrel

**File (modify):** `src/consumer/index.ts`

Add `Envelop`eValidationUtil is **internal-only** — not exported. No change required except confirming `DispatchOptions` already exported. Verify `envelopeToContext`, `envelopeToGlobalContext`, `envelopeToTenantContext` are exported.

Add:
```ts
export { envelopeToContext, envelopeToTenantContext, envelopeToGlobalContext } from './subscribe-options.interface';
```

### Step 41 — Update outbox barrel

**File (modify):** `src/outbox/index.ts`

Add export of `AsyncGlobalRequestEventContext`:
```ts
export { AsyncGlobalRequestEventContext } from './async-global-request-event-context.interface';
```

### Step 42 — Verify `src/index.ts` (no change)

`src/index.ts` already re-exports `./common`, `./producer`, `./consumer`, `./request-reply`, `./outbox`, etc. New symbols propagate automatically. Verify nothing leaks. **No edit needed.**

---

## 3. New Tests (atomic, one spec per concern)

### Step 43 — `global-event-envelope.validation.spec.ts`

**File (new):** `src/common/envelope/global-event-envelope.validation.spec.ts`

Covers:
- `plainToInstance(GlobalEventEnvelope, validBaseProps)` validates with zero errors, even when `company_id` is **absent**.
- Rejecting missing required common fields (`id`, `type`, `produced_at`, `producer`, `correlation_id`, `actor_type`, `data`).
- Still applying `@IsOptionalForSystemActors()` on `actor_id` (system/scheduler/external_api optional; client/company_user required).
- `GlobalEventEnvelope` **is not an instance of `EventEnvelope`**, but **is an instance of `BaseEventEnvelope`**.

Reuse the `createValidProperties` fixture from `event-envelope.fixture.ts` to derive a global fixture helper `createValidGlobalProperties()`.

### Step 44 — `global-event-base.spec.ts`

**File (new):** `src/common/envelope/global-event-base.spec.ts`

Mirror of `event-base.spec.ts` for `GlobalEventBase`: defines a `class TestCompanyCreatedEvent extends GlobalEventBase<...>`, validates plain-to-instance, asserts `instanceof GlobalEventEnvelope` / `BaseEventEnvelope` and **not** `EventEnvelope`.

### Step 45 — `build-global-subject.dto.spec.ts`

**File (new):** `src/common/dto/build-global-subject.dto.spec.ts`

Covers: valid DTO accepts; rejects missing/empty `domain`/`entity`/`action`; default version `"1"`.

### Step 46 — `subject.global.spec.ts` (or extend `subject.builder.spec.ts`)

**File (new):** `src/common/utils/subject.global.spec.ts`

Covers:
- `SubjectBuilder.buildGlobal(dto)` produces `global.{domain}.{entity}.{action}.v{version}`.
- `buildGlobalSubject(dto)` returns the same result.
- `isGlobalSubject('global.company.created.v1')` → true; `isGlobalSubject('company.abc…')` → false.
- `buildGlobalResponseSubject('global.iam.company.created.v1')` → `'global.iam.company.created.response.v1'`.
- `buildResponseSubject` still rejects `global.…` subjects with the "invalid subject format" error (so consumers can't accidentally mix regimes).

### Step 47 — `event.factory.global.spec.ts`

**File (new):** `src/common/utils/event.factory.global.spec.ts`

Covers `createGlobalEvent`: returns `GlobalEventEnvelope`; auto-fills `id` (UUIDv7 `evt_`), `produced_at` (ISO 8601); maps `version`, `type`, `producer`, `actorType`, `actorId` (optional), `correlationId`, optional `causationId`/`traceId`/`replyTo`; `data` preserved; **no `company_id`** on the result.
Validate the result with `validateSync(plainToInstance(GlobalEventEnvelope, event))` to ensure 0 errors.

### Step 48 — Extend `consumer.service.spec.ts` for dual-type dispatch

**File (modify):** `src/consumer/consumer.service.spec.ts`

Add a `describe('dual-type dispatch', …)` block:
- Build a `GlobalEventEnvelope` mock event and a `GlobalEventContext`.
- Register handler for a global subject.
- Dispatch with `subject: 'global.iam.company.created.v1'`, assert handler invoked with `(globalEvent, globalContext)`.

If the spec exceeds 200 lines, split into `consumer.service.dual-type.spec.ts`.

### Step 49 — `jetstream-consumer.global.spec.ts`

**File (new):** `src/consumer/jetstream-consumer.global.spec.ts`

Covers:
- Valid `GlobalEventEnvelope` envelope on a `global.iam.company.created.v1` subject is dispatched and acked.
- Invalid `GlobalEventEnvelope` on global subject (e.g., missing `correlation_id`) is routed to DLQ (`dlq.global.…`) and acked.
- A `GlobalEventEnvelope` with a **present** `company_id` flag is rejected (since `GlobalEventEnvelope` doesn't declare the field, class-validator would not error on extra plain properties — verify the chosen behavior). If we want hard rejection of extra fields, we would need `@Allow()` or `whitelist` mode; document the decision in the spec comment and either:
  - (a) Accept extra `company_id` as a tolerated plain field, OR
  - (b) Configure `plainToInstance(GlobalEventEnvelope, plain, { enableImplicitConversion: false })` + `validateSync(envelope, { whitelist: true, forbidNonWhitelisted: true })` in `EnvelopeValidationUtil.validateEnvelope` to reject unknown fields.
  
  **Decision:** Use option (b) — `validateSync(envelope, { whitelist: false, forbidNonWhitelisted: false })` (current default). Extra fields are tolerated (consistent with `EventEnvelope` behavior). The spec covers that extra `company_id` on a `GlobalEventEnvelope` doesn't break validation.

### Step 50 — Extend `producer.service.spec.ts` with global coverage

**File (modify):** `src/producer/producer.service.spec.ts`

Add `describe('emitGlobal', …)`:
- Sample `GlobalEventContext` (`type: 'iam.company.created'`, `producer`, `actorType: ActorType.SYSTEM`, `correlationId`).
- Assert `jetStream.publish` called with `global.iam.company.created.v1` subject.
- Assert published payload omits `company_id`.
- Assert logged context uses `eventId`/`eventType`/`subject` (no `companyId`).

Add `describe('publish with GlobalEventEnvelope', …)`:
- Build a `GlobalEventEnvelope` directly and call `publish('global.…', event)` — works without errors.

If the spec file crosses 200 lines, split into `producer.service.global.spec.ts`.

### Step 51 — `outbox.service.global.spec.ts`

**File (new):** `src/outbox/outbox.service.global.spec.ts`

Covers:
- `saveToOutbox(globalEvent, 'global.…')` persists without error (use the existing fixture pattern).
- `outbox.utils.createDlqEnvelope(globalEvent, payload)` returns a `GlobalEventEnvelope` instance, and its `id`/`type`/`actor_*`/`correlation_id` match the source, while **no** `company_id` is present.
- `OutboxService.sendAsyncRequestThroughOutbox({ subject: 'global.…', payload, context: AsyncGlobalRequestEventContext })` builds a `GlobalEventEnvelope` via `createGlobalEvent` (verify by inspecting saved event — no `company_id`).

### Step 52 — `request-reply.global.spec.ts`

**File (new):** `src/request-reply/request-reply.global.spec.ts`

Covers:
- `RequestReplyService.sendRequest({ context: GlobalEventContext({ replyTo }) })` builds a `GlobalEventEnvelope` and publishes to `global.…` subject.
- `RequestReplyService.buildResponseEnvelope({ requestEvent: GlobalEventEnvelope, responseContext: GlobalEventContext, responseData })` returns a `GlobalEventEnvelope` whose `correlation_id` matches the request's `correlation_id` and `causation_id` matches the request's `id`.
- Helper `buildGlobalEnvelope(context, payload)` returns `GlobalEventEnvelope` with mapped fields, `id` matching UUIDv7.

### Step 53 — Decorator/explorer scope specs

**File (modify):** `src/producer/decorators/emit-event.decorator.spec.ts` — add test: `EmitEvent('iam.company.created', { ..., scope: EventScope.GLOBAL })` stores `scope: 'global'` in metadata.

**File (new):** `src/producer/decorators/emit-event-interceptor.global.spec.ts` — cover `buildSubject` for global scope through `intercept()` (test via `concatMap` callback mock); cover `emitGlobal` is called by the interceptor when scope is global.

**File (modify):** `src/consumer/decorators/on-event.decorator.spec.ts` — add test for `scope` propagation.

**File (modify):** `src/consumer/decorators/on-event.explorer.spec.ts` — add test that `buildWildcardSubject({ scope: EventScope.GLOBAL, eventType: 'iam.company.created', version: '1' })` returns `'global.iam.company.created.v1'`.

If any spec crosses 200 lines, split into a `.global.spec.ts` sibling.

### Step 54 — Backward compatibility regression test

**File (new):** `src/regression-backward-compat.spec.ts` (or extend `entry-point-isolation.spec.ts`)

Programmatic regression asserting:
- `EventEnvelope` is still exported from `@cobranza-apps/events-toolkit` (`src/index.ts`).
- `EventContext`, `createEvent`, `buildSubject`, `BuildSubjectDto`, `SubjectBuilder`, `buildResponseSubject`, `buildDlqSubject`, `RESPONSE_SUFFIX`, `DLQ_SUBJECT_PREFIX`, `ProducerService`, `ConsumerService`, `OutboxService`, `RequestReplyService`, `EventBase`, `ActorType` — all still exported.
- `EventEnvelope` still has a `company_id` property in its type (via `new EventEnvelope().company_id`).

---

## 4. Final Verification

### Step 55 — Run full verification

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

All four must pass. The implementer must commit meaningful sub-step messages at the end of each logical step grouping (e.g., after §2 Steps 1–4, Steps 5–10, Steps 11–16, Steps 17–22, Steps 23–28, Steps 29–35, Steps 36–42, Steps 43–54, §4 Step 55).

### Step 55a — Lint touch-ups

Run `npm run lint:fix` and `npm run format` before final commit if any newly added files introduce style drift. Re-run `npm run lint` to confirm zero warnings.

### Step 55b — Build sanity check

After `npm run build`, inspect `dist/` for emitted `.d.ts` files for: `global-event-envelope.class.d.ts`, `build-global-subject.dto.d.ts`, `subject-parser.d.ts`, `envelope-validation.util.d.ts`. Confirm public entry points compile.

---

## 5. Acceptance Criteria (must all be true)

1. `GlobalEventEnvelope` and `GlobalEventContext` are exported from the public API.
2. `SubjectBuilder.buildGlobal(dto)`, `buildGlobalSubject(dto)`, `isGlobalSubject(subject)`, `buildGlobalResponseSubject(subject)` exist with documentation.
3. `BuildGlobalSubjectDto` validates `domain`/`entity`/`action`/`version` and rejects missing/empty.
4. `createGlobalEvent` factory exists and returns a validated `GlobalEventEnvelope`.
5. `ProducerService.publish` accepts `AnyEventEnvelope`; `ProducerService.emitGlobal` accepts a `GlobalEventContext`.
6. `ConsumerService`/`JetStreamConsumerService`/`RequestReplyConsumerService` accept both envelope/context variants and dispatch correctly based on subject prefix.
7. `OutboxService.saveToOutbox`, `saveInTransaction`, `sendRequestThroughOutbox`, `sendAsyncRequestThroughOutbox` accept `AnyEventEnvelope`/`AnyEventContext`.
8. `RequestReplyService.sendRequest`, `buildResponseEnvelope`, `request`, `sendResponse` accept both variants.
9. `@EmitEvent` and `@OnEvent` support `scope: EventScope.GLOBAL` and route to the right subject.
10. `jetstream-consumer.service.ts`, `outbox.service.ts`, `request-reply-message-processor.ts` stay under 200 lines.
11. No method body exceeds 50 lines; every method has at most 2 parameters.
12. `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
13. Existing public API stays backward compatible (asserted by regression test in Step 54).

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Class-validator decorator inheritance breaks validation | Step 2 verification re-runs the full existing `event-envelope.*.spec.ts` suite. If any failure occurs, fall back to re-declaring the common decorators on the subclass (duplicated stack) — less DRY but safe. |
| `plainToInstance(EventEnvelope, plain)` ignores parent decorators | Add explicit regression test before/after extraction; assertion is `validateSync(plainToInstance(EventEnvelope, plain)).length === 0` for a valid full payload. |
| `outbox.service.ts` crosses 200 lines after Step 33 | Extract `createEvent`-vs-`createGlobalEvent` branch into `src/common/utils/event-context-resolver.ts` exporting `createEventFromContext(context, payload)`. Use it from both `outbox.service.ts` and (optionally) elsewhere. |
| `emit-event-interceptor.ts` widening of `hasRequiredContextFields` weakens tenant validation | Keep tenant-specific check under `scope !== GLOBAL`; only relax for global scope. |
| Subject parser regex tolerates/forbids unknown prefixes | Tests at Steps 46–47 confirm `buildResponseSubject` rejects `global.…` subjects; `buildGlobalResponseSubject` rejects `company.…` subjects. |
| Mocks in `src/testing/*` build `EventEnvelope` only | Mocks are fine — they're a backward-compatible test harness. Document in CHANGELOG that mocks remain tenant-scoped (global testing is opt-in). |

---

## 7. Out of scope for this plan

- Documentation updates (`docs/global-events.md`, `docs/event-messaging-convention.md` §3/§5, `docs/ai-agent-guidelines.md`, `CHANGELOG.md`, `architecture.md`) — covered by Task 3.
- Property changes that enable new runtime behavior beyond what Task 2 specifies.
- Mock refactors in `src/testing/`.
- Removing any existing public symbol.

---

## 8. Plan path

`.kilo/plans/20260717-global-event-envelope-task2.md`