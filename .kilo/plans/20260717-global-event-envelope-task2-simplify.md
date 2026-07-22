# Task 2 — Code Simplification Plan

**Source TODO:** `.agent/todos/20260716/20260716-todo-2.md` (Task 2)
**Implementation plan:** `.kilo/plans/20260717-global-event-envelope-task2.md`
**Date:** 2026-07-17
**Scope:** Task 2 only

## Summary

The Task 2 implementation correctly introduces `GlobalEventEnvelope`, global subjects, and dual envelope support across producer, consumer, outbox, and request-reply modules. This plan identifies **safe simplifications** that remove duplication, tighten signatures, and reduce line count without changing observable behavior or breaking existing tests.

### Themes

1. **Envelope construction mapping is duplicated** in `event.factory.ts`, `producer.service.ts`, and `request-reply.helpers.ts`.
2. **Tenant/global subject parsing and response-subject derivation** repeat the same structure in `subject-parser.ts`.
3. **Context field extraction** is duplicated for tenant and global branches in `subscribe-options.interface.ts`.
4. **Identical parse-error exceptions** are created inline twice in `envelope-validation.util.ts`.
5. **Minor import redundancies and type-only export issues** can be cleaned up.

---

## Simplifications

### 1. `src/common/utils/event.factory.ts` — Extract common base-envelope properties

**Lines:** 23–66  
**Issue:** `createEvent` and `createGlobalEvent` both manually list the same 12 common properties. Only `company_id` differs.

**Proposed change:**

- Import `BaseEventContext` from `../envelope/base-event-context.interface`.
- Add a private helper `buildBaseEnvelopeProperties<T>(context, data)`.
- Let `createEvent` add `company_id` and `createGlobalEvent` return the base envelope directly.

**Replacement code:**

```ts
import { BaseEventContext } from '../envelope/base-event-context.interface';

function buildBaseEnvelopeProperties<T>(context: BaseEventContext, data: T): Partial<BaseEventEnvelope<T>> {
  return {
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
  };
}

export function createEvent<T>(data: T, context: EventContext): EventEnvelope<T> {
  return new EventEnvelope<T>({
    ...buildBaseEnvelopeProperties(context, data),
    company_id: context.companyId,
  });
}

export function createGlobalEvent<T>(data: T, context: GlobalEventContext): GlobalEventEnvelope<T> {
  return new GlobalEventEnvelope<T>(buildBaseEnvelopeProperties(context, data));
}
```

**Benefit:** Removes ~22 lines of duplicated property mapping and makes the only difference (`company_id`) explicit.

---

### 2. `src/request-reply/request-reply.helpers.ts` — Delegate envelope building to event factory

**Lines:** 1–46  
**Issue:** `buildEnvelope` and `buildGlobalEnvelope` duplicate the exact same mapping that `createEvent`/`createGlobalEvent` already implement.

**Proposed change:**

- Import `createEvent`, `createGlobalEvent` from `../common/utils/event.factory`.
- Replace both function bodies with single-line delegations.
- Remove now-unused imports `generateEventId` and `nowIso`.

**Replacement code (top of file):**

```ts
import { createEvent, createGlobalEvent } from '../common/utils/event.factory';
```

**Replacement code (functions):**

```ts
/** Builds a fully-populated tenant {@link EventEnvelope} from domain context and payload. */
export function buildEnvelope<T>(context: EventContext, payload: T): EventEnvelope<T> {
  return createEvent(payload, context);
}

/** Builds a fully-populated global {@link GlobalEventEnvelope} from domain context and payload. */
export function buildGlobalEnvelope<T>(context: GlobalEventContext, payload: T): GlobalEventEnvelope<T> {
  return createGlobalEvent(payload, context);
}
```

**Benefit:** Removes ~36 lines of duplication. Future envelope field changes require a single edit in `event.factory.ts`.

---

### 3. `src/producer/producer.service.ts` — Delegate envelope building to event factory

**Lines:** 97–132  
**Issue:** `buildEnvelope` and `buildGlobalEnvelope` repeat the same context-to-envelope mapping already present in `event.factory.ts`.

