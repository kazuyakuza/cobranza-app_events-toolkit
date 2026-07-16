# Simplification Review — Task 1: Add `createInbox` to the e2e NATS mock

- TODO: `.agent/todos/20260716/20260716-todo-1.md` (Task 1)
- Implementation plan: `.kilo/plans/20260716-fix-e2e-createInbox-mock-task1.md`
- Target file: `src/events-toolkit.runtime.e2e-spec.ts`

## Findings

### 1. Current mock is complete for the exercised code paths

The v0.11.4 fix in `src/consumer/subscribe-options.interface.ts` only calls these builder methods on the mock:

- `consumerOpts().manualAck().ackExplicit().deliverTo(createInbox())`
- `isConsumerOptsBuilder()` checks `getOpts`

The current mock builder provides exactly those methods (`manualAck`, `ackExplicit`, `deliverTo`, `getOpts`) plus the newly added `createInbox`. No current test or production path needs additional NATS exports from this mock.

### 2. Simplification opportunity: make the `ConsumerOptsBuilder` mock future-proof

The builder is currently defined as a hand-written chain of four methods:

```ts
const builder = {
  manualAck() { return builder; },
  ackExplicit() { return builder; },
  deliverTo() { return builder; },
  getOpts() { return { config: { ack_policy: ackPolicyExplicit } }; },
};
```

If `createDefaultConsumerOpts()` (or future tests) chains any additional `ConsumerOptsBuilder` method — `durable`, `deliverGroup`, `maxDeliver`, `orderedConsumer`, etc. — the mock will throw a runtime error and the test will fail again. This makes the mock brittle.

A `Proxy`-based builder can replace the explicit method list and return itself for every unknown method call, while still overriding `getOpts` to return the deterministic config:

```ts
const builder = new Proxy(
  {
    getOpts() {
      return { config: { ack_policy: ackPolicyExplicit } };
    },
  },
  {
    get(target, prop) {
      if (prop === 'getOpts') return target.getOpts;
      return () => builder;
    },
  },
);
```

This keeps the mock behavior identical for the current tests but removes the need to enumerate every builder method. The mock becomes shorter and more maintainable.

### 3. No other missing mock surface identified

The `nats` exports used by this spec and by the consumer code paths exercised here are:

- `AckPolicy` — mocked
- `consumerOpts` — mocked
- `createInbox` — now mocked
- `connect` — mocked

Other NATS exports (`JetStreamClient`, `NatsConnection`, `StreamConfig`, `JsMsg`, etc.) are either type-only imports or not reached by the runtime paths in this e2e spec.

## Proposed Simplification Plan

1. Replace the explicit `builder` object in `src/events-toolkit.runtime.e2e-spec.ts` with a `Proxy`-based builder that returns itself for every property access except `getOpts`.
2. Keep `createInbox: () => '_INBOX.test'` unchanged — it is the minimal fix and is deterministic.
3. Run the targeted e2e test command from the implementation plan to confirm the change does not alter behavior:
   `npx jest --config jest.e2e.config.js src/events-toolkit.runtime.e2e-spec.ts`

## Out of Scope

- No changes to the real `subscribe-options.interface.ts` production code.
- No changes to the other e2e spec (`events-toolkit.module.e2e-spec.ts`) per the existing AI agent note in the file.
- Commit/merge is handled by Task 3.

## Recommendation

Apply the Proxy-based builder simplification. It is a small, low-risk refactor that reduces mock maintenance and prevents future failures if additional builder methods are chained.
