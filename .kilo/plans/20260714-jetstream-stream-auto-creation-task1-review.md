# Code Review: JetStream Stream Auto-Creation (Task 1)

**Review scope**: implementation of per-task plan `.kilo/plans/20260714-jetstream-stream-auto-creation-task1.md`.

**Overall assessment**: Core functionality is implemented correctly and tests cover the required scenarios. No functional bugs, race-condition regressions, or breaking changes were found. However, several project-rule violations and minor plan deviations must be addressed before the task is complete.

## Issues Found

### 1. `src/` files exceed 200-line limit

- `src/consumer/jetstream-consumer.service.spec.ts`: 533 lines
- `src/consumer/consumer.module.spec.ts`: 215 lines

Project rule: `src/` code files must not exceed 200 lines.

### 2. Functions with more than 2 parameters

- `createSyncJetStreamConsumerDepsProvider` in `src/consumer/consumer-module.providers.ts`: 4 params
- `createSyncRequestReplyConsumerDepsProvider` in `src/consumer/consumer-module.providers.ts`: 3 params
- `useFactory` in `createAsyncJetStreamConsumerDepsProvider`: 3 params
- `useFactory` in `createAsyncRequestReplyConsumerDepsProvider`: 3 params

Project rule: methods and functions must not have more than 2 params; when required, encapsulate them in an object/class.

### 3. Deviation from plan: `buildStreamName` stream name output

Plan example: `company.*.response.v1` → `auto-company-response-v1`.
Implementation and tests produce: `auto-company---response-v1`.
The plan's regex description (`replace [^a-zA-Z0-9] with -`) logically produces the triple-hyphen version, so the plan text and example are inconsistent. The implementation matches the text but not the written example.

### 4. Minor deviation from plan: `buildStreamConfig` return type

Plan specifies `StreamConfig`; implementation uses `Partial<StreamConfig>`.

### 5. Minor plan/implementation conflict: public `buildStreamName`

The plan explicitly requires `buildStreamName` to be public for testability, which conflicts with the project "prefer private members" rule. The implementation follows the plan.

### 6. Minor deviation: missing JSDoc on `StreamAutoCreator` constants

The plan included JSDoc comments for `STREAM_NAME_INUSE_FRAGMENT`, `NO_STREAM_MATCHES_FRAGMENT`, and `STREAM_NAME_PREFIX`; the implementation does not.

## What Was Verified and Found Correct

- `StreamAutoCreator` error handling: race condition on `streams.add` is swallowed correctly; unknown errors from `find`/`add` are rethrown.
- `subscribe` flow: auto-creation runs after `registerHandler` and before `jetStream.subscribe()`.
- No breaking changes to public APIs (new fields are optional).
- No method body exceeds 50 lines.
- No nesting exceeds 2 levels.
- Tests are present and logically correct for the required scenarios.

## Fix Plan

### Step 1: Split spec files to comply with 200-line limit

1. Split `src/consumer/jetstream-consumer.service.spec.ts`:
   - `src/consumer/jetstream-consumer.service.spec.ts` — keep only a minimal smoke test or a single small block so it stays under 200 lines.
   - `src/consumer/jetstream-consumer.service.process-message.spec.ts` — move all `processMessage` describe blocks.
   - `src/consumer/jetstream-consumer.service.subscribe.spec.ts` — move the `subscribe` describe block.
   - `src/consumer/jetstream-consumer.service.move-to-dlq.spec.ts` — move the `moveToDlq` describe block.
   - `src/consumer/jetstream-consumer.service.auto-create.spec.ts` — move the `subscribe with autoCreateStreams` describe block.
   - Extract shared helpers (`createValidEventJson`, `createJsMsg`) into `src/consumer/jetstream-consumer.service.spec-helpers.ts` to avoid duplication.

2. Split `src/consumer/consumer.module.spec.ts`:
   - `src/consumer/consumer.module.spec.ts` — keep existing non-autoCreateStreams tests.
   - `src/consumer/consumer.module.auto-create.spec.ts` — move the `describe('autoCreateStreams')` block.

### Step 2: Reduce function parameters to ≤ 2

1. Refactor `createSyncJetStreamConsumerDepsProvider` to accept a single options object:

```typescript
export interface SyncJetStreamConsumerDepsOptions {
  jetStream: JetStreamClient;
  dlqSubjectBuilder?: (subject: string) => string;
  connection?: NatsConnection;
  autoCreateStreams?: boolean;
}

export function createSyncJetStreamConsumerDepsProvider(
  options: SyncJetStreamConsumerDepsOptions,
): Provider { ... }
```

Update `ConsumerModule.forRoot` in `src/consumer/consumer.module.ts` to pass an object literal.

2. Refactor `createSyncRequestReplyConsumerDepsProvider` similarly:

```typescript
export interface SyncRequestReplyConsumerDepsOptions {
  jetStream: JetStreamClient;
  responseSubjectPattern?: string;
  dlqSubjectBuilder?: (subject: string) => string;
}
```

3. For async `useFactory` callbacks with 3 injected parameters, introduce combined deps providers so each `useFactory` receives at most 2 arguments:
   - Create `JETSTREAM_CONSUMER_ASYNC_DEPS_TOKEN` that combines `ResolvedConnection` and `ConsumerModuleOptions` via a 2-param factory.
   - Update `createAsyncJetStreamConsumerDepsProvider` `useFactory` to take `(combined: AsyncJetStreamConsumerDeps, services: ConsumerServicesPair)`.
   - Create `REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN` that combines `ResolvedConnection` and `ConsumerModuleOptions` via a 2-param factory.
   - Update `createAsyncRequestReplyConsumerDepsProvider` `useFactory` to take `(combined: AsyncRequestReplyConsumerDeps, logger: EventLoggerService)`.

### Step 3: Align stream name behavior with the plan

Clarify whether the intended output is `auto-company-response-v1` (collapse consecutive separators) or `auto-company---response-v1` (literal per-character replacement). If the example is authoritative, update the regex in `buildStreamName` to use `/[^a-zA-Z0-9]+/g` and update the test expectations accordingly. Otherwise, update the plan example to match the implementation.

### Step 4: Align `buildStreamConfig` return type

Change the return type from `Partial<StreamConfig>` to `StreamConfig` to match the plan, or update the plan to explicitly allow `Partial<StreamConfig>`.

### Step 5: Resolve `buildStreamName` visibility

Either:
- Make `buildStreamName` private and derive stream-name coverage from the `add` call in `ensureStreamExists` tests, or
- Extract `buildStreamName` to a separate exported utility (e.g., `src/consumer/stream-name-builder.ts`) so `StreamAutoCreator` keeps all members private while the naming logic remains independently testable.

### Step 6: Add missing JSDoc to `StreamAutoCreator` constants

Add JSDoc comments to `STREAM_NAME_INUSE_FRAGMENT`, `NO_STREAM_MATCHES_FRAGMENT`, and `STREAM_NAME_PREFIX` to match the plan.

### Step 7: Re-run verification

After fixes, execute the verification commands from the plan:

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`

## Risk Assessment

- No functional bugs or breaking changes.
- Main risk: non-compliance with project file-size and parameter-count rules.
