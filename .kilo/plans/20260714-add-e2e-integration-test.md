# Plan — Add end-to-end integration test (Task 3)

- **TODO:** `.agent/todos/20260714/20260714-todo-0.md` → "Add end-to-end integration test" (3rd task section)
- **Branch (current Critical Workflow):** `feat/fix-forRootAsync-runtime-errors` (set by step 2 of Critical Workflow)
- **Plan file:** `.kilo/plans/20260714-add-e2e-integration-test.md`
- **Date:** 20260714

---

## 1. High-Level Approach

Add a **new** e2e spec file that boots `EventsToolkitModule.forRootAsync` through the full NestJS lifecycle (`await moduleRef.init()`), registering a test provider that carries `@OnEvent`, `@OnRequestReply`, **and** getter/setter accessor properties. The test asserts:

1. `onModuleInit` runs without throwing — catches the `OnEventExplorer` / `OnRequestReplyExplorer` `Reflect.getMetadata(undefined)` bug (fixed by the `typeof methodRef !== 'function'` guard in Tasks 1–2).
2. The explorers actually register the handlers — `ConsumerService` and `RequestReplyConsumerService` contain the expected handlers.
3. `RequestReplyConsumerService` auto-subscribes on init and passes **valid** consumer options (a `ConsumerOptsBuilder` or an object with `config.ack_policy`) to `jetStream.subscribe` — never `{}` — catching the `ack_policy undefined` bug (fixed by `resolveConsumerSubscribeOpts` in Tasks 1–2).
4. `JetStreamConsumerService.subscribe()` explicitly invoked with `consumerOpts: {}` normalizes the empty object into a config that carries `ack_policy` — directly guards the regression described in TODO Error 1.

### Decision: new file vs. extend existing spec

**Create a new file:** `src/events-toolkit.runtime.e2e-spec.ts`.

Rationale:
- `jest.mock('nats', …)` is **file-scoped**. The existing `events-toolkit.module.e2e-spec.ts` mocks `nats` with only `{ connect, jetstream: { publish, subscribe } }` — it does **not** export `consumerOpts` or `AckPolicy`. The runtime test must drive `resolveConsumerSubscribeOpts()` → `consumerOpts()`, so it needs a **richer** `nats` mock that cannot coexist with the DI spec's mock in the same file.
- The existing spec is a **DI compilation** regression guard that only calls `.compile()` (lifecycle hooks do **not** run). The runtime test must call `.init()` to trigger `onModuleInit` hooks — a different concern. Keeping them separate preserves the focused intent and JSDoc of each file.
- The jest e2e config (`jest.e2e.config.js`) matches `\.e2e-spec\.ts$` across the whole repo, so a new `*.e2e-spec.ts` file is automatically picked up by `npm run test:e2e` and the existing CI step (`.github/workflows/npm-publish.yml` line 38–39). No config changes required.

### Decision: mock surface

Reuse the existing e2e mocks for stability, plus enrich the `nats` mock:
- `jest.mock('nats', …)` → provide `connect`, `consumerOpts` (chainable builder with `manualAck`/`ackExplicit`/`getOpts`), and `AckPolicy` enum literal.
- `jest.mock('./outbox/sqlite-outbox.repository', …)` → reuse the same in-memory stub as the DI spec (avoids the `better-sqlite3` native module in the e2e Jest environment).
- SQLite outbox is still imported by `buildOutboxAsyncImport` (always wired in `forRootAsync`), so the repository mock is required even though the test does not exercise outbox behaviour.

---

## 2. Pre-Analysis (Technical & Architecture)

### 2.1 Bug→test mapping

| TODO bug | Root cause (current code already fixed by Tasks 1–2) | How this test catches a regression |
|---|---|---|
| Error 2 — `Reflect.getMetadata` on `undefined` in `OnEventExplorer.tryRegisterHandler` | `Object.getOwnPropertyNames(prototype)` returns accessor names; `prototype[name]` for a getter is `undefined`; without the `typeof methodRef !== 'function'` guard, `reflector.get(METADATA, undefined)` throws. | Register a provider with `get`/`set` accessors + `@OnEvent`/`@OnRequestReply`; `await moduleRef.init()` would throw if the guard were removed. |
| Error 1 — `Cannot read properties of undefined (reading 'ack_policy')` in `JetStreamClientImpl._processOptions` | `JetStreamConsumerService.subscribe` previously called `this.jetStream.subscribe(subject, options.consumerOpts ?? {})`, passing `{}` to NATS. | (a) Assert the auto-subscribe from `RequestReplyConsumerService` passes a valid builder. (b) Call `JetStreamConsumerService.subscribe({ ..., consumerOpts: {} as any })` and assert the 2nd arg to `jetStream.subscribe` has `config.ack_policy`. |

