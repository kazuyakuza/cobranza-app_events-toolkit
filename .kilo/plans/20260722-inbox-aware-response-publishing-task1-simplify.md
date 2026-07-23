# Simplification Plan: INBOX-aware response publishing fallback (Task 1)

**Source TODO:** `.agent/todos/20260722/20260722-todo-0.md`
**Per-Task Plan:** `.kilo/plans/20260722-inbox-aware-response-publishing-task1.md`
**Branch:** `feat/inbox-aware-response-fallback`
**Date:** 2026-07-22

---

## 1. Summary

The implementation from step 4.2 is functionally correct and mostly compliant. The main structural issue is `createDeps` in the test utilities, which now has **7 positional parameters** and violates the `max-arguments-per-method` rule (max 2). This plan proposes three small simplifications:

1. Inline the `DEFAULT_INBOX_PATTERN` export in `request-reply.types.ts`.
2. Refactor `createDeps` to accept a single `CreateDepsOptions` object, default optional mocks, and update all call sites.
3. Tidy `request-reply.service.sendResponse.spec.ts` by removing an unused variable, fixing a type, and merging two redundant fallback assertions.

These changes preserve behavior and test coverage while improving readability and rule compliance.

---

## 2. Simplification 1: Inline `DEFAULT_INBOX_PATTERN` export

### File
`src/request-reply/request-reply.types.ts`

### Current
```typescript
/** Default INBOX subject prefix pattern for core-NATS fallback. */
const DEFAULT_INBOX_PATTERN = '^_?INBOX\\.';
export { DEFAULT_INBOX_PATTERN };
```

### Simplified
```typescript
/** Default INBOX subject prefix pattern for core-NATS fallback. */
export const DEFAULT_INBOX_PATTERN = '^_?INBOX\\.';
```

### Rationale
Removes one redundant line and uses the idiomatic single-line exported const form. No behavior change.

---

## 3. Simplification 2: Refactor `createDeps` to an options object

### File
`src/request-reply/__tests__/request-reply-test.utils.ts`

### Current
```typescript
export function createDeps(
  mockNatsRequest: jest.Mock,
  mockPublish: jest.Mock,
  mockLogEmitted: jest.Mock,
  mockLogConsumed: jest.Mock,
  mockLogError: jest.Mock,
  config: RequestReplyConfig,
  mockNatsPublish: jest.Mock = jest.fn(),
): RequestReplyDeps {
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

### Simplified
```typescript
export interface CreateDepsOptions {
  mockNatsRequest?: jest.Mock;
  mockNatsPublish?: jest.Mock;
  mockPublish: jest.Mock;
  mockLogEmitted: jest.Mock;
  mockLogConsumed: jest.Mock;
  mockLogError: jest.Mock;
  config: RequestReplyConfig;
}