**Proposed change:**

- Import `createEvent`, `createGlobalEvent` from `../common/utils/event.factory`.
- Replace both private method bodies with single-line delegations.
- Remove now-unused imports `generateEventId` and `nowIso`.

**Replacement code (import):**

```ts
import { createEvent, createGlobalEvent } from '../common/utils/event.factory';
```

**Replacement code (methods):**

```ts
private buildEnvelope<T>(options: EmitOptions<T>): EventEnvelope<T> {
  return createEvent(options.data, options.context);
}

private buildGlobalEnvelope<T>(options: EmitGlobalOptions<T>): GlobalEventEnvelope<T> {
  return createGlobalEvent(options.data, options.context);
}
```

**Benefit:** Removes ~32 lines of duplication; shrinks `ProducerService` toward the 125-line ideal.

---

### 4. `src/common/utils/subject-parser.ts` — Extract shared parsing and response helpers

**Lines:** 47–121  
**Issue:** `parseSubjectSegments`/`parseGlobalSubjectSegments` and `buildResponseSubject`/`buildGlobalResponseSubject` are near-mirror implementations.

**Proposed change:**

- Add a generic `parseSubjectWithPattern` helper that matches a regex and throws a configured message.
- Add a generic `buildResponseSubjectFromParsed` helper that joins segments with an optional company-id segment.
- Refactor the four public/private functions to call these helpers.

**Replacement code (add after regex constants):**

```ts
function parseSubjectWithPattern(subject: string, pattern: RegExp, errorMessage: string): RegExpMatchArray {
  const match = subject.match(pattern);
  if (!match) {
    throw new Error(errorMessage);
  }
  return match;
}

function buildResponseSubjectFromParsed(
  prefix: string,
  parsed: { domain: string; entity: string; action: string; version: string },
  companyId?: string,
): string {
  const responseAction = parsed.action + RESPONSE_SUFFIX;
  const segments =
    companyId !== undefined
      ? [prefix, companyId, parsed.domain, parsed.entity, responseAction, `v${parsed.version}`]
      : [prefix, parsed.domain, parsed.entity, responseAction, `v${parsed.version}`];
  return segments.join('.');
}
```

**Replacement code (parse/response functions):**

```ts
function parseSubjectSegments(subject: string): SubjectParseResult {
  const match = parseSubjectWithPattern(
    subject,
    SUBJECT_SEGMENTS_PATTERN,
    `Invalid subject format: "${subject}". Expected: company.{companyId}.{domain}.{entity}.{action}.v{version}`,
  );
  return {
    companyId: match[1],
    domain: match[2],
    entity: match[3],
    action: match[4],
    version: match[5],
  };
}

export function buildResponseSubject(requestSubject: string): string {
  const parsed = parseSubjectSegments(requestSubject);
  return buildResponseSubjectFromParsed('company', parsed, parsed.companyId);
}

function parseGlobalSubjectSegments(subject: string): GlobalSubjectParseResult {
  const match = parseSubjectWithPattern(
    subject,
    GLOBAL_SUBJECT_SEGMENTS_PATTERN,
    `Invalid global subject format: "${subject}". Expected: global.{domain}.{entity}.{action}.v{version}`,
  );
  return {
    domain: match[1],
    entity: match[2],
    action: match[3],
    version: match[4],
  };
}

export function buildGlobalResponseSubject(requestSubject: string): string {
  const parsed = parseGlobalSubjectSegments(requestSubject);
  return buildResponseSubjectFromParsed('global', parsed);
}
```

**Benefit:** Removes ~20 lines of duplicated error-throwing and response-string formatting.

---

### 5. `src/consumer/subscribe-options.interface.ts` — Extract shared base context fields

**Lines:** 69–98  
**Issue:** `envelopeToTenantContext` and `envelopeToGlobalContext` list the same 9 fields; only `companyId` differs.

**Proposed change:**

- Import `BaseEventEnvelope` and `BaseEventContext` from `../common/envelope`.
- Add a private helper `extractBaseContextFields(envelope)`.
- Compose tenant/global contexts from that helper.