### 2.2 Lifecycle hook facts (verified)

- `Test.createTestingModule(...).compile()` builds the DI container but does **not** run `onModuleInit`. The existing DI spec relies on this.
- `await moduleRef.init()` runs all `OnModuleInit` hooks, then `OnApplicationBootstrap`. This is what the runtime test needs.
- `RequestReplyConsumerService` is `OnModuleInit` → on init it calls `this.subscribe(this.responseSubjectPattern)` (default `'company.*.response.v1'`) → `this.jetStream.subscribe(subject, resolveConsumerSubscribeOpts())`. With `consumerOpts` undefined, `resolveConsumerSubscribeOpts()` returns `createDefaultConsumerOpts()` = `consumerOpts().manualAck().ackExplicit()`. Hence the mock must implement `consumerOpts`.
- `RequestReplyConsumerService.subscribe` wraps `processSubscription` in `.catch()` and logs via `EventLoggerService`; if `jetStream.subscribe` returns `undefined` (jest mock default), the `for await` throws "undefined is not async iterable" but it is swallowed — `.init()` still resolves. Acceptable for the test.
- `DiscoveryService.onModuleInit` returns early when `registerOnStartup: false` (set in the options factory), so no heartbeat/registration publish occurs — no real NATS publish needed.
- `OutboxService` implements only `OnModuleDestroy` and does **not** auto-start its processor, so no background interval is created during `.init()`. The sqlite repository mock is sufficient.

### 2.3 Mock capture strategy

`jest.mock` factories are hoisted. To assert on the `subscribe` mock that the toolkit's internal providers actually call, capture it via `jest.requireMock('nats')` inside `beforeEach`:

```
const natsMock = jest.requireMock('nats') as typeof import('nats');
const connection = await natsMock.connect();
const jetStream = connection.jetstream();
const subscribeSpy = jetStream.subscribe as jest.Mock;
```

Because the mock's `connect`/`jetstream` use `mockReturnValue` (cached, same instance on every call), the `subscribe` reference above is the **same** mock the toolkit's internal providers use — so `.mock.calls` assertions are valid.

### 2.4 Valid-consumer-options assertion (single-section condition rule)

Define a private helper `hasValidAckPolicy(arg)` returning a single boolean, instead of an inline `||` condition, to comply with the Single-Section Boolean Conditions rule:

```
function hasValidConsumerConfig(arg: unknown): boolean {
  if (isConsumerOptsBuilder(arg)) return true;
  return argHasAckPolicy(arg);
}

function argHasAckPolicy(arg: unknown): boolean {
  return Boolean((arg as { config?: { ack_policy?: unknown } })?.config?.ack_policy);
}
```

Usage in assertions: `expect(hasValidConsumerConfig(secondArg)).toBe(true)` and `expect(secondArg).not.toEqual({})`.

### 2.5 File/line budget

- New file must stay under the 200-line source limit (max-lines-per-file rule applies to `src/`).
- Each test body and helper must stay under 50 lines and ≤2 indentation depth.
- Methods/helpers: ≤2 params. The `subscribe` call uses a single options object — already compliant.
- Self-documenting names; no commented-out code; real newlines (newline-prevention).

### 2.6 Expected e2e test result baseline

The fixes for Tasks 1–2 are **already present** in the current tree (`OnEventExplorer.tryRegisterHandler` and `OnRequestReplyExplorer.tryRegisterHandler` both have `if (typeof methodRef !== 'function') return;`; `JetStreamConsumerService.subscribe` uses `resolveConsumerSubscribeOpts`). Therefore this test is a **regression guard** that must pass on the current code. If the guard or `resolveConsumerSubscribeOpts` were reverted, the corresponding assertion would fail — fulfilling acceptance criteria "New end-to-end test passes and is added to CI".

