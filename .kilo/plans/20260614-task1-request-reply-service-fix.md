# Fix Plan: Task 1 — RequestReplyService Enhancements

## Review Summary

Implementation matches the functional requirements in `20260614-task1-request-reply-service.md`:
- `sendRequest<T>()` and `buildResponseEnvelope<R>()` were added correctly.
- New types are exported from `index.ts`.
- Tests cover validation, success paths, and fire-and-forget behavior.
- `npm run build` and `npm run test` pass.

However, the changes introduce project-rule violations that must be fixed before the task is complete.

---

## Issues Found

### 1. `src/request-reply/request-reply.service.ts` exceeds 200 lines

- **Current**: 203 lines.
- **Rule**: `max-lines-per-file.md` — source files in `src/` must not exceed 200 lines.
- **Impact**: Blocking.

### 2. `src/request-reply/request-reply.service.spec.ts` exceeds 200 lines

- **Current**: 410 lines.
- **Rule**: `max-lines-per-file.md` — source files in `src/` must not exceed 200 lines.
- **Impact**: Blocking.

### 3. Type imports placed at bottom of `src/request-reply/request-reply.types.ts`

- `import type { EventContext }` and `import type { EventEnvelope }` are after interface definitions.
- The implementation plan explicitly says "Add import type { EventContext } and import type { EventEnvelope } at top."
- TypeScript compiles, but placement deviates from the plan and project conventions.
- **Impact**: Non-blocking style/deviation.

### 4. Pre-existing `request()` method violates max-2-params rule

- `async request<T, R>(subject: string, payload: T, options: ...)` has 3 parameters.
- The rule allows >2 params only when wrapped in an options object.
- This method was not changed by Task 1, but it lives in the same file and remains a project-rule violation.
- **Impact**: Non-blocking for this task; recommend follow-up refactor.

### 5. Pre-existing helpers with 3 parameters

- `logRequestError(subject, envelope, error)` and `toErrorLogContext(subject, envelope, error)` each have 3 parameters.
- Same as above: not introduced by Task 1, but violate `max-arguments-per-method.md`.
- **Impact**: Non-blocking for this task; recommend follow-up refactor.

---

## Fix Steps

### Step 1 — Reorder imports in `src/request-reply/request-reply.types.ts`

Move the two `import type` statements to the top of the file, before `NATS_CONNECTION_TOKEN`.

Expected final top of file:
```typescript
import type { EventContext } from '../common/envelope/event-context.interface';
import type { EventEnvelope } from '../common/envelope/event-envelope.class';

/** Injection token for the NATS connection used by RequestReplyService. */
export const NATS_CONNECTION_TOKEN = 'NatsConnection';
```

---

### Step 2 — Extract helpers to reduce `src/request-reply/request-reply.service.ts` below 200 lines

Create `src/request-reply/request-reply.helpers.ts` and move the following private helpers out of the service:

- `buildEnvelope`
- `ensureReplyTo`
- `ensureReplyToSet`
- `logRequestSent`
- `logReplyReceived`
- `logRequestError`
- `toLogContext`
- `toErrorLogContext`
- `wrapRequestError`

Implementation options (choose one):

**Option A (recommended) — Functional helpers:**
Export pure/helper functions that receive dependencies as parameters. Update `RequestReplyService` to import and call them.

**Option B — Helper class:**
Create a `RequestReplyHelpers` class instantiated in the constructor. Keep methods private-by-default inside the class where possible, and expose only what the service needs.

Either option is acceptable. The goal is to bring `request-reply.service.ts` under 200 lines while preserving behavior, type safety, and test coverage.

**Verification**: after extraction, `RequestReplyService` must remain `@Injectable()`, all existing tests must still pass, and the service file must be ≤ 200 lines.

---

### Step 3 — Split `src/request-reply/request-reply.service.spec.ts` into smaller files

Create a shared test helper file and split method-specific suites:

1. `src/request-reply/__tests__/request-reply-test.utils.ts`
   - Export `createTestEnvelope` helper used by all spec files.
   - Export a `createTestingModule` helper or fixture factory to avoid duplicating setup boilerplate.

2. `src/request-reply/request-reply.service.request.spec.ts`
   - Contains `describe('request', ...)` suite.

3. `src/request-reply/request-reply.service.sendResponse.spec.ts`
   - Contains `describe('sendResponse', ...)` suite.

4. `src/request-reply/request-reply.service.isRequestReplyMessage.spec.ts`
   - Contains `describe('isRequestReplyMessage', ...)` suite.

5. `src/request-reply/request-reply.service.sendRequest.spec.ts`
   - Contains `describe('sendRequest', ...)` suite.

6. `src/request-reply/request-reply.service.buildResponseEnvelope.spec.ts`
   - Contains `describe('buildResponseEnvelope', ...)` suite.

Each resulting spec file must be ≤ 200 lines. If a suite is still too long, split it further or reduce redundant setup by reusing the shared helper.

**Verification**: `npm run test -- --testPathPattern=request-reply` must pass and all new/existing request-reply tests must be discovered.

---

### Step 4 — Run build and tests

```bash
npm run build
npm run test
```

Both must pass.

---

## Optional Follow-Up (Out of Scope for Task 1 Fix)

- Refactor pre-existing `request<T, R>(subject, payload, options)` to accept a single options object, satisfying `max-arguments-per-method.md`.
- Refactor `logRequestError` and `toErrorLogContext` to use options objects if they remain after helper extraction.

These are not required to complete Task 1, but should be tracked because they keep the file compliant with project-wide rules.

---

## NOT Done by This Fix Plan

- No functional changes to `sendRequest` or `buildResponseEnvelope` behavior.
- No changes to public API signatures added by Task 1.
- No documentation updates.
- No git operations (handled by workflow).
