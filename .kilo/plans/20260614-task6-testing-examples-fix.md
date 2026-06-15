# Task 6 — Testing & Examples: Code Review Fix Plan

## Review Summary

**Scope:** `docs/examples/sync-request-reply.example.ts`, `docs/examples/async-request-reply.example.ts`, `README.md`, `src/request-reply/request-reply.service.request.spec.ts`, `src/outbox/outbox.service.request-reply.spec.ts`

**Result:** Issues found. `npm run build` and `npm test` pass, but the async example file contains non-existent imports, API misuse in commented code, and commented-out code blocks. Tests have a timer-leak risk and weak assertion coverage for exception types.

## Issues Found

### 1. `docs/examples/async-request-reply.example.ts`

1. **Non-existent import** (line 22): `ResponseSuffix` is not exported from `@cobranza-apps/events-toolkit`. The actual exported constant is `RESPONSE_SUFFIX`.
2. **Wrong `buildResponseSubject` signature in commented code** (lines 74-83): The helper accepts a `string` request subject, not a `BuildSubjectDto` object. The commented snippet calls it with an object and also with `buildResponseSubject(buildSubject({ ... }))` incorrectly nested.
3. **Commented-out code blocks** (lines 74-83 and 184-205): Violates the `no-commented-code` rule. The module-wiring block and the alternative `.response` snippet are both commented out.
4. **Exceeds planned length**: File is 205 lines; the implementation plan requested keeping doc examples under 200 lines.

### 2. `docs/examples/sync-request-reply.example.ts`

1. **Method with more than 2 parameters** (line 53): `requestVerificationStatus(companyId, paymentId, documentHash)` has 3 positional parameters. Violates the `max-arguments-per-method` rule unless examples are explicitly exempt.

### 3. `src/outbox/outbox.service.request-reply.spec.ts`

1. **Processor timer leakage**: Each processor-flow test calls `service.startProcessor()` and later `jest.useRealTimers()` without calling `service.stopProcessor()`. Intervals registered by `startProcessor()` remain active across timer-mode switches, which can cause cross-test pollution or unhandled interval callbacks.
2. **Weak serialization test** (lines 96-118): The round-trip assertion parses `entry.eventData` that was just created with `JSON.stringify(envelope)`, making the test largely tautological.

### 4. `src/request-reply/request-reply.service.request.spec.ts`

1. **Weak error-type assertions** (lines 174-187): The non-Error and native-Error tests only assert `message`/`cause` via `toMatchObject`. They do not verify the rejected value is an instance of `RequestReplyException`.

## Fix Steps

### Step 1: Fix async example imports and remove commented code

**File:** `docs/examples/async-request-reply.example.ts`

- Remove `ResponseSuffix` from the import list.
- Delete the commented alternative `.response` snippet (lines 74-83) and the commented module-wiring block (lines 184-205).
- If the `.response` alternative must be shown, replace the commented snippet with a short doc comment that describes the pattern in prose, referencing `RESPONSE_SUFFIX` and `buildResponseSubject(requestSubject)`.
- Remove decorative multi-line banner comments (lines 50-52, 118-120, etc.) or convert them to single-line `//` section headers to bring the file under 200 lines.

### Step 2: Correct `buildResponseSubject` usage if kept

**File:** `docs/examples/async-request-reply.example.ts`

- Ensure any live usage of `buildResponseSubject` passes a string subject, e.g.:

```typescript
const replySubject = buildResponseSubject(
  buildSubject({ companyId, domain: 'credit', entity: 'check', action: 'requested', version: '1' }),
);
```

### Step 3: Reduce sync example parameter count

**File:** `docs/examples/sync-request-reply.example.ts`

- Encapsulate `requestVerificationStatus` parameters in a DTO to comply with the max-arguments rule:

```typescript
interface RequestVerificationStatusParams {
  companyId: string;
  paymentId: string;
  documentHash: string;
}

async requestVerificationStatus(params: RequestVerificationStatusParams): Promise<VerificationResultData> {
  const { companyId, paymentId, documentHash } = params;
  // ... existing body
}
```

### Step 4: Reduce async example parameter count

**File:** `docs/examples/async-request-reply.example.ts`

- Encapsulate `requestCreditCheck` parameters similarly:

```typescript
interface RequestCreditCheckParams {
  clientId: string;
  fullName: string;
  companyId: string;
}

async requestCreditCheck(params: RequestCreditCheckParams): Promise<string> {
  const { clientId, fullName, companyId } = params;
  // ... existing body
}
```

### Step 5: Stop outbox processor in tests

**File:** `src/outbox/outbox.service.request-reply.spec.ts`

- Add an `afterEach` block in the `describe('OutboxService — request-reply processor flow')` scope:

```typescript
afterEach(() => {
  service.stopProcessor();
  jest.useRealTimers();
});
```

- Remove the `jest.useRealTimers()` calls at the end of each individual test.

### Step 6: Improve request-reply exception assertions

**File:** `src/request-reply/request-reply.service.request.spec.ts`

- Update the non-Error and native-Error tests to first assert the exception type:

```typescript
it('should create RequestReplyException from non-Error thrown value (string)', async () => {
  mockNatsRequest.mockRejectedValue('connection lost');
  await expect(service.request('test.subject', {}, { context: sampleContext })).rejects.toBeInstanceOf(
    RequestReplyException,
  );
  await expect(service.request('test.subject', {}, { context: sampleContext })).rejects.toMatchObject({
    message: 'connection lost',
  });
});

it('should wrap native Error in RequestReplyException with cause', async () => {
  const nativeError = new Error('NATS connection refused');
  mockNatsRequest.mockRejectedValue(nativeError);
  await expect(service.request('test.subject', {}, { context: sampleContext })).rejects.toBeInstanceOf(
    RequestReplyException,
  );
  await expect(service.request('test.subject', {}, { context: sampleContext })).rejects.toMatchObject({
    message: 'NATS connection refused',
    cause: nativeError,
  });
});
```

### Step 7: Re-run verification

- `npm run build`
- `npm run lint`
- `npm test`
- Confirm `docs/examples/async-request-reply.example.ts` is under 200 lines.
- Confirm no commented-out code remains in example files.

## Files to Modify

| File | Action |
|------|--------|
| `docs/examples/async-request-reply.example.ts` | Fix imports, remove commented code, reduce length, encapsulate params |
| `docs/examples/sync-request-reply.example.ts` | Encapsulate method params |
| `src/outbox/outbox.service.request-reply.spec.ts` | Stop processor in `afterEach`, strengthen serialization test |
| `src/request-reply/request-reply.service.request.spec.ts` | Add `toBeInstanceOf(RequestReplyException)` assertions |