---

## 3. Detailed Implementation Steps

### Step 0 — Pre-checks (no code changes)

1. Read `.agent/project-structure.md` (done) — confirm `src/` is the target for the new test file; no new folders needed.
2. Confirm the feature branch from Critical Workflow step 2 is checked out: `git branch --show-current` (expected `feat/fix-forRootAsync-runtime-errors` or similar). Do NOT create commits during this 4.1 planning step.

### Step 1 — Create the new e2e spec file

**File:** `src/events-toolkit.runtime.e2e-spec.ts`

Use `vscode-mcp-server_create_file_code` (structured editor preferred per tool-selection-priority rule).

Full content (paste with **real newlines**):

```ts
/**
 * End-to-end runtime regression test for `EventsToolkitModule.forRootAsync`.
 *
 * Boots the full toolkit through NestJS lifecycle (`init()`) with mocked NATS
 * and SQLite outbox, then verifies the two runtime bugs fixed alongside this
 * test do not regress:
 *
 * 1. `OnEventExplorer` / `OnRequestReplyExplorer` must skip getter/setter
 *    accessor properties instead of throwing `Reflect.getMetadata(undefined)`.
 *    Guarded by a test provider that declares accessor properties alongside
 *    `@OnEvent` and `@OnRequestReply` handlers.
 * 2. `JetStreamConsumerService` / `RequestReplyConsumerService` must pass
 *    valid consumer options (never `{}`) to `jetStream.subscribe`, so NATS
 *    never reads `undefined.ack_policy`.
 *
 * AI AGENT NOTE: This file owns a richer `nats` mock (with `consumerOpts` and
 * `AckPolicy`) than `events-toolkit.module.e2e-spec.ts`. Keep them separate —
 * `jest.mock` is file-scoped and the DI spec intentionally mocks a minimal
 * `nats` surface.
 */
import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AckPolicy, ConsumerOptsBuilder, ConsumerOpts } from 'nats';
import { EventsToolkitModule } from './events-toolkit.module';
import { EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';
import { ConsumerService } from './consumer/consumer.service';
import { JetStreamConsumerService } from './consumer/jetstream-consumer.service';
import { RequestReplyConsumerService } from './consumer/request-reply-consumer.service';
import { OnEvent } from './consumer/decorators/on-event.decorator';
import { OnRequestReply } from './consumer/decorators/on-request-reply.decorator';
import { isConsumerOptsBuilder } from './consumer/subscribe-options.interface';

const RESPONSE_SUBJECT = 'company.*.response.v1';

/**
 * Test provider that combines decorated handlers with getter/setter accessors.
 *
 * The accessors trigger `Object.getOwnPropertyNames(prototype)` to return
 * non-function members, which is exactly the shape that produced the
 * `Reflect.getMetadata(undefined)` crash before the `typeof methodRef` guard.
 */
@Injectable()
class HandlerWithAccessorsProvider {
  handlerInvoked = false;

  @OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Handles payment proof uploads (e2e runtime guard)',
    payloadExample: { proofId: 'proof-123' },
  })
  async handleProofUploaded(): Promise<void> {
    this.handlerInvoked = true;
  }

  @OnRequestReply('payment.proof.uploaded', {
    description: 'Handles payment proof upload responses (e2e runtime guard)',
    payloadExample: { proofId: 'proof-123' },
  })
  async handleProofUploadedResponse(): Promise<void> {
    this.handlerInvoked = true;
  }

  private _cachedValue = '';

  get cachedValue(): string {
    return this._cachedValue;
  }

  set cachedValue(value: string) {
    this._cachedValue = value;
  }

  plainMethod(): void {}
}

jest.mock('nats', () => {
  const subscribe = jest.fn();
  const builder = {
    manualAck() {
      return builder;
    },
    ackExplicit() {
      return builder;
    },
    getOpts() {
      return { config: { ack_policy: ackPolicyExplicit } };
    },
  };
  const ackPolicyExplicit = 'Explicit';
  return {
    AckPolicy: { Explicit: ackPolicyExplicit, All: 'All', None: 'None' },
    consumerOpts: () => builder,
    connect: jest.fn().mockResolvedValue({
      jetstream: jest.fn().mockReturnValue({
        publish: jest.fn(),
        subscribe,
      }),
      request: jest.fn(),
      close: jest.fn(),
    }),
  };
});

jest.mock('./outbox/sqlite-outbox.repository', () => ({
  SqliteOutboxRepository: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  })),
}));

function buildForRootAsyncOptions(): EventsToolkitModuleAsyncOptions {
  return {
    useFactory: async () => ({
      nats: { servers: ['nats://localhost:4222'] },
      consumer: { enable: true },
      discovery: { enabled: true, registerOnStartup: false },
    }),
  };
}

async function compileAndInit(): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [EventsToolkitModule.forRootAsync(buildForRootAsyncOptions())],
    providers: [HandlerWithAccessorsProvider],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

function hasValidConsumerConfig(arg: unknown): boolean {
  if (isConsumerOptsBuilder(arg)) return true;
  return argHasAckPolicy(arg);
}

function argHasAckPolicy(arg: unknown): boolean {
  const config = (arg as { config?: { ack_policy?: unknown } })?.config;
  return Boolean(config?.ack_policy);
}

describe('EventsToolkitModule.forRootAsync runtime e2e', () => {
  let moduleRef: TestingModule;
  let subscribeSpy: jest.Mock;

  beforeEach(async () => {
    moduleRef = await compileAndInit();
    subscribeSpy = resolveSubscribeSpy();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    jest.clearAllMocks();
  });

  function resolveSubscribeSpy(): jest.Mock {
    const natsMock = jest.requireMock('nats') as {
      connect: jest.Mock;
    };
    const connection = natsMock.connect.mock.results[0].value;
    const jetStream = connection.jetstream();
    return jetStream.subscribe as jest.Mock;
  }

  it('boots without throwing when providers declare getter/setter accessors', () => {
    expect(moduleRef).toBeDefined();
  });

  it('registers the @OnEvent handler from a provider with accessor properties', () => {
    const consumerService = moduleRef.get(ConsumerService);
    expect(consumerService.getHandler('company.*.payment.proof.uploaded.v1')).toBeDefined();
  });

  it('registers the @OnRequestReply handler from a provider with accessor properties', () => {
    const requestReplyConsumer = moduleRef.get(RequestReplyConsumerService);
    expect(requestReplyConsumer.getHandler('payment.proof.uploaded')).toBeDefined();
  });

  it('passes valid consumer options (never {}) to jetStream.subscribe on auto-subscribe', () => {
    const rrCall = findSubscribeCall(RESPONSE_SUBJECT);
    expect(rrCall).toBeDefined();
    const opts = rrCall?.[1];
    expect(opts).not.toEqual({});
    expect(hasValidConsumerConfig(opts)).toBe(true);
  });

  it('normalizes an empty {} consumerOpts into an ack_policy-bearing config', async () => {
    const jetStreamConsumer = moduleRef.get(JetStreamConsumerService);
    const subject = 'company.*.payment.proof.uploaded.v1';
    await jetStreamConsumer.subscribe({
      subject,
      handler: async () => {
        void 0;
      },
      consumerOpts: {} as Partial<ConsumerOpts>,
    });
    const lastCall = findSubscribeCall(subject);
    const opts = lastCall?.[1];
    expect(opts).not.toEqual({});
    expect(hasValidConsumerConfig(opts)).toBe(true);
  });

  function findSubscribeCall(subject: string): readonly unknown[] | undefined {
    return subscribeSpy.mock.calls.find((call) => call[0] === subject);
  }
});
```