**Replacement code (imports):**

```ts
import { BaseEventEnvelope } from '../common/envelope/base-event-envelope.class';
import { BaseEventContext } from '../common/envelope/base-event-context.interface';
```

**Replacement code (helper and functions):**

```ts
function extractBaseContextFields(envelope: BaseEventEnvelope<unknown>): BaseEventContext {
  return {
    type: envelope.type,
    version: envelope.version,
    producer: envelope.producer,
    actorType: envelope.actor_type,
    actorId: envelope.actor_id,
    correlationId: envelope.correlation_id,
    causationId: envelope.causation_id,
    traceId: envelope.trace_id,
    replyTo: envelope.reply_to,
  };
}

export function envelopeToTenantContext(envelope: EventEnvelope<unknown>): EventContext {
  return {
    ...extractBaseContextFields(envelope),
    companyId: envelope.company_id,
  };
}

export function envelopeToGlobalContext(envelope: GlobalEventEnvelope<unknown>): GlobalEventContext {
  return extractBaseContextFields(envelope);
}
```

**Benefit:** Removes ~18 lines of duplicated field mapping.

---

### 6. `src/consumer/envelope-validation.util.ts` — Extract parse-exception helper

**Lines:** 26–45  
**Issue:** Two identical `EventConsumerException` blocks are constructed inline for JSON and object-shape errors.

**Proposed change:**

- Add a private static helper `createParseException(message)`.
- Replace both inline blocks with calls to the helper.

**Replacement code (helper):**

```ts
private static createParseException(message: string): EventConsumerException {
  return new EventConsumerException({
    message,
    eventId: 'unknown',
    eventType: 'unknown',
  });
}
```

**Replacement code (parseMessageData):**

```ts
static parseMessageData(msg: JsMsg): Record<string, unknown> {
  const text = new TextDecoder().decode(msg.data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw this.createParseException('Message payload is not valid JSON');
  }
  if (this.isInvalidEventPayload(parsed)) {
    throw this.createParseException('Message payload is not a valid JSON object');
  }
  return parsed as Record<string, unknown>;
}
```

**Benefit:** Removes duplicated exception shape and makes the message the only varying part.

---

### 7. `src/outbox/outbox.utils.ts` — Simplify DLQ envelope creation with spread

**Lines:** 44–67  
**Issue:** `createDlqEnvelope` manually copies every base field one by one.

**Proposed change:**

- Spread the original envelope, override `produced_at` and `data`, then construct the correct class.

**Replacement code:**

```ts
export function createDlqEnvelope(
  envelope: AnyEventEnvelope<unknown>,
  dlqPayload: Record<string, unknown>,
): AnyEventEnvelope<unknown> {
  const base = {
    ...envelope,
    produced_at: new Date().toISOString(),
    data: dlqPayload,
  };
  return isGlobalEnvelope(envelope)
    ? new GlobalEventEnvelope<unknown>(base)
    : new EventEnvelope<unknown>(base);
}
```

**Benefit:** Removes ~15 lines of manual field copying; preserves all fields including optional ones automatically.

---

### 8. `src/producer/decorators/emit-event-interceptor.ts` — Tighten `buildSubject` signature

**Lines:** 80–103  
**Issue:** `buildSubject` declares `scope?: EventScope`, but the caller in `emitEvent` always resolves it to a non-undefined value via `?? EventScope.TENANT`.

**Proposed change:**

- Change `buildSubject` signature to accept `scope: EventScope`.
- Keep the existing branch logic.

**Replacement code:**

```ts
private buildSubject(
  metadata: EmitEventMetadata,
  eventContext: EventContext | GlobalEventContext,
  scope: EventScope,
): string {
  if (scope === EventScope.GLOBAL) {
    return `global.${metadata.eventType}.v${metadata.version}`;
  }
  return `company.${(eventContext as EventContext).companyId}.${metadata.eventType}.v${metadata.version}`;
}
```

**Benefit:** Removes the misleading optional parameter and clarifies that the caller is responsible for defaulting.

---

### 9. `src/request-reply/request-reply.service.ts` — Replace inline import with normal import

