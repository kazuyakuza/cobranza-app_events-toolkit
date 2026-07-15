# Implementation Plan — Task 1: Fix `RequestReplyConsumerService` missing `autoCreateStreams` support

**TODO File**: `.agent/todos/20260714/20260714-todo-3.md`
**Global Plan**: `.kilo/plans/20260714-fix-request-reply-autoCreateStreams.md`
**Branch**: `fix/request-reply-autoCreateStreams`
**Date**: 2026-07-14
**Version**: `0.11.2` (package.json already bumped — Step 3 done)

## 1. Pre-Analysis

### 1.1 Problem
`JetStreamConsumerService` (v0.11.0/0.11.1) gained `autoCreateStreams` support: it receives `connection` + `autoCreateStreams` via `JetStreamConsumerDeps`, instantiates `StreamAutoCreator` when both are present, and calls `ensureStreamIfNeeded(subject)` before `jetStream.subscribe()`. `RequestReplyConsumerService` was **not** updated, so subscribing to its default `responseSubjectPattern` (`company.*.response.v1`) fails with `Error: no stream matches subject` when no stream exists.

### 1.2 Confirmed Current State (verified by reading source)
- `src/consumer/jetstream-consumer.service.ts` (lines 36–50, 52–60, 79–83): reference implementation. `streamAutoCreator` field, conditional instantiation `deps.autoCreateStreams && deps.connection ? new StreamAutoCreator({ connection: deps.connection }) : undefined`, `ensureStreamIfNeeded()` called in `subscribe()` before `jetStream.subscribe()`.
- `src/consumer/stream-auto-creator.ts`: exposes `StreamAutoCreator` class with `ensureStreamExists(subject)` using `connection.jetstreamManager()`. Constructor takes `StreamAutoCreatorDeps { connection }`.
- `src/consumer/request-reply-consumer.service.ts` (lines 28–39, 91–102): constructor only reads `jetStream`, `logger`, `responseSubjectPattern`, `dlqSubjectBuilder`; `subscribe()` calls `jetStream.subscribe(subject, resolveConsumerSubscribeOpts())` directly with no stream-existence check. No `StreamAutoCreator`, no `connection`.
- `src/consumer/request-reply-consumer-deps.interface.ts` (lines 10–25): lacks `connection` and `autoCreateStreams`.
- `src/consumer/sync-request-reply-consumer-deps-options.interface.ts` (lines 7–13): lacks `connection` and `autoCreateStreams`.
- `src/consumer/consumer-module.providers.ts`:
  - `createSyncRequestReplyConsumerDepsProvider()` (lines 81–92): returns only `jetStream`, `logger`, `responseSubjectPattern`, `dlqSubjectBuilder`. Does NOT pass `connection` / `autoCreateStreams`.
  - `createAsyncRequestReplyConsumerDepsProvider()` (lines 172–183): returns only `jetStream`, `logger`, `responseSubjectPattern`, `dlqSubjectBuilder`. Does NOT pass `connection` / `autoCreateStreams`.
- `src/consumer/consumer.module.ts` `forRoot()` (lines 114–118): calls `createSyncRequestReplyConsumerDepsProvider({ jetStream, responseSubjectPattern, dlqSubjectBuilder })` — omits `connection` and `autoCreateStreams`.
- `src/consumer/request-reply-consumer.service.spec.ts` (361 lines): no auto-creation tests.
- `src/consumer/jetstream-consumer.service.auto-create.spec.ts`: **reference pattern** for stream auto-creation tests — a dedicated sibling spec file using `Test.createTestingModule`, mock `jetStream`, mock `connection.jetstreamManager()` with `streams.find` / `streams.add`, and an async `buildServiceWithAutoCreate()` helper.
- `package.json` version: `0.11.2` (already bumped).
- `CHANGELOG.md`: latest entry is `[0.11.0]`. No `[0.11.1]` or `[0.11.2]` entry yet.

