# Plan — Task 1: Add `createInbox` to the e2e NATS mock

- TODO: `.agent/todos/20260716/20260716-todo-1.md` (Task 1)
- Scope: Single-step fix in `src/events-toolkit.runtime.e2e-spec.ts`. Tasks 2 and 3 (full verification + commit/merge) are handled in their own 4.1–4.6 cycles; NOT part of this plan.

## Root Cause Analysis

The v0.11.4 fix in `src/consumer/subscribe-options.interface.ts` introduced two `createInbox()` call sites:

1. `createDefaultConsumerOpts()` (line 25): `consumerOpts().manualAck().ackExplicit().deliverTo(createInbox())`
2. `ensureValidConsumerConfig()` (line 57): `config.deliver_subject ??= createInbox()`

Both are reachable from `resolveConsumerSubscribeOpts()`:
- `undefined` arg → `createDefaultConsumerOpts()` → `createInbox()`
- plain `Partial<ConsumerOpts>` arg → `ensureValidConsumerConfig()` → `createInbox()`

Callers exercised by the e2e spec:

- `RequestReplyConsumerService.onModuleInit()` (line 48-49) calls `this.subscribe(this.responseSubjectPattern)` → line 93 `this.jetStream.subscribe(subject, resolveConsumerSubscribeOpts())`. This is fire-and-forget with `.catch()`, so `moduleRef.init()` does not throw, but the rejected promise means the auto-subscribe `jetStream.subscribe` call for `RESPONSE_SUBJECT` never lands on the mock.
- `JetStreamConsumerService.subscribe()` (line 57) calls `resolveConsumerSubscribeOpts(options.consumerOpts)`.

The e2e `jest.mock('nats', ...)` factory (lines 38-65 of `events-toolkit.runtime.e2e-spec.ts`) currently returns only: `_subscribeFn`, `AckPolicy`, `consumerOpts`, `connect`. Because `createInbox` is not exported by the mock, the real import `{ createInbox } from 'nats'` resolves to `undefined`, and calling it throws `TypeError: createInbox is not a function`.

### Tests confirmed failing (exactly two)

1. **"passes valid consumer options (never {}) to jetStream.subscribe on auto-subscribe"** (line 136):
   `findSubscribeCall(subscribeMock, RESPONSE_SUBJECT)` returns `undefined` because the `RequestReplyConsumerService` auto-subscribe rejected at `createInbox()`, so no `jetStream.subscribe` call was recorded. `expect(rrCall).toBeDefined()` fails.

2. **"normalizes an empty {} consumerOpts into an ack_policy-bearing config"** (line 145):
   `await jetStreamConsumer.subscribe({ ..., consumerOpts: {} })` → `resolveConsumerSubscribeOpts({})` → `ensureValidConsumerConfig({})` → `createInbox()` throws synchronously → the awaited `subscribe` rejects → the test fails with the `TypeError`.

The other three tests ("boots without throwing", "registers the @OnEvent handler", "registers the @OnRequestReply handler") do not depend on `createInbox` succeeding: boot succeeds (rejection swallowed by `.catch`), and the handler registration tests only query in-memory handler maps. So exactly two tests fail, matching the caller's report.

### Verification that the fix resolves both

Adding `createInbox: () => '_INBOX.test'` to the mock:
- For test 1: `createDefaultConsumerOpts()` now resolves, the auto-subscribe promise fulfills, `jetStream.subscribe(RESPONSE_SUBJECT, <builder>)` is recorded → `findSubscribeCall` returns the call → `rrCall` is defined; the builder passed is a `ConsumerOptsBuilder`, so `hasValidConsumerConfig` returns `true` via `isConsumerOptsBuilder`. PASS.
- For test 2: `ensureValidConsumerConfig({})` sets `config.deliver_subject = '_INBOX.test'` and `config.ack_policy = 'Explicit'`; `subscribe` fulfills; `findSubscribeCall` returns the recorded call; `opts` is the normalized plain object with `config.ack_policy` set → `hasValidConsumerConfig` returns `true` and `opts` is not `{}`. PASS.

No other mock surface needs changing. `_INBOX.test` is a deterministic, valid-looking inbox subject string suitable for assertions (tests only check `ack_policy` / non-empty `config`, never the inbox format).

