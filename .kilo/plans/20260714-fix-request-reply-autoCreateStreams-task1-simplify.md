# Simplification Plan — Task 1: `RequestReplyConsumerService` autoCreateStreams support

**TODO File**: `.agent/todos/20260714/20260714-todo-3.md`  
**Implementation Plan**: `.kilo/plans/20260714-fix-request-reply-autoCreateStreams-task1.md`  
**Branch**: `fix/request-reply-autoCreateStreams`  
**Date**: 2026-07-14

## Summary

The implementation correctly replicates the `JetStreamConsumerService` auto-creation pattern in `RequestReplyConsumerService`. The code is functional and rule-compliant. Two small simplifications are recommended to reduce duplication and keep the two consumer services internally consistent:

1. **Extract duplicated error-logging in `RequestReplyConsumerService`** into a private `logGeneralError(error, subject)` helper, matching the pattern already used by `JetStreamConsumerService`.
2. **Extract the identical async combined-deps provider factory** shared by `createJetStreamAsyncDepsProvider` and `createRequestReplyAsyncDepsProvider` in `consumer-module.providers.ts`.

Both changes are refactor-only and preserve behavior.

---

## Simplification 1 — `RequestReplyConsumerService` error logging

### Problem

Two methods in `src/consumer/request-reply-consumer.service.ts` contain identical inline error-logging blocks:

- `onModuleInit()` (lines 47–55)
- `subscribe()` (lines 98–106)

Both create the same `logEventError` payload, only the `subject` differs. This duplication is the exact problem `JetStreamConsumerService` already solved with its private `logGeneralError(error, subject)` method.

### Current duplication

```ts
// onModuleInit()
this.subscribe(this.responseSubjectPattern).catch((error: unknown) =>
  this.logger.logEventError({
    eventId: 'unknown',
    eventType: 'unknown',
    subject: this.responseSubjectPattern,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }),
);

// subscribe()
this.processSubscription(subscription, subject).catch((error: unknown) =>
  this.logger.logEventError({
    eventId: 'unknown',
    eventType: 'unknown',
    subject,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }),
);
```

### Proposed change

Add a private helper:

```ts
private logGeneralError(error: unknown, subject: string): void {
  this.logger.logEventError({
    eventId: 'unknown',
    eventType: 'unknown',
    subject,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}
```

Then replace both inline blocks:

```ts
// onModuleInit()
this.subscribe(this.responseSubjectPattern).catch((error: unknown) =>
  this.logGeneralError(error, this.responseSubjectPattern),
);

// subscribe()
this.processSubscription(subscription, subject).catch((error: unknown) =>
  this.logGeneralError(error, subject),
);
```

### Benefits

- Removes duplication.
- Aligns `RequestReplyConsumerService` with the existing `JetStreamConsumerService` helper pattern.
- Keeps method bodies shorter and easier to scan.
- No behavioral change.

### Risk / compatibility

- None. This is a private method refactor; the public API and runtime behavior are unchanged.

---

## Simplification 2 — Shared async combined-deps provider factory

### Problem

`src/consumer/consumer-module.providers.ts` defines two providers with identical factory bodies:

- `createJetStreamAsyncDepsProvider()` (lines 134–143)
- `createRequestReplyAsyncDepsProvider()` (lines 161–171)

Both take `(connection: ResolvedConnection, moduleOptions: ConsumerModuleOptions)` and return `{ connection, moduleOptions }`. The only difference is the injection token they provide.

### Current duplication

```ts
export function createJetStreamAsyncDepsProvider(): Provider {
  return {
    provide: JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN,
    useFactory: (connection: ResolvedConnection, moduleOptions: ConsumerModuleOptions) => ({
      connection,
      moduleOptions,
    }),
    inject: [RESOLVED_CONNECTION_TOKEN, CONSUMER_MODULE_OPTIONS],
  };
}

export function createRequestReplyAsyncDepsProvider(): Provider {
  return {
    provide: REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN,
    useFactory: (connection: ResolvedConnection, moduleOptions: ConsumerModuleOptions) => ({
      connection,
      moduleOptions,
    }),
    inject: [RESOLVED_CONNECTION_TOKEN, CONSUMER_MODULE_OPTIONS],
  };
}
```

### Proposed change

Introduce a small internal helper that builds the provider for any token:

```ts
function createAsyncCombinedDepsProvider(token: string | symbol | Type<unknown>): Provider {
  return {
    provide: token,
    useFactory: (connection: ResolvedConnection, moduleOptions: ConsumerModuleOptions) => ({
      connection,
      moduleOptions,
    }),
    inject: [RESOLVED_CONNECTION_TOKEN, CONSUMER_MODULE_OPTIONS],
  };
}
```

Then replace the public functions:

```ts
export function createJetStreamAsyncDepsProvider(): Provider {
  return createAsyncCombinedDepsProvider(JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN);
}

export function createRequestReplyAsyncDepsProvider(): Provider {
  return createAsyncCombinedDepsProvider(REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN);
}
```

`Type<unknown>` is already imported from `@nestjs/common` in `consumer.module.ts`, and the tokens are typed as `Type<unknown>` in the same file. The helper can accept `string | symbol | Type<unknown>` to match `Provider['provide']`.

### Benefits

- Removes the duplicated factory body.
- Makes the relationship between JetStream and request-reply async deps explicit.
- Future async combined-deps providers can reuse the same helper.

### Risk / compatibility

- None. The exported public functions keep the same signatures and return the same provider shape.

---

## Simplifications NOT recommended

| Opportunity | Reason for not recommending |
|-------------|----------------------------|
| Share `ensureStreamIfNeeded` between `JetStreamConsumerService` and `RequestReplyConsumerService` | The method is trivial (4 lines) and private. Extracting it to a shared utility would add an extra file/import for minimal gain and would reduce locality. The current duplication mirrors the established reference pattern exactly. |
| Move `mockLogger`/`jetStream`/`connectionMock` setup into a shared test helper | The two auto-create specs are intentionally sibling files that mirror the reference pattern. Sharing mocks would couple the tests and obscure the self-contained example the reference pattern provides. |
| Add the race-condition test case to the request-reply auto-create spec | The TODO explicitly requests three test cases (enabled + missing, enabled + exists, disabled). Adding a fourth would expand scope beyond the implementation plan. |
| Inline the `responseSubjectPattern` default into `subscribe()` instead of `constructor` | This would change the `responseSubjectPattern` field semantics and make it harder to test the default value. |

---

## Suggested execution order

1. Apply Simplification 1 in `src/consumer/request-reply-consumer.service.ts`.
2. Apply Simplification 2 in `src/consumer/consumer-module.providers.ts`.
3. Run `npm run lint` and `npm test` to verify no regressions.
4. Commit as `refactor(consumer): simplify request-reply autoCreateStreams implementation`.

---

## Verification checklist

- [ ] `RequestReplyConsumerService` has a private `logGeneralError(error, subject)` helper.
- [ ] `onModuleInit()` and `subscribe()` use the helper instead of inline logging.
- [ ] `consumer-module.providers.ts` has a shared `createAsyncCombinedDepsProvider` helper.
- [ ] `createJetStreamAsyncDepsProvider` and `createRequestReplyAsyncDepsProvider` delegate to the helper.
- [ ] All modified files remain ≤ 200 lines.
- [ ] All methods remain ≤ 50 lines.
- [ ] No new lint errors or test failures.
- [ ] No behavioral changes.