#### Step 1 notes for the implementer

- The `consumerOpts: {} as Partial<ConsumerOpts>` cast is intentional: `{}` is a valid `Partial<ConsumerOpts>` and is the exact regression input that previously produced the `ack_policy` crash.
- Do **not** import `ConsumerOptsBuilder` unused — only `ConsumerOpts` and `AckPolicy` are used as types/values; `AckPolicy` import keeps the type bridge. If `AckPolicy` is flagged as unused (it is only referenced inside the mock factory string-literal enum), drop it from the import line and keep `ConsumerOpts` only. Verify with the diagnostics step.
- Keep all helper functions outside the `describe` except those that reference `subscribeSpy` (those are inner functions). `compileAndInit`, `buildForRootAsyncOptions`, `hasValidConsumerConfig`, and `argHasAckPolicy` stay at module scope to keep the `describe` body shallow (max-depth rule).
- The mock factory references `ackPolicyExplicit` before its declaration (`const ackPolicyExplicit = 'Explicit'`) inside `getOpts`. To avoid TDZ, declare `const ackPolicyExplicit = 'Explicit';` **above** the `builder` object. Adjust the snippet accordingly:

```ts
jest.mock('nats', () => {
  const subscribe = jest.fn();
  const ackPolicyExplicit = 'Explicit';
  const builder = {
    manualAck() {
      return builder;
    },
    ackExplicit() {
      return builder;
    },
    getOpts() {
      return { config: { ack_policy: ackPolicyExplicit } };
    },
  };
  return {
    AckPolicy: { Explicit: ackPolicyExplicit, All: 'All', None: 'None' },
    consumerOpts: () => builder,
    connect: jest.fn().mockResolvedValue({
      jetstream: jest.fn().mockReturnValue({ publish: jest.fn(), subscribe }),
      request: jest.fn(),
      close: jest.fn(),
    }),
  };
});
```