## Implementation Steps

### Step 0 — Pre-checks (git status, gitignore compliance)

Follow `.kilo/rules/gitignore-compliance.md`.

- Console: `git status`
- Confirm no `node_modules/`, `dist/`, `.eslintcache`, or `.kilo/agent-manager.json` are staged.
- Confirm branch is the feature branch from Critical Workflow step 2 (`feat/...` or `fix/...` for this fix). Do NOT switch branches here (branch setup is a prior step).

### Step 1 — Edit the e2e mock (single-line addition)

File: `src/events-toolkit.runtime.e2e-spec.ts`
Location: the object returned by the `jest.mock('nats', ...)` factory, lines 52-64.

Current return object (lines 52-64):

```ts
  return {
    _subscribeFn: subscribe,
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
```

Add one entry, `createInbox`, to the returned object. Insert it immediately after the `AckPolicy` line (keeps the mock surface grouped: internals → enums → builders → connect). Use a stable string so any future assertion on `deliver_subject` is deterministic.

Resulting return object:

```ts
  return {
    _subscribeFn: subscribe,
    AckPolicy: { Explicit: ackPolicyExplicit, All: 'All', None: 'None' },
    createInbox: () => '_INBOX.test',
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
```

Apply using `vscode-mcp-server_replace_lines_code` (preferred per tool-selection-priority rule) targeting the `AckPolicy` line, or `edit` with the unique `oldString`:

```
    AckPolicy: { Explicit: ackPolicyExplicit, All: 'All', None: 'None' },
    consumerOpts: () => builder,
```

replaced by:

```
    AckPolicy: { Explicit: ackPolicyExplicit, All: 'All', None: 'None' },
    createInbox: () => '_INBOX.test',
    consumerOpts: () => builder,
```

This is the ONLY code change in this plan.

### Step 2 — Confirm the edit

- Re-read lines 38-65 of `src/events-toolkit.runtime.e2e-spec.ts` to confirm `createInbox: () => '_INBOX.test'` is present and formatting (indentation: 4 spaces) is preserved.

### Step 3 — Targeted verification of the two failing tests (Task 1 scope only)

Run only the affected describe block to confirm the two previously-failing tests now pass:

- Console (single cmd): `npx jest --config jest.e2e.config.js src/events-toolkit.runtime.e2e-spec.ts`
- Expected: all 5 tests in `EventsToolkitModule.forRootAsync runtime e2e` pass (the two previously failing now pass; the three that already passed remain green).

NOTE: The full `npm run test:e2e` (all 12) and `npm run test` unit-regression run belong to Task 2 ("Verify e2e tests pass") and are NOT executed in this plan. This step confirms only that the Task 1 edit resolves the two failing tests.

### Step 4 — Report readiness for review/implementation completion

- Commit is NOT part of this plan (Task 3 handles commit/merge). Do NOT stage or commit here unless instructed.
- Signal: summarize the single-line change, exact file/line, and the targeted verification result.

## Rules Compliance Checklist

- Max lines per file: e2e spec grows by 1 line (165 → 166); well under 200. OK.
- Max lines per method: no method grows; mock IIFE is a factory arrow, not a method body under the 50-line rule. OK.
- Max depth (2 levels): addition is a single property at depth 1 inside the returned object. OK.
- Max args per method (2): `() => '_INBOX.test'` takes zero args. OK.
- Self-documenting: `createInbox` matches the real NATS export name; mock returns a clear inbox-like string. OK.
- No commented code / no magic numbers: `'_INBOX.test'` is a conventional NATS inbox prefix; acceptable as a mock fixture. OK.
- Gitignore compliance: only `src/events-toolkit.runtime.e2e-spec.ts` is modified; do not stage build/dep artifacts. OK.

## Out of Scope (handled by other task cycles)

- Task 2: full `npm run test:e2e` (12 tests) + `npm run test` unit regression.
- Task 3: commit, merge to `main`, push to `origin` only.
- 4.3 code review/simplify, 4.4 docs, 4.5 verification, 4.6 completion marking — handled by their own sub-agent invocations per the Critical Workflow.

## Plan Path

`.kilo/plans/20260716-fix-e2e-createInbox-mock-task1.md`