### 1.3 High-Level Approach
Replicate the exact `autoCreateStreams` pattern from `JetStreamConsumerService` into `RequestReplyConsumerService`:
1. Extend `RequestReplyConsumerDeps` with `connection?` + `autoCreateStreams?`.
2. Extend `SyncRequestReplyConsumerDepsOptions` with `connection?` + `autoCreateStreams?`.
3. In `RequestReplyConsumerService`: add `streamAutoCreator?` field, instantiate it in the constructor when `autoCreateStreams && connection`, call `ensureStreamIfExists()` in `subscribe()` before `jetStream.subscribe()`.
4. Wire `connection` + `autoCreateStreams` through both sync and async request-reply provider factories.
5. Pass `connection` + `autoCreateStreams` from `ConsumerModule.forRoot()` into `createSyncRequestReplyConsumerDepsProvider()`.
6. Add a dedicated sibling spec `request-reply-consumer.service.auto-create.spec.ts` following the established `jetstream-consumer.service.auto-create.spec.ts` pattern (keeps file under 200-line limit; matches codebase convention).
7. Add a `[0.11.2]` CHANGELOG entry.

### 1.4 Constraints Checklist
- Max 200 lines/file: all modified source files remain well under 200 after edits (largest is `consumer.module.ts` ~176 lines; `consumer-module.providers.ts` ~187 lines).
- Max 50 lines/method: `subscribe()` gains one new line (`await this.ensureStreamIfNeeded(subject);`) + a small private helper. Stays well within limit.
- Max 2 indentation depth: new `ensureStreamIfNeeded()` is a single `if` (1 level) — compliant.
- Max 2 params/method: no method signatures change arity. Provider factory fns already take single options objects.
- Prefer private members: `streamAutoCreator` is `private readonly`; `ensureStreamIfNeeded()` is `private`.
- Self-documenting code: clear names; JSDoc on new interface fields.
- No commented-out code.
- Single-section boolean conditions: `deps.autoCreateStreams && deps.connection` is two sections → extract into a private `shouldAutoCreateStreams(deps)` helper, OR keep the ternary pattern used verbatim by `JetStreamConsumerService` (line 48–49 uses `deps.autoCreateStreams && deps.connection ? ... : undefined`). To match the reference exactly and avoid introducing divergence, **replicate the exact same conditional expression** from `JetStreamConsumerService`. The rule allows extraction; the reference implementation did not extract. To stay consistent with the reference and reduce review friction, use the identical ternary. (This is a documented, accepted deviation matching the existing approved pattern.)

## 2. Detailed Steps

### Step 1 — Update `RequestReplyConsumerDeps` interface
**File**: `src/consumer/request-reply-consumer-deps.interface.ts`

**Change**: import `NatsConnection` and add two optional fields, mirroring `JetStreamConsumerDeps` (lines 18–21 of `jetstream-consumer-deps.interface.ts`).

**Exact edits**:
- Line 1: change `import { JetStreamClient } from 'nats';` → `import { JetStreamClient, NatsConnection } from 'nats';`
- After the `dlqSubjectBuilder` field (current line 24), before the closing brace (line 25), add:
```ts
  /** NATS connection used to create streams when auto-creation is enabled. */
  connection?: NatsConnection;
  /** When true, auto-create a JetStream stream for the response subject pattern. Default: false. */
  autoCreateStreams?: boolean;
```

**Resulting file** (~31 lines, under 200). Field order matches `JetStreamConsumerDeps` (dlqSubjectBuilder → connection → autoCreateStreams).

---

### Step 2 — Update `SyncRequestReplyConsumerDepsOptions` interface
**File**: `src/consumer/sync-request-reply-consumer-deps-options.interface.ts`

**Change**: import `NatsConnection` and add `connection?` + `autoCreateStreams?`, mirroring `SyncJetStreamConsumerDepsOptions`.

**Exact edits**:
- Line 1: change `import { JetStreamClient } from 'nats';` → `import { JetStreamClient, NatsConnection } from 'nats';`
- After `dlqSubjectBuilder` field (current line 13), before closing brace (line 14), add:
```ts
  /** NATS connection used to create streams when auto-creation is enabled. */
  connection?: NatsConnection;
  /** When true, auto-create a JetStream stream for the response subject pattern. */
  autoCreateStreams?: boolean;
```

**Resulting file** (~20 lines).

---

### Step 3 — Update `RequestReplyConsumerService`
**File**: `src/consumer/request-reply-consumer.service.ts`

