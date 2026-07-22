# Task 2 — Code Review / Fix Plan

**Source TODO:** `.agent/todos/20260716/20260716-todo-2.md` (Task 2)  
**Implementation plan:** `.kilo/plans/20260717-global-event-envelope-task2.md`  
**Branch:** `feat/relax-envelope-validation-and-global-events`  
**Reviewer date:** 2026-07-17  

---

## Executive Summary

The implementation of the `GlobalEventEnvelope` / global event routing feature is largely correct and the full verification suite passes. However, the review identified **one critical public-API bug**, **one critical runtime bug** in the `@EmitEvent` interceptor, **several test-coverage gaps**, and a **handful of project-rule violations** that must be addressed before the task is accepted.

### Verification Results

| Command | Result |
|---------|--------|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `npm test` | 81 suites, 713 tests pass |

> All verification passes, but passing tests do not cover the gaps identified below.

---

## Issues Found

### 1. Critical — `createGlobalEvent` not exported from public API barrel

**File:** `src/common/utils/index.ts`  
**Line:** 19  
**Deviation:** Implementation plan §Step 15 explicitly requires `export { createEvent, createGlobalEvent } from './event.factory';`. The current barrel only exports `createEvent`.

**Impact:** Consumers cannot import `createGlobalEvent` from the package public API (`@cobranza-apps/events-toolkit`). It is only reachable via a deep import.

**Fix:**
```ts
export { createEvent, createGlobalEvent } from './event.factory';
```

---

### 2. Critical — `@EmitEvent` interceptor weakens tenant-context validation

**File:** `src/producer/decorators/emit-event-interceptor.ts`  
**Lines:** 76–78, 80–103  
**Deviation:** Implementation plan §1.4 risk mitigation states: *"Keep tenant-specific check under `scope !== GLOBAL`; only relax for global scope."* The current code only checks `'type' in arg`, so a tenant-scoped event can accept a `GlobalEventContext` (no `companyId`), then line 102 casts the context and accesses `companyId`, producing a subject like `company.undefined.payment.proof.uploaded.v1`.

**Impact:** Runtime bug — tenant-scoped auto-emits silently publish to an invalid NATS subject when the caller passes a global context.

**Fix:**

Add a scope-aware guard and use it in `emitEvent`:

```ts
// inside EmitEventInterceptor
private hasRequiredContextFields(arg: Record<string, unknown>, scope?: EventScope): boolean {
  if (scope === EventScope.GLOBAL) {
    return 'type' in arg;
  }
  return 'type' in arg && 'companyId' in arg;
}

private isValidContextForScope(
  arg: Record<string, unknown>,
  scope?: EventScope,
): arg is EventContext | GlobalEventContext {
  return this.hasRequiredContextFields(arg, scope);
}
```

Update `isEventContext` (line 68) to pass scope:

```ts
private isEventContext(arg: unknown, scope?: EventScope): arg is Record<string, unknown> {
  return this.isNonNullObject(arg) && this.hasRequiredContextFields(arg, scope);
}
```

Update `findEventContext` (line 63) to read metadata so it can pass scope:

```ts
private findEventContext(
  context: ExecutionContext,
  scope?: EventScope,
): EventContext | GlobalEventContext | undefined {
  const args = context.getArgs();
  return args.find((arg): arg is EventContext | GlobalEventContext => this.isEventContext(arg, scope));
}
```

Update `handleEmission` (line 55) to pass scope to `findEventContext`:

```ts
private async handleEmission(input: EmissionInput): Promise<unknown> {
  const scope = input.metadata.scope ?? EventScope.TENANT;
  const eventContext = this.findEventContext(input.context, scope);
  if (eventContext) {
    await this.emitEvent({ metadata: input.metadata, eventContext, data: input.data });
  }
  return input.data;
}
```

Update `emitEvent` (line 80) to derive scope from metadata rather than recompute it:

```ts
private async emitEvent(input: EmitEventInput): Promise<void> {
  const scope = input.metadata.scope ?? EventScope.TENANT;
  const subject = this.buildSubject(input.metadata, input.eventContext, scope);
  if (scope === EventScope.GLOBAL) {
    await this.producerService.emitGlobal({
      subject,
      data: input.data,
      context: input.eventContext as GlobalEventContext,
    });
  } else {
    await this.producerService.emit({
      subject,
      data: input.data,
      context: input.eventContext as EventContext,
    });
  }
}
```

---

### 3. Project Rule Violation — `buildSubject` in interceptor has 3 parameters

**File:** `src/producer/decorators/emit-event-interceptor.ts`  
**Lines:** 94–103  
**Rule:** `.kilo/rules/max-arguments-per-method.md` (max 2 params; encapsulate in object when more).

**Impact:** The method violates the project rule. The plan itself showed the 3-param signature, but the implementation must still follow project rules.

**Fix:** Introduce a `BuildSubjectInput` parameter object:

```ts
interface BuildSubjectInput {
  metadata: EmitEventMetadata;
  eventContext: EventContext | GlobalEventContext;
  scope?: EventScope;
}

private buildSubject(input: BuildSubjectInput): string {
  if (input.scope === EventScope.GLOBAL) {
    return `global.${input.metadata.eventType}.v${input.metadata.version}`;
  }
  return `company.${(input.eventContext as EventContext).companyId}.${input.metadata.eventType}.v${input.metadata.version}`;
}
```

Call site:
```ts
const subject = this.buildSubject({ metadata, eventContext, scope });
```

---

### 4. High — Missing test file: `emit-event-interceptor.global.spec.ts`

**File:** `src/producer/decorators/emit-event-interceptor.global.spec.ts` (missing)  
**Deviation:** Implementation plan §Step 53 explicitly requires this file.

**Impact:** The global-scope path of the interceptor (`emitGlobal` call, `global.` subject building) is not covered by tests.

**Fix:** Create the file and cover:
- `@EmitEvent({ scope: EventScope.GLOBAL })` with a `GlobalEventContext` calls `producerService.emitGlobal`.
- Subject is `global.${eventType}.v${version}`.
- Published payload omits `company_id`.
- `@EmitEvent()` without `scope` still defaults to tenant and requires `companyId`.

Suggested content:
```ts
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { EmitEventInterceptor } from './emit-event-interceptor';
import { EmitEvent } from './emit-event.decorator';
import { ProducerService } from '../producer.service';
import { JETSTREAM_TOKEN } from '../producer.constants';
import { EventLoggerService } from '../../logging/event-logger.service';
import { EventScope } from '../../common/envelope/event-scope.enum';
import { GlobalEventContext } from '../../common/envelope/global-event-context.interface';
import { ActorType } from '../../common/envelope/actor-type.enum';
import { createMockExecutionContext, createMockCallHandler } from './__tests__/helpers';

jest.mock('../../common/utils/uuid.utils', () => ({
  generateEventId: jest.fn(() => 'evt_mock-uuid-9999'),
}));

jest.mock('../../common/utils/date.utils', () => ({
  nowIso: jest.fn(() => '2026-06-13T16:00:00.000Z'),
}));

const globalContext: GlobalEventContext = {
  type: 'iam.company.created',
  version: '1.0.0',
  producer: 'iam-service',
  actorType: ActorType.SYSTEM,
  correlationId: '770e8400-e29b-41d4-a716-446655440002',
};

describe('EmitEventInterceptor — global scope', () => {
  let interceptor: EmitEventInterceptor;
  let producerService: ProducerService;

  beforeEach(async () => {
    const jetStream = { publish: jest.fn().mockResolvedValue({}) };
    const mockLoggerService = { logEventEmitted: jest.fn(), logEventError: jest.fn() };

    const testingModule = await Test.createTestingModule({
      providers: [
        { provide: JETSTREAM_TOKEN, useValue: jetStream },
        { provide: EventLoggerService, useValue: mockLoggerService },
        ProducerService,
        Reflector,
      ],
    }).compile();

    producerService = testingModule.get(ProducerService);
    const reflector = testingModule.get(Reflector);
    interceptor = new EmitEventInterceptor(reflector, producerService);
  });

  async function subscribeToResult(result$: import('rxjs').Observable<unknown>): Promise<unknown[]> {
    const collected: unknown[] = [];
    await new Promise<void>((resolve) => {
      result$.subscribe({ next: (val) => collected.push(val), complete: resolve });
    });
    return collected;
  }

  it('emits a global event when scope is EventScope.GLOBAL', async () => {
    class GlobalProducer {
      @EmitEvent('iam.company.created', {
        version: '1',
        description: 'Company created',
        payloadExample: { name: 'Acme' },
        scope: EventScope.GLOBAL,
      })
      handleCreate(): void {}
    }
    const handler = GlobalProducer.prototype.handleCreate;
    const data = { name: 'Acme' };
    const context = createMockExecutionContext(handler, [data, globalContext]);
    const emitGlobalSpy = jest.spyOn(producerService, 'emitGlobal');
    await subscribeToResult(interceptor.intercept(context, createMockCallHandler(data)));
    expect(emitGlobalSpy).toHaveBeenCalledWith({
      subject: 'global.iam.company.created.v1',
      data,
      context: globalContext,
    });
  });
});
```