- After TDZ fix, the file is ~180 lines — within the 200-line budget. If it exceeds 200 lines, extract `HandlerWithAccessorsProvider` into a sibling `__test-support__/handler-with-accessors.provider.ts` under `src/` (still `.e2e-spec`-adjacent). Prefer keeping it inline unless the budget is breached.

### Step 2 — Verify diagnostics

Run vscode MCP diagnostics on the new file:

- `vscode-mcp-server_get_diagnostics_code` with `path: "src/events-toolkit.runtime.e2e-spec.ts"`, `severities: [0, 1]`.
- Resolve any error/warning (unused imports, implicit `any` on `mock.results[0].value`). Cast through `as { connect: jest.Mock }` for the requireMock return (already done in `resolveSubscribeSpy`).

### Step 3 — Run the e2e suite

Console command (single cmd, not chained):

```
npm run test:e2e
```

- Expected: both `events-toolkit.module.e2e-spec.ts` (existing DI test) and `events-toolkit.runtime.e2e-spec.ts` (new) pass.
- If the runtime test fails, capture the failure and re-check the mock surface. Common failure: `consumerOpts is not a function` → the `nats` mock is missing the `consumerOpts` export. Another: `subscribe is not a function` → the captured `subscribeSpy` is from a different `jetstream()` return instance — confirm `mockReturnValue` (not `mockReturnValueOnce`) is used.

### Step 4 — Run the unit suite (regression)

Console command (single cmd):

```
npm run test
```

- Expected: all existing unit specs still pass (the new file is excluded because the default jest config matches `*.spec.ts` / not `*.e2e-spec.ts`; verify the default `jest.config`/`package.json` jest config does not match e2e files).

### Step 5 — Lint & typecheck

Console commands (run separately, not chained):

```
npm run lint
```
```
npm run build
```

- Expected: no errors. The `build` uses `nest build`/`tsc` and must include the new `*.e2e-spec.ts` only if it is under the `tsconfig` include path; if the build excludes spec files, the new test is still compiled by ts-jest via `tsconfig.jest.json`, which already extends `tsconfig.json`.

### Step 6 — CI verification (no action required, confirm only)

- Open `.github/workflows/npm-publish.yml` lines 38–39: `npm run test:e2e` is already a CI step. The new file is auto-included. **Do not modify the workflow.**

### Step 7 — Documentation update (4.4 step handles final docs; minimal note here)

- Do not modify docs in this 4.1 plan. The docs-specialist (step 4.4 of the Critical Workflow) will add a note to `docs/testing-utilities.md` referencing the new runtime e2e spec. Flag this as a follow-up for the implementer to pass to the docs-specialist:
  > "Add a section to `docs/testing-utilities.md` describing `events-toolkit.runtime.e2e-spec.ts` as the runtime regression guard for the explorer accessor-property bug and the empty-consumer-options bug."