**Lines:** 1–7 and 57–63  
**Issue:** Line 61 uses `import('../common/envelope/event-context.interface').EventContext` inline instead of importing `EventContext` at the top of the file.

**Proposed change:**

- Add `EventContext` to the existing import from `../common/envelope/event-context.interface` (currently only `GlobalEventContext` is imported).
- Replace the inline import in the `request` signature.

**Replacement code (import):**

```ts
import { EventContext } from '../common/envelope/event-context.interface';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
```

**Replacement code (signature):**

```ts
async request<T, R>(
  subject: string,
  payload: T,
  options: RequestReplyRequestOptions & { context: EventContext | GlobalEventContext },
): Promise<RequestReplyResponse<R>> {
```

**Benefit:** Cleaner imports and consistent with the rest of the codebase.

---

### 10. `src/outbox/outbox.service.ts` and `src/testing/mock-outbox.service.ts` — Merge duplicate envelope-types imports

**Issue:** Both files import `AnyEventEnvelope` and `isGlobalContext` in two separate statements from the same module.

**Files/lines:**

- `src/outbox/outbox.service.ts` lines 1–3
- `src/testing/mock-outbox.service.ts` lines 1–3

**Proposed change:**

Merge each pair into a single import.

**Replacement code for `src/outbox/outbox.service.ts`:**

```ts
import { AnyEventEnvelope, isGlobalContext } from '../common/envelope/envelope-types';
```

**Replacement code for `src/testing/mock-outbox.service.ts`:**

```ts
import { AnyEventEnvelope, AnyEventContext, isGlobalContext } from '../common/envelope/envelope-types';
```

**Benefit:** Removes redundant import statements.

---

### 11. `src/testing/mock-request-reply.service.ts` — Simplify response-envelope branch

**Lines:** 86–97  
**Issue:** `buildResponseEnvelope` uses an intermediate `tenantContext` variable and a verbose if/else, duplicating the simpler ternary used in `RequestReplyService`.

**Proposed change:**

- Replace the if/else block with a single ternary expression.

**Replacement code:**

```ts
buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): AnyEventEnvelope<R> {
  const preservedContext: AnyEventContext = {
    ...options.responseContext,
    correlationId: options.requestEvent.correlation_id,
    causationId: options.requestEvent.id,
  };
  return isGlobalContext(preservedContext)
    ? buildGlobalEnvelope(preservedContext, options.responseData)
    : buildEnvelope(preservedContext as EventContext, options.responseData);
}
```

**Benefit:** Removes the intermediate variable and aligns the mock with the production service.

---

### 12. `src/common/utils/subject.builder.ts` — Fix type-only re-exports

**Lines:** 104–110  
**Issue:** `SubjectParseResult` and `GlobalSubjectParseResult` are interface types, but they are re-exported in a value-export statement.

**Proposed change:**

- Split the re-export into value and type exports.

**Replacement code:**

```ts
export {
  RESPONSE_SUFFIX,
  buildResponseSubject,
  buildGlobalResponseSubject,
} from './subject-parser';
export type { SubjectParseResult, GlobalSubjectParseResult } from './subject-parser';
```

**Benefit:** Correct TypeScript semantics; avoids potential `isolatedModules` issues.

---

## Out of Scope

The following items were considered but intentionally excluded to avoid over-engineering or changing public API surface:

- **Merging `EmitOptions`/`EmitGlobalOptions` or `EmitEventMetadata`/`OnEventMetadata`:** They belong to different domains (producer vs. consumer) and merging them would couple unrelated modules.
- **Extracting a shared `processMessage` abstraction across `JetStreamConsumerService` and `RequestReplyMessageProcessor`:** The error-handling paths differ significantly (processor uses `isParseError` logic); extraction would add indirection without clear benefit.
- **Removing `EventEnvelope`/`GlobalEventEnvelope` constructor JSDoc duplication:** The constructors are small and the duplication preserves per-class documentation clarity.

---

## Verification

After applying the simplifications, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All commands must pass without test changes, since every proposed replacement is behavior-preserving.