Also add a `globalContext` helper to `src/producer/decorators/__tests__/helpers.ts` or inline it in the new spec.

---

### 5. High — `jetstream-consumer.global.spec.ts` does not exercise the real service

**File:** `src/consumer/jetstream-consumer.global.spec.ts`  
**Deviation:** Implementation plan §Step 49 requires tests that exercise `JetStreamConsumerService` with global subjects (dispatch + DLQ routing). The current spec only tests `plainToInstance` / `validateSync` and manual `subject.startsWith` checks.

**Impact:** The integration between `EnvelopeValidationUtil`, `envelopeToContext`, and `JetStreamConsumerService` for global events is not covered.

**Fix:** Add integration tests using the existing `JetStreamConsumerService` test harness pattern (see `src/consumer/jetstream-consumer.service.spec.ts`). Verify:
- A valid global message is acked and dispatched with a `GlobalEventEnvelope` / `GlobalEventContext`.
- An invalid global message (missing `correlation_id`) is routed to `dlq.global.iam.company.created.v1` and acked.

---

### 6. High — `outbox.service.global.spec.ts` does not test `sendAsyncRequestThroughOutbox`

**File:** `src/outbox/outbox.service.global.spec.ts`  
**Deviation:** Implementation plan §Step 51 requires verifying that `OutboxService.sendAsyncRequestThroughOutbox({ subject: 'global.…', payload, context: AsyncGlobalRequestEventContext })` builds a `GlobalEventEnvelope` (no `company_id`). The current spec only tests helper functions.

**Impact:** The outbox service's global branch is not covered.

**Fix:** Add a test using `MockOutboxService` (or the real `OutboxService` with a test double repository) and assert the saved event is a `GlobalEventEnvelope` with `reply_to` and no `company_id`.

---

### 7. High — `request-reply.global.spec.ts` does not test `RequestReplyService`

**File:** `src/request-reply/request-reply.global.spec.ts`  
**Deviation:** Implementation plan §Step 52 requires testing `RequestReplyService.sendRequest` and `RequestReplyService.buildResponseEnvelope` with global contexts. The current spec only tests the helper `buildGlobalEnvelope`.

**Impact:** The service-level global request-reply flow is not covered.

**Fix:** Add tests using the existing `RequestReplyService` test harness pattern. Verify:
- `sendRequest({ context: GlobalEventContext, replyTo: 'global.response.queue' })` publishes a `GlobalEventEnvelope`.
- `buildResponseEnvelope({ requestEvent: GlobalEventEnvelope, responseContext: GlobalEventContext, responseData })` returns a `GlobalEventEnvelope` with correct `correlation_id` / `causation_id`.

---

### 8. Project Rule Violation — `regression-backward-compat.spec.ts` exceeds 200 lines

