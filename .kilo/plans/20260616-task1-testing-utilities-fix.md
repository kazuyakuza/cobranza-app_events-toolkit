# Fix Plan: Task 1 — Testing Utilities Code Review

**Date:** 2026-06-16  
**Source Review:** `.kilo/plans/20260616-task1-testing-utilities.md`  
**Scope:** `src/testing/`, `src/index.ts`, `docs/testing-utilities.md`, `README.md`

---

## Issues Found

### 1. Unused import in `src/testing/mock-consumer.service.ts`

**File:** `src/testing/mock-consumer.service.ts`  
**Line:** 2  
**Rule:** Self-documenting code / no dead imports  
**Issue:** `EventContext` is imported but never used in the file.

**Fix:** Remove the unused import.

```typescript
// Before
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { EventHandler } from '../consumer/consumer.service';

// After
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventHandler } from '../consumer/consumer.service';
```

---

### 2. Multi-section boolean condition in `src/testing/mock-request-reply.service.ts`

**File:** `src/testing/mock-request-reply.service.ts`  
**Line:** 49  
**Rule:** Single-Section Boolean Conditions Rule  
**Issue:** `isRequestReplyMessage` contains a compound boolean: `typeof event.reply_to === 'string' && event.reply_to.length > 0`.

**Fix:** Extract into a private descriptive method and call it.

```typescript
isRequestReplyMessage(event: EventEnvelope<unknown>): boolean {
  return this.hasNonEmptyReplyTo(event);
}

private hasNonEmptyReplyTo(event: EventEnvelope<unknown>): boolean {
  return typeof event.reply_to === 'string' && event.reply_to.length > 0;
}
```

---

### 3. Typo in `docs/testing-utilities.md`

**File:** `docs/testing-utilities.md`  
**Line:** 137  
**Rule:** Documentation accuracy  
**Issue:** Section heading reads `## Assertion Helplers` instead of `## Assertion Helpers`.

**Fix:** Correct the heading to `## Assertion Helpers`.

---

### 4. Method exceeds max parameter count in `src/testing/mock-request-reply.service.ts`

**File:** `src/testing/mock-request-reply.service.ts`  
**Line:** 35  
**Rule:** Max Arguments per Method Rule (max 2 params)  
**Issue:** `request<T, R>(subject: string, payload: T, options: ...)` has 3 positional parameters.

**Note:** This signature intentionally mirrors the real `RequestReplyService.request()` API so that consuming code can inject either the real service or the mock interchangeably. Changing the mock to a single options object would break API parity with the real service.  
**Recommended resolution:** Document this as an intentional exception in the test module documentation, or refactor both the real service and the mock together in a follow-up task. Do not change the mock signature in isolation.

---

### 5. Hardcoded mock value in `src/testing/mock-request-reply.service.ts`

**File:** `src/testing/mock-request-reply.service.ts`  
**Line:** 65  
**Rule:** Avoid Magic Numbers / Magic Strings  
**Issue:** `buildResponseEnvelope` uses the literal `'evt_mock-response-id'` for every response envelope ID.

**Fix:** Use the toolkit's `generateEventId()` utility to produce realistic, unique IDs consistent with the real `buildEnvelope` helper.

```typescript
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';

buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): EventEnvelope<R> {
  const preservedContext: EventContext = {
    ...options.responseContext,
    correlationId: options.requestEvent.correlation_id,
    causationId: options.requestEvent.id,
  };
  return new EventEnvelope<R>({
    id: generateEventId(),
    produced_at: nowIso(),
    type: preservedContext.type,
    version: preservedContext.version,
    producer: preservedContext.producer,
    company_id: preservedContext.companyId,
    actor_type: preservedContext.actorType,
    actor_id: preservedContext.actorId,
    correlation_id: preservedContext.correlationId,
    causation_id: preservedContext.causationId,
    trace_id: preservedContext.traceId,
    data: options.responseData,
  });
}
```

**Impact on tests:** Update `mock-request-reply.service.spec.ts` to stop asserting on the literal `'evt_mock-response-id'` if any test does so. Current tests only assert `correlation_id`, `causation_id`, and `data`, so no test changes are required.

---

### 6. Documentation example uses `as any`

**File:** `docs/testing-utilities.md`  
**Line:** 261  
**Rule:** Type safety / code quality in examples  
**Issue:** The consumer example uses `actor_type: 'system' as any`.

**Fix:** Import and use `ActorType.SYSTEM` in the documentation example.

```typescript
import { ActorType } from '@cobranza-apps/events-toolkit';

const event = new EventEnvelope({
  ...
  actor_type: ActorType.SYSTEM,
  ...
});
```

---

## Verification Steps After Fixes

1. Run `npm run lint` — must pass with no errors.
2. Run `npm run typecheck` — must pass with no errors.
3. Run `npm test -- --testPathPattern=src/testing` — all 7 testing suites must pass.
4. Run `npm run format:check` — all files must be Prettier-compliant.
5. Re-read `docs/testing-utilities.md` to confirm the typo is fixed and examples are accurate.

---

## Files to Modify

| # | File | Change |
|---|---|---|
| 1 | `src/testing/mock-consumer.service.ts` | Remove unused `EventContext` import |
| 2 | `src/testing/mock-request-reply.service.ts` | Extract reply-to check into private method; replace hardcoded response ID with `generateEventId()` and `nowIso()` |
| 3 | `docs/testing-utilities.md` | Fix typo; update consumer example to use `ActorType.SYSTEM` |

---

## Notes

- Issues 1, 2, 3, 5, and 6 are straightforward fixes.
- Issue 4 (3-param `request` signature) should not be fixed in isolation because it preserves API parity with `RequestReplyService`. Escalate to the plan owner if a project-wide refactor of the real service is desired.
- All tests, lint, typecheck, and formatting currently pass; the fixes above are quality improvements, not bug fixes.
