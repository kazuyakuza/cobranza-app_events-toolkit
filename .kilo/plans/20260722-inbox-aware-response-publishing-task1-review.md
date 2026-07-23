# Code Review: INBOX-aware response publishing fallback (Task 1)

**Source TODO:** `.agent/todos/20260722/20260722-todo-0.md`
**Implementation plan:** `.kilo/plans/20260722-inbox-aware-response-publishing-task1.md`
**Branch:** `feat/inbox-aware-response-fallback`
**Review date:** 2026-07-22

---

## Overall verdict

Implementation matches the per-task plan and satisfies the TODO requirements. All targeted tests, the full suite, typecheck, and lint pass.

| Check | Result |
|-------|--------|
| Correctness | Pass |
| Plan adherence | Pass |
| Typecheck | Pass |
| Lint | Pass |
| Targeted tests | 83 suites / 725 tests passed |
| Full suite | 83 suites / 725 tests passed |

---

## 1. Correctness vs plan

### `src/request-reply/request-reply.types.ts`

- `DEFAULT_INBOX_PATTERN = '^_?INBOX\\.'` added and exported internally.
- `RequestReplyConfig` extended with `fallbackToCoreNatsOnInbox?: boolean` and `coreNatsFallbackPattern?: string`, both with JSDoc.
- `resolveRequestReplyConfig` defaults the new fields to `false` and `'^_?INBOX\\.'` respectively.
- Backward-compatible default preserves existing behavior.

### `src/request-reply/request-reply.service.ts`

- `DEFAULT_INBOX_PATTERN` imported from `./request-reply.types`.
- `private readonly inboxRegex: RegExp` added.
- Regex compiled once in constructor with `new RegExp(this.config.coreNatsFallbackPattern ?? DEFAULT_INBOX_PATTERN)`.
- `sendResponse` falls back to core NATS when `shouldUseCoreNats(replyTo)` is true.
- `shouldUseCoreNats` uses single-section boolean conditions (early return on flag, then regex test).
- `publishToInbox` encodes the event, calls `natsConnection.publish(replyTo, payload)`, and logs via `logRequestSent`.
- No await on core-NATS publish, removing the PubAck timeout root cause.

### `src/request-reply/__tests__/request-reply-test.utils.ts`

- Optional 7th param `mockNatsPublish` added with default `jest.fn()`.
- Wired into `natsConnection.publish`.
- Existing 6-argument callers remain compatible.

### `src/request-reply/request-reply.service.sendResponse.spec.ts`

- `mockNatsPublish` variable, `buildService` factory, and 5 new test cases added.
- Existing 3 tests unchanged.
- Covers: INBOX fallback on, logging, non-INBOX still uses JetStream, custom pattern, invalid regex fail-fast.
- Existing first two tests cover backward compat (fallback off → `producerService.publish`).

---

## 2. Project rule compliance

| Rule | Status | Notes |
|------|--------|-------|
| Max 200 lines/file | Pass | Types 90, service 146, utils 59, spec 168. |
| Max 50 lines/method body | Pass | All new methods ≤ 8 lines. |
| Max 2 params/method | Pass for production code | `sendResponse` 2, `publishToInbox` 2, `shouldUseCoreNats` 1, `buildInboxRegex` 0. |
| Max 2 params/method | **Fail** in test helper | `createDeps` has 7 positional params (was 6, now 7). Pre-existing tension; plan flagged for simplifier. |
| Max 2 nesting levels | Pass | Early returns, no 3rd-level nesting. |
| Single-section boolean conditions | Pass | `shouldUseCoreNats` splits flag and regex test. |
| Prefer private members | Pass | `inboxRegex`, `shouldUseCoreNats`, `publishToInbox` are private. |
| No commented-out code | Pass | None found. |
| Self-documenting code | Pass | Descriptive method/field names and JSDoc. |

---

## 3. Safety / edge cases

- **Missing `reply_to`:** `ensureReplyTo` still throws `RequestReplyException` before fallback logic runs. Covered by existing test.
- **Invalid regex:** `new RegExp('(')` throws synchronously during service construction. Covered by new test.
- **Empty/undefined pattern:** `undefined` falls back to `DEFAULT_INBOX_PATTERN`. Empty string would compile to a regex matching everything; this is user-controlled config behavior, not a silent failure.
- **Core-NATS publish errors:** Errors from `natsConnection.publish` bubble to the caller, consistent with existing error handling in `processMessage`.

---