**File:** `src/regression-backward-compat.spec.ts`  
**Lines:** 201 total  
**Rule:** `.kilo/rules/max-lines-per-file.md` (source files in `src/` must not exceed 200 lines; excluding blanks/comments/imports ideally under 125).

**Impact:** The file is 1 line over the hard limit.

**Fix:** Split the spec into two files:
- `src/regression-backward-compat.spec.ts` — keep the tenant/backward-compatible assertions.
- `src/regression-global-api.spec.ts` — move the new global API assertions.

Both files should stay under 125 lines ideally.

---

### 9. Project Rule Violation — several modified functions have >2 parameters

These signatures were modified by Task 2 but remain over the 2-parameter limit:

| File | Function | Params | Lines |
|------|----------|--------|-------|
| `src/producer/producer.service.ts` | `toErrorLogContext` | 3 | 148 |
| `src/request-reply/request-reply.helpers.ts` | `logRequestError` | 4 | 87 |
| `src/request-reply/request-reply.helpers.ts` | `toErrorLogContext` | 3 | 108 |
| `src/request-reply/request-reply.service.ts` | `request` | 3 | 57 |

**Fix:** Encapsulate each in a parameter object. Example for `toErrorLogContext`:

```ts
interface ErrorLogContextInput {
  subject: string;
  event: AnyEventEnvelope<unknown>;
  error: unknown;
}

private toErrorLogContext(input: ErrorLogContextInput): EventErrorLogContext { ... }
```

For `request`:

```ts
export interface RequestEnvelopeOptions<T> {
  subject: string;
  payload: T;
  context: EventContext | GlobalEventContext;
}

async request<T, R>(options: RequestEnvelopeOptions<T> & RequestReplyRequestOptions): Promise<RequestReplyResponse<R>> { ... }
```

> Note: changing `request` signature is a **breaking change** to the public API. If backward compatibility is required, keep the old signature as a deprecated overload and route to the new object-based signature internally.

---

### 10. Low — `request-reply.service.ts` uses inline import type

**File:** `src/request-reply/request-reply.service.ts`  
**Line:** 61

```ts
context: GlobalEventContext | import('../common/envelope/event-context.interface').EventContext;
```

**Fix:** Add a normal import at the top of the file:

```ts
import { EventContext } from '../common/envelope/event-context.interface';
```

Then change the signature to:

```ts
context: GlobalEventContext | EventContext;
```

---

### 11. Low — redundant imports in `outbox.service.ts` and `mock-outbox.service.ts`

**Files:** `src/outbox/outbox.service.ts` (lines 2–3), `src/testing/mock-outbox.service.ts` (lines 2–3)  
**Fix:** Combine imports from `../common/envelope/envelope-types`:

```ts
import { AnyEventEnvelope, isGlobalContext } from '../common/envelope/envelope-types';
```

---

### 12. Low — `MockConsumerService.simulateEvent` cannot accept global events

**File:** `src/testing/mock-consumer.service.ts`  
**Line:** 54

```ts
async simulateEvent(subject: string, event: EventEnvelope<unknown>): Promise<void>
```

**Fix:** Widen the parameter to `AnyEventEnvelope<unknown>`:

```ts
async simulateEvent(subject: string, event: AnyEventEnvelope<unknown>): Promise<void>
```

---

### 13. Documentation Gap — `.agent/project-structure.md` not updated

**File:** `.agent/project-structure.md`  
**Rule:** `.kilo/rules/project-structure.md` requires the file to "accurately reflect the current project structure."

**Impact:** The descriptions for `common/envelope/`, `common/dto/`, `common/utils/`, `consumer/`, and `outbox/` are outdated after the new files were added.

**Fix:** Update the entries:

```markdown
- common/envelope/ - BaseEventEnvelope, EventEnvelope, GlobalEventEnvelope, EventBase, GlobalEventBase, ActorType, EventScope, EventContext, GlobalEventContext, BaseEventContext, envelope types/guards (barrel: index.ts)
- common/dto/ - BuildSubjectDto, BuildGlobalSubjectDto (barrel: index.ts)
- common/utils/ - SubjectBuilder, subject-parser, EventFactory (createEvent/createGlobalEvent), UUID, date, serialization, and security utilities (barrel: index.ts)
- consumer/ - ConsumerService, JetStreamConsumerService, RequestReplyConsumerService, RequestReplyMessageProcessor, EnvelopeValidationUtil, provider factories, and decorators (barrel: index.ts)
- outbox/ - OutboxModule, OutboxService, SqliteOutboxRepository, PostgresOutboxRepository, transaction context types, async request contexts (barrel: index.ts)
```

> This may be handled in Task 3 (documentation). If so, add a cross-reference to the Task 3 plan.

---

## Backward Compatibility Assessment

- `EventEnvelope`, `EventContext`, `EventBase`, `BuildSubjectDto`, `SubjectBuilder`, `buildSubject`, `buildResponseSubject`, `buildDlqSubject`, `RESPONSE_SUFFIX`, `DLQ_SUBJECT_PREFIX`, `createEvent`, `ProducerService.publish`, `ProducerService.emit`, `ConsumerService.dispatch`, `OutboxService` methods, and `RequestReplyService` methods keep their existing signatures from a TypeScript caller perspective. The parameter types are widened to unions, which is backward-compatible.
- New symbols are additive.
- The only potential breaking change is if we fix the `request` method's 3-parameter signature (Issue #9). A deprecated overload is recommended to preserve compatibility.

---

## Test Coverage Assessment

| Area | Spec Exists | Covers Service/Integration? | Gap |
|------|-------------|-----------------------------|-----|
| Global envelope validation | Yes | N/A | OK |
| Global event base | Yes | N/A | OK |
| Global subject DTO | Yes | N/A | OK |
| Global subject building/parsing | Yes | N/A | OK |
| Global event factory | Yes | N/A | OK |
| Consumer dual-type dispatch | Yes (in `consumer.service.spec.ts`) | Partially | OK |
| JetStream consumer global | Yes | **No** | Must add service-level tests |
| Producer global | Yes | Yes | OK |
| Outbox global | Yes | **No** | Must add `sendAsyncRequestThroughOutbox` test |
| Request-reply global | Yes | **No** | Must add `RequestReplyService` tests |
| `@EmitEvent` global scope | Yes (decorator metadata) | **No** | Missing `emit-event-interceptor.global.spec.ts` |
| `@OnEvent` global scope | Yes | Yes | OK |
| Backward compatibility | Yes | N/A | File too long (Issue #8) |

---

## Fix Priority Order

1. **Issue #1** — Add `createGlobalEvent` to `src/common/utils/index.ts` (public API fix).
2. **Issue #2** — Restore tenant context validation in `emit-event-interceptor.ts` (runtime bug).
3. **Issue #3** — Refactor `buildSubject` to a parameter object (project rule).
4. **Issue #4** — Create `emit-event-interceptor.global.spec.ts`.
5. **Issue #5** — Extend `jetstream-consumer.global.spec.ts` with service integration tests.
6. **Issue #6** — Extend `outbox.service.global.spec.ts` with `sendAsyncRequestThroughOutbox` test.
7. **Issue #7** — Extend `request-reply.global.spec.ts` with `RequestReplyService` tests.
8. **Issue #8** — Split `regression-backward-compat.spec.ts` to comply with max-lines rule.
9. **Issue #10** — Replace inline import type in `request-reply.service.ts`.
10. **Issue #11** — Combine redundant imports in `outbox.service.ts` and `mock-outbox.service.ts`.
11. **Issue #12** — Widen `MockConsumerService.simulateEvent` to `AnyEventEnvelope`.
12. **Issue #13** — Update `.agent/project-structure.md` (or link to Task 3).
13. **Issue #9** — Optionally refactor >2-param functions (assess breaking-change risk; use deprecated overloads if needed).

---

## Re-verification After Fixes

After all fixes are applied, run:

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

All four must pass.

---

## Plan Path

`.kilo/plans/20260717-global-event-envelope-task2-review.md`
