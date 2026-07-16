# E2E Mock Fix Review

## File Reviewed

`src/events-toolkit.runtime.e2e-spec.ts` (commit `c5fc97a`)

## Findings

### 1. `createInbox` addition — CORRECT

`createInbox` is exported from the `nats` mock as a function returning a stable inbox subject:

```ts
createInbox: () => '_INBOX.test',
```

This matches the production usage in `src/consumer/subscribe-options.interface.ts`:

```ts
return consumerOpts().manualAck().ackExplicit().deliverTo(createInbox());
```

and:

```ts
config.deliver_subject ??= createInbox();
```

### 2. `deliverTo` addition — CORRECT

`deliverTo` is added to the `builder` mock and returns `builder`, enabling fluent chaining:

```ts
deliverTo() {
  return builder;
},
```

This correctly supports `consumerOpts().manualAck().ackExplicit().deliverTo(createInbox())`.

### 3. Missing mock method — `subscribe` return value

The mocked `jetstream.subscribe` function is a plain `jest.fn()` and returns `undefined`:

```ts
subscribe,
```

Both `JetStreamConsumerService` and `RequestReplyConsumerService` expect `subscribe` to return an `AsyncIterable<JsMsg>` and immediately call `processSubscription`, which iterates with `for await...of`:

```ts
const subscription = await this.jetStream.subscribe(subject, consumerOpts);
this.processSubscription(subscription, subject).catch(...);
```

Because `subscription` is `undefined`, `processSubscription` throws:

```text
TypeError: Cannot read properties of undefined (reading 'Symbol(Symbol.asyncIterator)')
```

This error is visible when running `npm run test:e2e -- src/events-toolkit.runtime.e2e-spec.ts`. The test assertions still pass because the errors are caught and logged, but the mock is incomplete and pollutes test output with unhandled exceptions.

## Fix Plan

Update the `nats` mock so `subscribe` returns an empty async iterable, matching the pattern used in unit specs (`src/consumer/jetstream-consumer.service.spec.ts`):

```ts
const subscribe = jest.fn().mockResolvedValue((async function* () {})());
```

Or, if keeping the current declaration style:

```ts
const subscribe = jest.fn();
// ... later in the return object:
subscribe: subscribe.mockResolvedValue((async function* () {})()),
```

This eliminates the `Symbol(Symbol.asyncIterator)` errors and makes the mock consistent with how the consumer services consume JetStream subscriptions.

## Conclusion

`createInbox` and `deliverTo` were added correctly. The mock is still incomplete because `jetstream.subscribe` returns `undefined` instead of an async iterable, causing runtime errors in `processSubscription` that are silently swallowed.
