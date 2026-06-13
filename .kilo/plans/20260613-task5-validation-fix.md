# Task 5 — Validation & Error Handling: Code Review Fix Plan

## Review Outcome

Issues found in `src/consumer/jetstream-consumer.service.ts` and its spec. Fixes are required before Task 6.

## Issues

### Issue 1: Compound boolean condition violates single-section rule

**Location:** `src/consumer/jetstream-consumer.service.ts`, `parseMessageData`

**Current code:**

```typescript
if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
  throw new EventConsumerException({
    message: 'Message payload is not a valid JSON object',
    eventId: 'unknown',
    eventType: 'unknown',
  });
}
```

**Problem:** The condition has three sections joined by `||`. Per `.kilo/rules/single-section-boolean-conditions.md`, compound conditions in `if` statements must be extracted into a descriptive helper method.

**Fix:** Extract a private predicate method.

```typescript
private isInvalidEventPayload(parsed: unknown): boolean {
  return typeof parsed !== 'object' || parsed === null || Array.isArray(parsed);
}
```

Replace the `if` condition with `if (this.isInvalidEventPayload(parsed))`.

### Issue 2: Logging after ack risks double ack/nack

**Location:** `src/consumer/jetstream-consumer.service.ts`, `handleMessage` success path

**Current code:**

```typescript
await this.consumerService.dispatch(dispatchOptions);
msg.ack();
this.logger.logEventConsumed(logCtx);
```

**Problem:** If `logEventConsumed` throws, the outer `catch` routes to `handleError`. Because `msg.ack()` already ran, `handleError` may call `msg.nak()` on an already-acknowledged message, producing undefined JetStream behavior.

**Fix:** Wrap the consumption log in its own error handler so logging failures never affect message lifecycle.

```typescript
await this.consumerService.dispatch(dispatchOptions);
msg.ack();
try {
  this.logger.logEventConsumed(logCtx);
} catch (logError: unknown) {
  this.logGeneralError(logError, subject);
}
```

### Issue 3: Missing test for non-Error handler rejection

**Location:** `src/consumer/jetstream-consumer.service.spec.ts`

**Problem:** The generic error path is only tested with `new Error('Unexpected failure')`. The implementation uses `error instanceof Error ? error : new Error(String(error))`, but the string/object branch is not exercised.

**Fix:** Add a test case where the handler rejects with a string.

```typescript
it('should nack and log error when handler rejects with a non-Error value', async () => {
  const handler = jest.fn().mockRejectedValue('Unexpected failure');
  consumerService.registerHandler(testSubject, handler);

  const msg = createJsMsg(createValidEventJson(), testSubject);
  await service.processMessage(msg, testSubject);

  expect(msg.nak).toHaveBeenCalledTimes(1);
  expect(msg.ack).not.toHaveBeenCalled();

  expect(mockLogger.logEventError).toHaveBeenCalledTimes(1);
  const errorContext = mockLogger.logEventError.mock.calls[0][0] as EventErrorLogContext;
  expect(errorContext.error).toBe('Unexpected failure');
  expect(errorContext.subject).toBe(testSubject);
});
```

## Verification

After fixes:

1. Run the unit test suite for the consumer module:
   ```bash
   npx jest src/consumer/jetstream-consumer.service.spec.ts
   ```
2. Confirm all tests pass.
3. Confirm `src/consumer/jetstream-consumer.service.ts` still satisfies:
   - Max lines per file (< 200).
   - Max arguments per method (≤ 2, or encapsulated in option objects).
   - Max nesting depth (≤ 2).
   - Single-section boolean conditions in `if`/`while`.