export function createDeps({
  mockNatsRequest = jest.fn(),
  mockNatsPublish = jest.fn(),
  mockPublish,
  mockLogEmitted,
  mockLogConsumed,
  mockLogError,
  config,
}: CreateDepsOptions): RequestReplyDeps {
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

### Rationale
- Reduces the function signature from 7 positional params to 1 object param, satisfying the `max-arguments-per-method` rule.
- Optional mocks default to `jest.fn()`, so specs that do not need `mockNatsRequest` or `mockNatsPublish` can omit them.
- Named options make call sites self-documenting and less error-prone.

### Affected call sites
All five spec files that call `createDeps` need to be updated to the options-object form.

#### `src/request-reply/request-reply.service.request.spec.ts`
```typescript
useValue: createDeps({
  mockNatsRequest,
  mockPublish,
  mockLogEmitted,
  mockLogConsumed,
  mockLogError,
  config,
}),
```

#### `src/request-reply/request-reply.service.sendRequest.spec.ts`
```typescript
useValue: createDeps({
  mockPublish,
  mockLogEmitted,
  mockLogConsumed,
  mockLogError,
  config,
}),
```

#### `src/request-reply/request-reply.service.buildResponseEnvelope.spec.ts`
```typescript
useValue: createDeps({
  mockPublish,
  mockLogEmitted,
  mockLogConsumed,
  mockLogError,
  config: defaultConfig,
}),
```

#### `src/request-reply/request-reply.service.isRequestReplyMessage.spec.ts`
```typescript
useValue: createDeps({
  mockPublish,
  mockLogEmitted,
  mockLogConsumed,
  mockLogError,
  config: defaultConfig,
}),
```

#### `src/request-reply/request-reply.service.sendResponse.spec.ts`
```typescript
useValue: createDeps({
  mockNatsRequest,
  mockPublish,
  mockLogEmitted,
  mockLogConsumed,
  mockLogError,
  config: { ...defaultConfig, ...configOverrides },
  mockNatsPublish,
}),
```

and the default-config `beforeEach` call:
```typescript
useValue: createDeps({
  mockPublish,
  mockLogEmitted,
  mockLogConsumed,
  mockLogError,
  config,
}),
```

---

## 4. Simplification 3: Tidy `request-reply.service.sendResponse.spec.ts`

### File
`src/request-reply/request-reply.service.sendResponse.spec.ts`

### Current issues
1. `mockNatsRequest` is declared and passed to `createDeps` but never used by any test.
2. `config` is typed as `{ defaultTimeoutMs: number }` instead of `RequestReplyConfig`.
3. Two separate tests assert the core-NATS fallback path (`publishes...` and `logs...`). They can be merged without losing coverage.

### Simplified file

Remove `mockNatsRequest` from the describe-block variables and the `buildService` call. Change `config` declaration to:

```typescript
let config: RequestReplyConfig;
```

Replace the two fallback tests with a single test:

```typescript
it('publishes INBOX reply_to via core NATS and logs emission when fallback enabled', async () => {
  const serviceWithFallback = await buildService({ fallbackToCoreNatsOnInbox: true });
  const responseEvent = createTestEnvelope({
    id: 'evt_response-101',
    reply_to: '_INBOX.manual.company.create.abc',
  });

  await serviceWithFallback.sendResponse(sampleContext.correlationId, responseEvent);

  expect(mockNatsPublish).toHaveBeenCalledTimes(1);
  const [subject, payload] = mockNatsPublish.mock.calls[0];
  expect(subject).toBe('_INBOX.manual.company.create.abc');
  expect(payload).toBeInstanceOf(Uint8Array);
  expect(mockPublish).not.toHaveBeenCalled();
  expect(mockLogEmitted).toHaveBeenCalledTimes(1);
});
```

### Rationale
- Removes unused test infrastructure.
- Aligns the local `config` type with the actual resolved config type.
- Reduces test count and file length while keeping the same assertions.

---

## 5. What NOT to change

- `request-reply.service.ts` core logic: `sendResponse`, `shouldUseCoreNats`, and `publishToInbox` are already small, private, and use single-section conditions. The regex is compiled once in the constructor. No further simplification is beneficial.
- `fallbackToCoreNatsOnInbox` / `coreNatsFallbackPattern` naming: names are descriptive and aligned with the design option.
- Behavior of the fallback, backward compatibility, or public API exports.

---

## 6. Expected outcome

- `request-reply.types.ts`: 80 lines → 79 lines.
- `request-reply-test.utils.ts`: 59 lines → ~71 lines (interface added), but function signature is compliant.
- `request-reply.service.sendResponse.spec.ts`: 168 lines → ~155 lines.
- All `createDeps` call sites move to the options-object form, satisfying the max-arguments rule.
- Full test coverage preserved; no behavior changes.

---

## 7. Verification

After applying these changes:

1. `npm run typecheck` — zero errors.
2. `npm run lint` — clean.
3. `npm test -- --testPathPattern=request-reply` — all request-reply specs pass.
4. `npm test` — full suite green.