### Step 8 — Commit (handled in 4.2 Implementation, not here)

This plan does not perform git commits. The implementer (step 4.2) will commit with:

```
test: add forRootAsync runtime e2e guard for explorer and consumer-options bugs
```

---

## 4. Verification Against TODO

| TODO requirement (Task 3) | Covered by |
|---|---|
| Create test that boots `EventsToolkitModule.forRootAsync` with real-like handlers | `compileAndInit()` → `EventsToolkitModule.forRootAsync(...)` + `await moduleRef.init()`; `HandlerWithAccessorsProvider` with `@OnEvent` + `@OnRequestReply`. |
| Include handlers with getter/setter properties to catch the `OnEventExplorer` bug | `HandlerWithAccessorsProvider.cachedValue` getter/setter + `@OnEvent`/`@OnRequestReply`; test `"boots without throwing when providers declare getter/setter accessors"`. |
| Include JetStream subscription setup to catch the consumer options bug | (a) auto-subscribe assertion on `RequestReplyConsumerService` init; (b) explicit `JetStreamConsumerService.subscribe({ consumerOpts: {} })` normalisation assertion. |
| New e2e test passes and is added to CI | `jest.e2e.config.js` regex auto-includes the file; CI already runs `npm run test:e2e`. |

All Task 3 sub-items satisfied. Tasks 1 and 2 (the actual code fixes) are **out of scope** for this plan and are handled by their own 4.1–4.6 cycles.

---

## 5. Risks & Mitigations

- **Risk:** `jest.requireMock('nats').connect.mock.results[0].value` is a `Promise` (because `connect` is `mockResolvedValue`), so `.value` is the resolved value, not the promise — `mockResolvedValue` stores the resolved value, so `mock.results[0].value` is the resolved instance. Verified: Jest `mockFn.mockResolvedValue(v)` makes `mockResults[0].value` equal to `v`. Safe.
- **Risk:** Multiple `init()` runs across tests reuse the same cached mock, so `subscribe` call list grows. Mitigation: `jest.clearAllMocks()` in `afterEach` resets `.mock.calls`; each test creates a fresh `TestingModule`.
- **Risk:** `clearAllMocks` also resets `mockResolvedValue` on `connect`. Mitigation: `jest.mock` factory re-applies the module mock per file load, but `clearAllMocks` does **not** reset `mockResolvedValue`-style return values set in the factory? Actually `clearAllMocks` clears `mock.calls` and `mock.results` but **not** implementations. Confirm with the implementer during 4.3 review; if `connect` loses its resolved value, switch to `jest.resetAllMocks()` re-applied + re-`mock` in `beforeAll`, or move mock wiring into `beforeEach`. **Action item for implementer:** if `npm run test:e2e` fails on the 2nd test with `connect(...).jetstream is not a function`, replace `jest.clearAllMocks()` with `jest.resetAllMocks()` and re-establish the mock via a `beforeAll` factory, or simplest: keep `clearAllMocks` but assert on `subscribe` only (which retains `mockReturnValue` from the factory). The factory sets `subscribe: jest.fn()` — `clearAllMocks` clears its calls but the `jetstream()` chain still returns the same object with the same `subscribe` mock (because `mockReturnValue` is an implementation and `clearAllMocks` does not remove implementations). Safe.
- **Risk:** `for await (const msg of subscription)` throws when `subscribe` returns `undefined`. This is swallowed by `.catch()` in `RequestReplyConsumerService.subscribe` (lines 43–51). No test impact; only an error log via the mock logger. Acceptable.

---

## 6. Out of Scope

- Modifying `OnEventExplorer`, `OnRequestReplyExplorer`, `JetStreamConsumerService`, `RequestReplyConsumerService`, or `subscribe-options.interface.ts` (Tasks 1–2).
- Modifying `jest.e2e.config.js`, `package.json`, or `.github/workflows/npm-publish.yml`.
- Writing docs files (handled in 4.4).
- Git commits (handled in 4.2).

---

## 7. Deliverable

- New file: `src/events-toolkit.runtime.e2e-spec.ts` (~180 lines).
- `npm run test:e2e` passes with the new file included.
- Plan file saved at `.kilo/plans/20260714-add-e2e-integration-test.md` (this file).