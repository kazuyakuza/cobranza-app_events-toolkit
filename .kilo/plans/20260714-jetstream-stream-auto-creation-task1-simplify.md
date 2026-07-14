# Simplification Plan — JetStream Stream Auto-Creation Task 1

This plan identifies simplification opportunities in the implementation reviewed for `.agent/todos/20260714/20260714-todo-2.md`. The goal is to reduce duplication, remove unnecessary abstractions, and improve test readability without changing behavior.

## 1. Centralize duplicated JetStream resolution logic

**Files**: `src/consumer/consumer.module.ts`, `src/consumer/consumer-module.providers.ts`

**Issue**: Both files define a function that resolves a `JetStreamClient` from `ConsumerModuleOptions` using identical logic:

```ts
if (options.jetStream) return options.jetStream;
if (options.connection) return options.connection.jetstream();
throw new Error('ConsumerModule requires either connection or jetStream in options');
```

**Simplification**: Move the resolution logic to a single exported function (e.g., `resolveJetStreamFromOptions`) in one location and import it from the other. Remove the duplicate `resolveJetStream` in `consumer.module.ts` or reuse it from `consumer-module.providers.ts`.

**Rationale**: Eliminates duplication and reduces the chance of divergent error messages.

## 2. Remove thin `processMessage` wrapper

**File**: `src/consumer/jetstream-consumer.service.ts`

**Issue**: `processMessage` is a one-line wrapper around `handleMessage` exposed only for testing:

```ts
async processMessage(msg: JsMsg, subject: string): Promise<void> {
  return this.handleMessage(msg, subject);
}
```

**Simplification**: Rename `handleMessage` to `processMessage` and delete the wrapper. Update `jetstream-consumer.service.spec.ts` to call `processMessage` directly.

**Rationale**: Removes an unnecessary abstraction and keeps the public surface minimal.

## 3. Extract repeated `createJsMsg(...)` calls in tests

**File**: `src/consumer/jetstream-consumer.service.spec.ts`

**Issue**: The expression `createJsMsg(createValidEventJson(), testSubject)` is repeated in many tests.

**Simplification**: Add a helper such as `createDefaultJsMsg()` that returns a JsMsg with the default valid payload and subject.

**Rationale**: Reduces repetition and makes tests more concise.

## 4. Extract repeated subscription mock setup

**File**: `src/consumer/jetstream-consumer.service.spec.ts`

**Issue**: The pattern `const asyncIterable = (async function* () {})(); jetStream.subscribe.mockResolvedValue(asyncIterable);` is repeated in every `subscribe` test.

**Simplification**: Add a helper such as `mockEmptySubscription()` that creates an empty async iterable and assigns it to `jetStream.subscribe`.

**Rationale**: Removes boilerplate and makes test intent clearer.

## 5. Extract repeated handler registration in message tests

**File**: `src/consumer/jetstream-consumer.service.spec.ts`

**Issue**: `consumerService.registerHandler(testSubject, handler);` is repeated in almost every `processMessage` test.

**Simplification**: Either add a helper `registerTestHandler(handler)` or move the common registration into a `beforeEach` where a default handler is provided and overridden only when needed.

**Rationale**: Reduces duplicated setup noise.

## 6. Extract DLQ payload decoding helper

**File**: `src/consumer/jetstream-consumer.service.spec.ts`

**Issue**: Multiple tests decode the last DLQ publish call with the same expression:

```ts
const [, dlqPayloadBytes] = jetStream.publish.mock.calls[0];
const dlqPayload = JSON.parse(new TextDecoder().decode(dlqPayloadBytes));
```

**Simplification**: Add a helper `getLastDlqPayload()` that returns the parsed object from the most recent `jetStream.publish` call.

**Rationale**: Centralizes the decoding logic and shortens DLQ assertions.

## 7. Extract repeated exports assertions in module tests

**File**: `src/consumer/consumer.module.spec.ts`

**Issue**: Several tests assert the same set of exports:

```ts
expect(dynamicModule.exports).toContain(ConsumerService);
expect(dynamicModule.exports).toContain(JetStreamConsumerService);
expect(dynamicModule.exports).toContain(OnEventExplorer);
expect(dynamicModule.exports).toContain(RequestReplyConsumerService);
expect(dynamicModule.exports).toContain(OnRequestReplyExplorer);
```

**Simplification**: Add a helper `expectExports(dynamicModule)` that performs all these assertions in one call.

**Rationale**: Reduces duplication and makes tests easier to maintain.

## 8. Extract expected stream config helper

**File**: `src/consumer/stream-auto-creator.spec.ts`

**Issue**: The expected stream config object is fully spelled out in the `ensureStreamExists` test.

**Simplification**: Add a helper such as `expectDefaultStreamConfig(actual, subject)` that asserts the default retention, storage, and limits values.

**Rationale**: Keeps the test focused on the stream name and subject rather than the full default configuration.

## 9. Extract a JSM type alias

**File**: `src/consumer/stream-auto-creator.ts`

**Issue**: The type `Awaited<ReturnType<NatsConnection['jetstreamManager']>>` appears twice in `streamExists` and `createStream` signatures.

**Simplification**: Add a private type alias such as `JetStreamManager` at the top of the file.

**Rationale**: Improves readability and reduces repetition.

## 10. Generalize async import builders in the root module

**File**: `src/events-toolkit.module.ts`

**Issue**: `buildConsumerAsyncImport`, `buildOutboxAsyncImport`, and `buildDiscoveryAsyncImport` all follow the same pattern: create a module via a factory that reads `EventsToolkitModuleOptions` from `EVENTS_TOOLKIT_OPTIONS` and maps the options.

**Simplification**: Introduce a generic helper such as:

```ts
function buildAsyncImport<TOptions, TResult>(
  factory: (module: DynamicModule) => (options: TOptions) => TResult,
  optionsToken: string | symbol,
): DynamicModule;
```

or a reusable `createOptionsBasedFactory<T>(selector)` helper. Apply it to the three async import builders.

**Rationale**: Reduces repetition and makes the async wiring more uniform.

## 11. Consider splitting the long consumer service spec

**File**: `src/consumer/jetstream-consumer.service.spec.ts`

**Issue**: The file is 533 lines and covers message processing, subscribe behavior, moveToDlq, and stream auto-creation.

**Simplification**: Split the file into focused spec files:

- `jetstream-consumer.message.spec.ts` — `processMessage` behavior.
- `jetstream-consumer.subscribe.spec.ts` — `subscribe` and consumer options.
- `jetstream-consumer.dlq.spec.ts` — `moveToDlq` behavior.
- `jetstream-consumer.auto-create.spec.ts` — stream auto-creation wiring.

**Rationale**: Smaller files are easier to read, navigate, and maintain. Only split if the shared helpers (e.g., `createJsMsg`, `createValidEventJson`) can be placed in a common test utility.

## Priority Order

1. **High**: Centralize duplicated JetStream resolution (#1).
2. **High**: Remove the `processMessage` wrapper (#2).
3. **Medium**: Extract test helpers in `jetstream-consumer.service.spec.ts` (#3, #4, #5, #6).
4. **Medium**: Extract test helpers in `consumer.module.spec.ts` (#7) and `stream-auto-creator.spec.ts` (#8).
5. **Low**: Extract JSM type alias (#9) and generalize async import builders (#10).
6. **Optional**: Split the long consumer service spec (#11) if test helpers are shared cleanly.