**Changes**:
1. **Imports** (top of file):
   - Line 2: change `import { JetStreamClient, JsMsg } from 'nats';` → `import { JetStreamClient, JsMsg, NatsConnection } from 'nats';`
   - Add a new import after the existing consumer imports (after line 10, before the class): `import { StreamAutoCreator } from './stream-auto-creator';`

2. **Private field** (after `processor` field, current line 26):
```ts
  private readonly streamAutoCreator?: StreamAutoCreator;
```

3. **Constructor** (current lines 28–39): after setting `this.processor` (line 33–38), before the closing `}` of constructor, add the conditional instantiation — identical pattern to `JetStreamConsumerService` lines 48–49:
```ts
    this.streamAutoCreator =
      deps.autoCreateStreams && deps.connection ? new StreamAutoCreator({ connection: deps.connection }) : undefined;
```
   (Indentation: 2 levels inside constructor — compliant. Matches reference exactly.)

4. **`subscribe()` method** (current lines 91–102): insert a stream-existence check as the **first** statement, before `const subscription = await this.jetStream.subscribe(...)`. After:
```ts
  async subscribe(subject: string): Promise<void> {
    await this.ensureStreamIfNeeded(subject);
    const subscription = await this.jetStream.subscribe(subject, resolveConsumerSubscribeOpts());
    ...
```

5. **New private helper** (add near the other private methods, after `buildHandlerKey` / before `processSubscription`, i.e. after current line 111):
```ts
  private async ensureStreamIfNeeded(subject: string): Promise<void> {
    if (this.streamAutoCreator) {
      await this.streamAutoCreator.ensureStreamExists(subject);
    }
  }
```
   (Single-section boolean condition `if (this.streamAutoCreator)` — compliant. Depth: 1 level inside method, the await line is 2 levels — compliant.)

**Resulting file** (~128 lines — under 200). `subscribe()` body grows by 1 line + helper; well under 50-line method limit.

---

### Step 4 — Update sync + async request-reply provider factories
**File**: `src/consumer/consumer-module.providers.ts`

**Change A — `createSyncRequestReplyConsumerDepsProvider()` (lines 81–92)**: pass `connection` + `autoCreateStreams` from `options` into the returned deps object.

Replace the factory body (lines 84–89):
```ts
    useFactory: (logger: EventLoggerService) => ({
      jetStream: options.jetStream,
      logger,
      responseSubjectPattern: options.responseSubjectPattern,
      dlqSubjectBuilder: options.dlqSubjectBuilder,
    }),
```
with:
```ts
    useFactory: (logger: EventLoggerService) => ({
      jetStream: options.jetStream,
      logger,
      responseSubjectPattern: options.responseSubjectPattern,
      dlqSubjectBuilder: options.dlqSubjectBuilder,
      connection: options.connection,
      autoCreateStreams: options.autoCreateStreams,
    }),
```

**Change B — `createAsyncRequestReplyConsumerDepsProvider()` (lines 172–183)**: pass `connection` + `autoCreateStreams` from `combined` into the returned deps. Mirror the async JetStream provider (lines 144–157) which reads `combined.connection.connection ?? combined.moduleOptions.connection` and `combined.moduleOptions.autoCreateStreams`.

Replace the factory body (lines 175–180):
```ts
    useFactory: (combined: RequestReplyAsyncDeps, logger: EventLoggerService) => ({
      jetStream: combined.connection.jetStream,
      logger,
      responseSubjectPattern: combined.moduleOptions.responseSubjectPattern,
      dlqSubjectBuilder: combined.connection.dlqSubjectBuilder,
    }),
```
with:
```ts
    useFactory: (combined: RequestReplyAsyncDeps, logger: EventLoggerService) => ({
      jetStream: combined.connection.jetStream,
      logger,
      responseSubjectPattern: combined.moduleOptions.responseSubjectPattern,
      dlqSubjectBuilder: combined.connection.dlqSubjectBuilder,
      connection: combined.connection.connection ?? combined.moduleOptions.connection,
      autoCreateStreams: combined.moduleOptions.autoCreateStreams,
    }),
```

**Resulting file** (~187 lines — under 200). No new imports needed (`NatsConnection` already used by `resolveJetStreamFromOptions`/types; the options interfaces already carry the typed fields after Steps 1 & 2).