## 4. Issues and optional improvements

### Issue 1: `createDeps` exceeds max-args rule (pre-existing + plan-acknowledged)

**Location:** `src/request-reply/__tests__/request-reply-test.utils.ts:18-26`

**Problem:** `createDeps` now accepts 7 positional parameters, violating the max 2 arguments per method rule.

**Fix options (choose one):**

#### Option A — Refactor to options object (recommended)

```typescript
export interface CreateDepsOptions {
  mockNatsRequest: jest.Mock;
  mockPublish: jest.Mock;
  mockLogEmitted: jest.Mock;
  mockLogConsumed: jest.Mock;
  mockLogError: jest.Mock;
  config: RequestReplyConfig;
  mockNatsPublish?: jest.Mock;
}

export function createDeps(options: CreateDepsOptions): RequestReplyDeps {
  const {
    mockNatsRequest,
    mockPublish,
    mockLogEmitted,
    mockLogConsumed,
    mockLogError,
    config,
    mockNatsPublish = jest.fn(),
  } = options;

  return {
    natsConnection: {
      request: mockNatsRequest,
      publish: mockNatsPublish,
    } as unknown as RequestReplyDeps['natsConnection'],
    producerService: { publish: mockPublish } as unknown as RequestReplyDeps['producerService'],
    logger: {
      logEventEmitted: mockLogEmitted,
      logEventConsumed: mockLogConsumed,
      logEventError: mockLogError,
      logEventDlq: jest.fn(),
    } as unknown as RequestReplyDeps['logger'],
    config,
  };
}
```

This requires updating all callers of `createDeps` across the request-reply specs. It is a broader refactor than this task strictly needs, which is why the implementation plan deferred it to the code-simplifier step.

#### Option B — Keep as-is with explicit waiver

If the blast radius is unacceptable for this task, document the waiver in the review and accept the 7-param helper as pre-existing technical debt.

### Issue 2: Default `service` in spec uses a different `mockNatsPublish` instance than the variable

**Location:** `src/request-reply/request-reply.service.sendResponse.spec.ts:47-67`

**Problem:** `mockNatsPublish = jest.fn()` is assigned in `beforeEach`, but the default `service` is built via `createDeps(..., config)` without passing `mockNatsPublish`, so the service's `natsConnection.publish` is the helper's default `jest.fn()` rather than the test-scoped `mockNatsPublish`.

**Fix:** Pass `mockNatsPublish` as the 7th argument:

```typescript
beforeEach(async () => {
  mockNatsRequest = jest.fn();
  mockNatsPublish = jest.fn();
  mockPublish = jest.fn().mockResolvedValue(undefined);
  mockLogEmitted = jest.fn();
  mockLogConsumed = jest.fn();
  mockLogError = jest.fn();
  config = { ...defaultConfig };

  const module = await Test.createTestingModule({
    providers: [
      {
        provide: REQUEST_REPLY_DEPS_TOKEN,
        useValue: createDeps(
          mockNatsRequest,
          mockPublish,
          mockLogEmitted,
          mockLogConsumed,
          mockLogError,
          config,
          mockNatsPublish,
        ),
      },
      RequestReplyService,
    ],
  }).compile();

  service = module.get(RequestReplyService);
});
```

This is a quality/consistency improvement only; current tests pass because the default `service` tests do not assert against `mockNatsPublish`.

### Issue 3: `config` variable typed too narrowly

**Location:** `src/request-reply/request-reply.service.sendResponse.spec.ts:23`

**Problem:** `let config: { defaultTimeoutMs: number };` is structurally compatible but less explicit than `RequestReplyConfig`.

**Fix:**

```typescript
let config: RequestReplyConfig;
```

No runtime change.

---

## 5. Recommended fix scope

Because the implementation is functionally correct and all checks pass, the required fix scope is minimal:

1. **Mandatory:** Address `createDeps` parameter count — either refactor to an options object or formally waive as pre-existing debt.
2. **Recommended:** Align the default `service` in `sendResponse.spec.ts` with the test-scoped `mockNatsPublish` (Issue 2).
3. **Optional:** Tighten `config` type to `RequestReplyConfig` (Issue 3).

No changes are required to production code.

---

## 6. Verification commands run

```text
npm run typecheck          # pass
npm run lint               # pass
npm test -- --testPathPattern=request-reply.service.sendResponse.spec  # 83 suites / 725 tests pass
npm test                   # 83 suites / 725 tests pass
```
