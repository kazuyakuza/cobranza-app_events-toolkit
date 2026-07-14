# Global Plan — Fix: @cobranza-apps/events-toolkit — Runtime errors in forRootAsync path

## Source

- **TODO file**: `.agent/todos/20260714/20260714-todo-0.md`
- **Branch**: `feat/fix-forRootAsync-runtime-errors`
- **Version bump**: patch (0.10.4 → 0.10.5)

## Global Pre-Analysis

After fixing DI resolution bugs (missing exports, missing DiscoveryModule import, missing RequestReplyService provider), the `forRootAsync` path now fails at runtime in `ms-db-gateway` with two distinct errors:

1. **JetStream consumer options**: `JetStreamConsumerService.subscribe()` passes `{}` to `jetStream.subscribe()` when `consumerOpts` is absent. NATS `JetStreamClientImpl._processOptions` expects a `ConsumerOptsBuilder` or an object with a `config` property containing `ack_policy`. `{}` causes `Cannot read properties of undefined (reading 'ack_policy')`.

2. **Explorer metadata reflection**: `OnEventExplorer.registerInstanceHandlers()` iterates over `Object.getOwnPropertyNames(prototype)`, which includes getter/setter accessor properties. For accessors, `target.prototype[methodName]` returns `undefined`. `Reflect.getMetadata` throws when given `undefined`.

3. **Missing e2e coverage**: The existing e2e test (`events-toolkit.module.e2e-spec.ts`) only verifies DI compilation. It does not boot the explorers with real-like handlers, nor does it test JetStream subscription setup, so neither bug was caught.

## Technical Decisions

- **Default consumer options**: When `consumerOpts` is absent, build a minimal valid `ConsumerOpts` object with `config.ack_policy: AckPolicy.Explicit`. The NATS v2.x library still exports `AckPolicy` enum. We will import it from `nats`.
- **Explorer guard**: Add `typeof methodRef === 'function'` guard in both `OnEventExplorer` and `OnRequestReplyExplorer` before calling `this.deps.reflector.get()`.
- **E2e test scope**: Extend the existing e2e test or create a new one that: (a) includes a provider with `@OnEvent` and a getter/setter property, (b) verifies the explorer registers handlers without crashing, (c) verifies `JetStreamConsumerService.subscribe()` with default options doesn't crash.

## Step Outline

### Step 2: Git Feature Branch Setup
- Commit any unstaged files
- Switch to `main`, create `feat/fix-forRootAsync-runtime-errors`

### Step 3: Version Update
- Bump patch version in `package.json` to `0.10.5`
- Commit: `chore: bump version to 0.10.5`

### Task 1: Fix JetStream consumer options

#### 4.1 Analysis & Planning
- Analyze NATS `JetStreamClient.subscribe()` signature and expected options shape
- Determine correct default options object with `AckPolicy.Explicit`
- Save per-task plan to `.kilo/plans/20260714-fix-jetstream-consumer-options.md`

#### 4.2 Implementation
- Import `AckPolicy` from `nats`
- Create `buildDefaultConsumerOpts()` private method in `JetStreamConsumerService`
- Update `subscribe()` to pass `options.consumerOpts ?? this.buildDefaultConsumerOpts()`
- Update unit test in `jetstream-consumer.service.spec.ts` to assert correct default options shape
- Commit changes

#### 4.3 Code Review & Simplification
- Review for correctness, edge cases, and plan adherence
- Simplify if possible
- Apply fixes if needed

#### 4.4 Documentation
- Add JSDoc to `buildDefaultConsumerOpts()`
- Update relevant docs if needed

#### 4.5 Verification
- Verify implementation matches plan
- Run unit tests for `JetStreamConsumerService`

#### 4.6 Task Completion
- Mark task `[DONE]` in TODO file
- Commit

### Task 2: Fix OnEventExplorer metadata reflection

#### 4.1 Analysis & Planning
- Confirm both explorers need the guard
- Plan unit test additions with getter/setter properties
- Save per-task plan to `.kilo/plans/20260714-fix-explorer-metadata-reflection.md`

#### 4.2 Implementation
- Add `typeof methodRef === 'function'` guard in `OnEventExplorer.tryRegisterHandler()`
- Add same guard in `OnRequestReplyExplorer.tryRegisterHandler()`
- Add unit tests in both explorer spec files with a class containing getter/setter
- Commit changes

#### 4.3 Code Review & Simplification
- Review for correctness and plan adherence
- Simplify if possible
- Apply fixes if needed

#### 4.4 Documentation
- Add inline comment explaining the guard

#### 4.5 Verification
- Verify implementation matches plan
- Run unit tests for both explorers

#### 4.6 Task Completion
- Mark task `[DONE]` in TODO file
- Commit

### Task 3: Add end-to-end integration test

#### 4.1 Analysis & Planning
- Determine whether to extend existing e2e spec or create a new one
- Plan test structure: boot `forRootAsync`, include handler with getter/setter, mock JetStream subscription
- Save per-task plan to `.kilo/plans/20260714-add-e2e-integration-test.md`

#### 4.2 Implementation
- Extend `events-toolkit.module.e2e-spec.ts` or create new `events-toolkit.module.runtime.e2e-spec.ts`
- Include a test provider with `@OnEvent`, a getter property, and a `@OnRequestReply` handler
- Mock `jetStream.subscribe` to assert it receives valid consumer options (not `{}`)
- Ensure `onModuleInit` runs without throwing
- Commit changes

#### 4.3 Code Review & Simplification
- Review test coverage and plan adherence
- Simplify if possible
- Apply fixes if needed

#### 4.4 Documentation
- Add AI agent notes in e2e spec explaining test purpose

#### 4.5 Verification
- Verify implementation matches plan
- Run `npm run test:e2e` to confirm test passes

#### 4.6 Task Completion
- Mark task `[DONE]` in TODO file
- Commit

### Step 5: TODO File Completion
- Rename TODO file to `20260714-todo-0-DONE.md`
- Merge feature branch into `main`
- Push `main` to `origin`

### Step 6: Continuation
- Provide next steps for user