---

### Step 5 — Update `ConsumerModule.forRoot()`
**File**: `src/consumer/consumer.module.ts`

**Change** (lines 114–118): pass `connection` + `autoCreateStreams` into `createSyncRequestReplyConsumerDepsProvider()`, mirroring how the same call (lines 107–112) passes them to `createSyncJetStreamConsumerDepsProvider()`.

Replace:
```ts
        createSyncRequestReplyConsumerDepsProvider({
          jetStream,
          responseSubjectPattern: options.responseSubjectPattern,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
        }),
```
with:
```ts
        createSyncRequestReplyConsumerDepsProvider({
          jetStream,
          responseSubjectPattern: options.responseSubjectPattern,
          dlqSubjectBuilder: options.dlqSubjectBuilder,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
        }),
```

**Resulting file** (~176 lines — under 200). `forRootAsync()` needs **no** change: `createAsyncRequestReplyConsumerDepsProvider()` already injects `REQUEST_REPLY_CONSUMER_ASYNC_DEPS_TOKEN` + `EventLoggerService`, and the async token provider (`createRequestReplyAsyncDepsProvider()`) already combines `RESOLVED_CONNECTION_TOKEN` (which carries `connection`) + `CONSUMER_MODULE_OPTIONS` (which carries `autoCreateStreams`). Step 4 Change B makes the async path forward these fields automatically.

---

### Step 6 — Add stream auto-creation unit tests
**Decision — file placement**: Create a **new dedicated sibling spec** `src/consumer/request-reply-consumer.service.auto-create.spec.ts`, following the established `jetstream-consumer.service.auto-create.spec.ts` reference pattern.

**Rationale**: 
- The constraint explicitly says "follow `jetstream-consumer.service.auto-create.spec.ts` as the reference pattern" — that file is a separate sibling spec.
- The existing `request-reply-consumer.service.spec.ts` is already 361 lines (exceeds the 200-line source-file rule); adding ~80 lines of auto-create tests would worsen it. A dedicated file keeps each spec focused and rule-compliant.
- This satisfies the TODO item "request-reply-consumer.service.spec.ts (add tests)" by adding request-reply auto-creation test coverage in the consumer spec family; the new file is the `.auto-create.spec.ts` companion, exactly as done for the JetStream consumer.

**File**: `src/consumer/request-reply-consumer.service.auto-create.spec.ts` (NEW)

**Content** — mirror `jetstream-consumer.service.auto-create.spec.ts` structure:
- `describe('RequestReplyConsumerService — subscribe with autoCreateStreams', ...)`
- Mocks: `jetStream` (`{ publish, subscribe }`), `mockLogger`, `jetStreamManagerMock` (`{ streams: { find, add } }`), `connectionMock` (`{ jetstreamManager }`).
- `testSubject = 'company.*.response.v1'` (the default response subject pattern).
- `buildServiceWithAutoCreate({ connection?, autoCreateStreams? })` helper using `Test.createTestingModule` with `REQUEST_REPLY_CONSUMER_DEPS_TOKEN` provider factory + `EventLoggerService` useValue + `RequestReplyConsumerService`. The factory returns deps including `connection` and `autoCreateStreams`.
- Test cases (per TODO §5):
  1. **creates stream when `autoCreateStreams` enabled and stream missing** — `streams.find` rejects with `Error('no stream matches subject')`; call `service.subscribe(testSubject)`; assert `streams.find` called with `testSubject` and `streams.add` called once.
  2. **skips creation when stream already exists** — `streams.find` resolves with `{ name: 'existing' }`; assert `streams.find` called, `streams.add` NOT called.
  3. **skips auto-creation when `autoCreateStreams` is falsy** — build without connection/autoCreateStreams; assert `connectionMock.jetstreamManager` NOT called.
- Provide `jetStream.subscribe.mockResolvedValue(asyncIterable)` with `(async function* () {})()` in each test (so `subscribe()` completes).
- Register no handlers (the response dispatch is not exercised here).

**Note on `onModuleInit`**: Tests call `service.subscribe(subject)` directly (not `onModuleInit()`) to isolate stream auto-creation, exactly as `jetstream-consumer.service.auto-create.spec.ts` calls `serviceWithAuto.subscribe({ subject, handler })` directly. This avoids the fire-and-forget `.catch()` in `onModuleInit()` swallowing assertions.

