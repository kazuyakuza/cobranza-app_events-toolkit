# Fix: E2E test failure — missing `createInbox` in NATS mock

## Problem

`npm run test:e2e` fails with:

```
TypeError: (0 , nats_1.createInbox) is not a function
    at ensureValidConsumerConfig (src/consumer/subscribe-options.interface.ts:57:41)
```

The `jest.mock('nats', ...)` in `src/events-toolkit.runtime.e2e-spec.ts` does not export `createInbox`, but `subscribe-options.interface.ts` now imports and calls it in two places:
- `createDefaultConsumerOpts()` — `deliverTo(createInbox())`
- `ensureValidConsumerConfig()` — `config.deliver_subject ??= createInbox()`

## Root Cause

The e2e spec mocks the `nats` module (lines 38–65) but omits `createInbox`. When the runtime e2e tests exercise `RequestReplyConsumerService.subscribe()` or `JetStreamConsumerService.subscribe()` with empty/`undefined` consumer options, the code path hits `createInbox()` and throws.

## Fix

Add `createInbox` to the `jest.mock('nats', ...)` return object in `src/events-toolkit.runtime.e2e-spec.ts`.

```typescript
createInbox: () => '_INBOX.test',
```

This gives the mock a simple function that returns a predictable string, satisfying both call sites without affecting test assertions.

## Verification

- Run `npm run test:e2e` — all 12 tests should pass.
- Run `npm run test` — all 599 unit tests should still pass.

## Files to Change

- `src/events-toolkit.runtime.e2e-spec.ts` — add `createInbox` to the mock return object.

## Steps

1. Read the current mock block in `src/events-toolkit.runtime.e2e-spec.ts`.
2. Add `createInbox: () => '_INBOX.test'` to the mocked module exports.
3. Run `npm run test:e2e` to confirm all tests pass.
4. Commit with message: `test(e2e): add createInbox to nats mock`.