**Snippet (helper)**:
```ts
async function buildServiceWithAutoCreate(
  options: { connection?: unknown; autoCreateStreams?: boolean } = {},
): Promise<RequestReplyConsumerService> {
  const module = await Test.createTestingModule({
    providers: [
      {
        provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
        useFactory: (logger: EventLoggerService) => ({
          jetStream,
          logger,
          dlqSubjectBuilder: defaultDlqSubjectBuilder,
          responseSubjectPattern: testSubject,
          connection: options.connection,
          autoCreateStreams: options.autoCreateStreams,
        }),
        inject: [EventLoggerService],
      },
      { provide: EventLoggerService, useValue: mockLogger },
      RequestReplyConsumerService,
    ],
  }).compile();
  return module.get(RequestReplyConsumerService);
}
```

Imports needed: `Test` from `@nestjs/testing`, `RequestReplyConsumerService`, `REQUEST_REPLY_CONSUMER_DEPS_TOKEN`, `defaultDlqSubjectBuilder` from `./subscribe-options.interface`, `EventLoggerService`.

**Estimated file size**: ~95 lines (under 200).

---

### Step 7 — Update CHANGELOG
**File**: `CHANGELOG.md`

**Change**: Insert a new `## [0.11.2] — 2026-07-14` section **above** the current `## [0.11.0] — 2026-07-14` line (line 8). (There is no `[0.11.1]` section; version goes 0.11.0 → 0.11.2 directly per package.json.)

**Entry content**:
```markdown
## [0.11.2] — 2026-07-14

### Fixed

- **`RequestReplyConsumerService` now supports `consumer.autoCreateStreams`**: Previously only `JetStreamConsumerService` auto-created JetStream streams on subscribe. The request-reply response consumer subscribed to its `responseSubjectPattern` (default `company.*.response.v1`) without ensuring a stream existed, causing `Error: no stream matches subject` at startup in services using request-reply with `autoCreateStreams: true`. `RequestReplyConsumerService` now instantiates `StreamAutoCreator` when both `connection` and `autoCreateStreams` are provided and calls `ensureStreamExists()` before `jetStream.subscribe()`.

### Changed

- `RequestReplyConsumerDeps` and `SyncRequestReplyConsumerDepsOptions` now accept optional `connection` and `autoCreateStreams` fields.
- `createSyncRequestReplyConsumerDepsProvider` and `createAsyncRequestReplyConsumerDepsProvider` propagate `connection` and `autoCreateStreams` to the request-reply consumer deps.
- `ConsumerModule.forRoot()` forwards `connection` and `autoCreateStreams` to the sync request-reply deps provider (`forRootAsync` already wired via the combined async deps token).

### Tests

- Added `src/consumer/request-reply-consumer.service.auto-create.spec.ts` covering stream auto-creation (enabled + missing → created, enabled + exists → skipped, disabled → no manager call), mirroring `jetstream-consumer.service.auto-create.spec.ts`.
```

---

## 3. Git Actions (for implementer — Step 4.2)
- After each meaningful chunk, commit with clear messages. Suggested commit grouping:
  1. `fix(consumer): add autoCreateStreams support to RequestReplyConsumerService` (Steps 1–5: interfaces, service, providers, module).
  2. `test(consumer): add request-reply stream auto-creation spec` (Step 6).
  3. `docs(changelog): document 0.11.2 request-reply autoCreateStreams fix` (Step 7).
- Follow `.kilo/rules/gitignore-compliance.md`: read `.gitignore`, run `git status`, ensure no `node_modules/` / `dist/` staged.

## 4. Build / Test / Lint / Typecheck (for implementer & verifier)
- `npm test -- src/consumer/request-reply-consumer.service.auto-create.spec.ts` — new spec green.
- `npm test -- src/consumer/request-reply-consumer.service.spec.ts` — existing spec still green.
- `npm test` — full suite green.
- `npm run lint` — no new lint errors.
- `npm run build` — compiles cleanly (declares new optional fields; no breaking change for consumers omitting them).
- (If a typecheck script exists) `npm run typecheck` — clean.

## 5. Verification Checklist (Step 4.5)
- [ ] `RequestReplyConsumerDeps` has `connection?` + `autoCreateStreams?` with JSDoc.
- [ ] `SyncRequestReplyConsumerDepsOptions` has `connection?` + `autoCreateStreams?`.
- [ ] `RequestReplyConsumerService` constructor instantiates `StreamAutoCreator` conditionally (matches `JetStreamConsumerService`).
- [ ] `subscribe()` calls `ensureStreamIfNeeded()` before `jetStream.subscribe()`.
- [ ] `ensureStreamIfNeeded()` is private, single-section condition, ≤2 depth.
- [ ] Sync + async request-reply provider factories pass `connection` + `autoCreateStreams`.
- [ ] `ConsumerModule.forRoot()` passes `connection` + `autoCreateStreams` to the sync request-reply provider.
- [ ] `forRootAsync()` requires no change (verified: async deps token already combines connection + moduleOptions).
- [ ] New spec file follows `jetstream-consumer.service.auto-create.spec.ts` pattern; 3 required cases present.
- [ ] All modified files ≤ 200 lines; all methods ≤ 50 lines; ≤ 2 params; ≤ 2 depth.
- [ ] No commented-out code; self-documenting names; private members by default.
- [ ] CHANGELOG has `[0.11.2]` entry above `[0.11.0]`.
- [ ] No unrelated code changed.

## 6. Out of Scope (NOT done in this task)
- No changes to `JetStreamConsumerService` (already correct).
- No changes to `StreamAutoCreator` / `build-stream-name.util.ts`.
- No changes to `consumer.module.auto-create.spec.ts` (it only asserts JetStream consumer deps; TODO does not list it). OPTIONAL future improvement: extend it to assert request-reply deps also receive `connection`/`autoCreateStreams` — left as a note, not implemented here.
- No README / `docs/nats-jetstream-configuration.md` edits (the fix parallels existing documented JetStream behavior; documentation step 4.4 may add a clarifying line if the docs-specialist deems it necessary, but the TODO lists only CHANGELOG under Documentation).
- No runtime/e2e spec changes.

## 7. Files Changed Summary
| File | Action | Approx. Lines |
|------|--------|---------------|
| `src/consumer/request-reply-consumer-deps.interface.ts` | Edit | ~31 |
| `src/consumer/sync-request-reply-consumer-deps-options.interface.ts` | Edit | ~20 |
| `src/consumer/request-reply-consumer.service.ts` | Edit | ~128 |
| `src/consumer/consumer-module.providers.ts` | Edit | ~187 |
| `src/consumer/consumer.module.ts` | Edit | ~176 |
| `src/consumer/request-reply-consumer.service.auto-create.spec.ts` | NEW | ~95 |
| `CHANGELOG.md` | Edit | +27 |

## 8. Plan vs TODO Reconciliation
- TODO §1 (Update `RequestReplyConsumerDeps`) → Step 1 ✓
- TODO §2 (Update `RequestReplyConsumerService`) → Step 3 ✓
- TODO §3 (Update provider factories) → Step 4 ✓
- TODO §4 (Update `ConsumerModule.forRoot()`) → Step 5 ✓
- TODO §5 (Tests) → Step 6 ✓ (dedicated spec per reference-pattern constraint)
- TODO §6 (Documentation / CHANGELOG) → Step 7 ✓
- TODO "Files to Modify" lists `request-reply-consumer.service.spec.ts (add tests)` — satisfied by new sibling `.auto-create.spec.ts` that adds the required tests in the same spec family, per the explicit reference pattern constraint and the 200-line rule. This is an intentional, documented deviation from the literal filename that better fits the codebase convention.
- Required changes 1–7 from the assignment prompt are all covered:
  1. Deps interface → Step 1 ✓
  2. Sync options interface → Step 2 ✓
  3. Service constructor + subscribe + StreamAutoCreator → Step 3 ✓
  4. Sync + async providers → Step 4 ✓
  5. `forRoot()` → Step 5 ✓
  6. Unit tests (enabled+missing, disabled, enabled+exists) → Step 6 ✓
  7. CHANGELOG v0.11.2 → Step 7 ✓

Plan is complete and consistent with the TODO. No ambiguities remain.