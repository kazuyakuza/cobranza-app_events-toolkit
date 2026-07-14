# Plan: Fix JetStream consumer options (Task 1 — 4.1 Analysis & Planning)

- **TODO file:** `.agent/todos/20260714/20260714-todo-0.md`
- **Task:** "Fix JetStream consumer options" (sub-items under `## Tasks → ### Fix JetStream consumer options`)
- **Scope of this plan:** `JetStreamConsumerService.subscribe()` only. A related, out-of-scope bug is flagged at the end (requires caller approval before expanding scope).
- **Date:** 2026-07-14

## 1. Problem statement

`JetStreamConsumerService.subscribe()` currently does:

```ts
const subscription = await this.jetStream.subscribe(options.subject, options.consumerOpts ?? {});
```

When `options.consumerOpts` is `undefined`, the `?? {}` fallback passes an empty object `{}` to
`JetStreamClientImpl.subscribe()`.

### NATS v2.29.3 runtime behavior (verified in `node_modules/nats`)

`JetStreamClientImpl._processOptions(subject, opts = consumerOpts())` (`node_modules/nats/lib/jetstream/jsclient.js:381`):

```js
const jsi = isConsumerOptsBuilder(opts) ? opts.getOpts() : opts;   // {} → jsi = {}
...
if (jsi.config.ack_policy === AckPolicy.NotSet) { ... }            // jsi.config is undefined → THROW
```

- `isConsumerOptsBuilder(o)` returns `typeof o.getOpts === "function"` → `false` for `{}`.
- Therefore `jsi = {}`, `jsi.config` is `undefined`, and `jsi.config.ack_policy` throws:
  `TypeError: Cannot read properties of undefined (reading 'ack_policy')`.
- The library default `opts = consumerOpts()` only applies when `opts === undefined`. Passing `{}` (not `undefined`) bypasses that default and reaches the crash.

### What a valid consumer options object requires

`ConsumerOpts` (`node_modules/nats/lib/jetstream/types.d.ts:357`) has a `config: Partial<ConsumerConfig>` field, and `ConsumerConfig.ack_policy` must be defined by the time `_processOptions` reads it.

`consumerOpts()` factory (`types.js:350`) → `new ConsumerOptsBuilderImpl()` → `this.config = defaultConsumer("", {})`
(`jsapi_types.js:131`), which defaults:

```js
{ deliver_policy: DeliverPolicy.All, ack_policy: AckPolicy.Explicit, ack_wait: nanos(30000), replay_policy: ReplayPolicy.Instant }
```

and `ConsumerOptsBuilderImpl` defaults `mack = false`, `ordered = false` (`types.js:139`).

Builder methods used by this fix:
- `ackExplicit()` → `this.config.ack_policy = AckPolicy.Explicit` (`types.js:237`).
- `manualAck()` → `this.mack = true` (`types.js:294`), disabling library auto-ack so the service's
  explicit `msg.ack()` / `msg.nak()` logic (`handleMessage`) is authoritative.

### Public import availability (verified in `node_modules/nats`)

- Root types entry: `lib/src/mod.d.ts` → re-exports `../jetstream/mod`.
- `jetstream/mod.d.ts` publicly exports: `consumerOpts` (value) and `AckPolicy` (enum value+type).
- `isConsumerOptsBuilder` is **NOT** publicly exported (only declared in `./types`). We must not import it from `'nats'`; we replicate its duck-typing locally.

## 2. High-level approach

1. In `src/consumer/subscribe-options.interface.ts`, add:
   - A local duck-type guard `isConsumerOptsBuilder(value): value is ConsumerOptsBuilder` using `typeof value.getOpts === 'function'`.
   - A factory `createDefaultConsumerOpts(): ConsumerOptsBuilder` returning `consumerOpts().manualAck().ackExplicit()`.
   - A normalizer `resolveConsumerSubscribeOpts(opts?: ConsumerSubscribeOpts): ConsumerSubscribeOpts` that:
     - returns `createDefaultConsumerOpts()` when `opts === undefined`;
     - returns the builder as-is when `opts` is a `ConsumerOptsBuilder`;
     - returns a shallow-cloned `Partial<ConsumerOpts>` with `config.ack_policy` defaulted to `AckPolicy.Explicit` when `opts` is a plain object (prevents the same crash if a caller passes `{}` or `{ config: {} }` explicitly).
2. In `src/consumer/jetstream-consumer.service.ts`, replace the `?? {}` fallback with `resolveConsumerSubscribeOpts(options.consumerOpts)`.
3. Update the existing `subscribe` unit test that asserts `subscribe` is called with `{}`, and add tests for: (a) undefined opts → default builder with `ack_policy === AckPolicy.Explicit` and `mack === true`; (b) caller-provided builder → passed through unchanged; (c) plain `Partial<ConsumerOpts>` → normalized with `config.ack_policy === AckPolicy.Explicit`.
4. Verify with typecheck, lint, and the jest spec.

## 3. Detailed steps

### 3.1. `src/consumer/subscribe-options.interface.ts`

**Current imports (line 1):**
```ts
import { JsMsg, ConsumerOptsBuilder, ConsumerOpts } from 'nats';
```

**Replace with** (add `consumerOpts` value import and `AckPolicy` enum import):
```ts
import { AckPolicy, consumerOpts, ConsumerOptsBuilder, ConsumerOpts, JsMsg } from 'nats';
```

**Add a named constant** (avoid magic value) immediately after the imports / before `ConsumerSubscribeOpts`:

```ts
/** Default ack policy applied when a caller omits consumer options. */
const DEFAULT_ACK_POLICY = AckPolicy.Explicit;
```

**Update the `ConsumerSubscribeOpts` type doc** to note that plain `Partial<ConsumerOpts>` objects are normalized to guarantee `config.ack_policy`.

**Add the following helpers** (each ≤ 2 params, ≤ 2 nesting levels):

```ts
/** Returns true when the value is a NATS ConsumerOptsBuilder (duck-typed via `getOpts`). */
export function isConsumerOptsBuilder(value: unknown): value is ConsumerOptsBuilder {
  return typeof (value as { getOpts?: unknown })?.getOpts === 'function';
}

/** Builds the default JetStream consumer options used when none are provided. */
export function createDefaultConsumerOpts(): ConsumerOptsBuilder {
  return consumerOpts().manualAck().ackExplicit();
}

/** Resolves caller consumer options so `ack_policy` is always set, preventing the NATS `ack_policy` undefined crash. */
export function resolveConsumerSubscribeOpts(opts?: ConsumerSubscribeOpts): ConsumerSubscribeOpts {
  if (opts === undefined) {
    return createDefaultConsumerOpts();
  }
  if (isConsumerOptsBuilder(opts)) {
    return opts;
  }
  return ensureValidConsumerConfig(opts);
}
```

**Add the non-exported normalizer** (module-private, single nesting level):

```ts
/** Defaults `config.ack_policy` to `AckPolicy.Explicit` for a plain `Partial<ConsumerOpts>` value. */
function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
  const config = { ack_policy: DEFAULT_ACK_POLICY, ...opts.config };
  return { ...opts, config };
}
```

**Rationale / self-documenting notes:**
- `ensureValidConsumerConfig` is intentionally not exported (prefer-private-members rule).
- Spread order `{ ack_policy: DEFAULT_ACK_POLICY, ...opts.config }` lets a caller-supplied `ack_policy` override the default while still guaranteeing one exists when omitted.

### 3.2. `src/consumer/jetstream-consumer.service.ts`

**Current import block (lines 12–18):**
```ts
import {
  SubscribeOptions,
  defaultDlqSubjectBuilder,
  envelopeToContext,
  ValidationErrorOptions,
  ErrorHandlingOptions,
} from './subscribe-options.interface';
```

**Add `resolveConsumerSubscribeOpts`** to the named imports:
```ts
import {
  SubscribeOptions,
  defaultDlqSubjectBuilder,
  envelopeToContext,
  resolveConsumerSubscribeOpts,
  ValidationErrorOptions,
  ErrorHandlingOptions,
} from './subscribe-options.interface';
```

**Replace `subscribe()` body line 65:**

Before:
```ts
const subscription = await this.jetStream.subscribe(options.subject, options.consumerOpts ?? {});
```

After:
```ts
const consumerOpts = resolveConsumerSubscribeOpts(options.consumerOpts);
const subscription = await this.jetStream.subscribe(options.subject, consumerOpts);
```

**No other code paths in this file change.** `handleMessage`'s explicit `msg.ack()` / `msg.nak()` logic remains authoritative because `createDefaultConsumerOpts()` enables `manualAck()`.

### 3.3. `src/consumer/jetstream-consumer.service.spec.ts`

**Current imports (line 2):**
```ts
import { JsMsg } from 'nats';
```

**Replace with:**
```ts
import { AckPolicy, consumerOpts, ConsumerOpts, ConsumerOptsBuilder, JsMsg } from 'nats';
```

**Update the existing `describe('subscribe', ...)` test (lines 304–315).**

Before:
```ts
it('should register handler and create JetStream subscription', async () => {
  const handler = jest.fn().mockResolvedValue(undefined);
  const asyncIterable = (async function* () {})();
  jetStream.subscribe.mockResolvedValue(asyncIterable);

  await service.subscribe({ subject: testSubject, handler });

  expect(consumerService.getHandler(testSubject)).toBe(handler);
  expect(jetStream.subscribe).toHaveBeenCalledWith(testSubject, {});
});
```

After:
```ts
it('should register handler and create JetStream subscription with default consumer opts', async () => {
  const handler = jest.fn().mockResolvedValue(undefined);
  const asyncIterable = (async function* () {})();
  jetStream.subscribe.mockResolvedValue(asyncIterable);

  await service.subscribe({ subject: testSubject, handler });

  expect(consumerService.getHandler(testSubject)).toBe(handler);
  expect(jetStream.subscribe).toHaveBeenCalledTimes(1);
  const [subjectArg, optsArg] = jetStream.subscribe.mock.calls[0];
  expect(subjectArg).toBe(testSubject);
  expect(typeof (optsArg as ConsumerOptsBuilder).getOpts).toBe('function');
  const resolved = (optsArg as ConsumerOptsBuilder).getOpts();
  expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
  expect(resolved.mack).toBe(true);
});
```

**Add new tests** inside the `describe('subscribe', ...)` block, after the updated test:

```ts
it('should pass a caller-provided ConsumerOptsBuilder through unchanged', async () => {
  const handler = jest.fn().mockResolvedValue(undefined);
  const asyncIterable = (async function* () {})();
  jetStream.subscribe.mockResolvedValue(asyncIterable);
  const builder = consumerOpts().durable('my-durable').deliverTo('company.deliver.subject').ackExplicit();

  await service.subscribe({ subject: testSubject, handler, consumerOpts: builder });

  expect(jetStream.subscribe).toHaveBeenCalledWith(testSubject, builder);
});

it('should default ack_policy to Explicit for a plain empty consumerOpts object', async () => {
  const handler = jest.fn().mockResolvedValue(undefined);
  const asyncIterable = (async function* () {})();
  jetStream.subscribe.mockResolvedValue(asyncIterable);

  await service.subscribe({ subject: testSubject, handler, consumerOpts: {} as Partial<ConsumerOpts> });

  const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, Partial<ConsumerOpts>];
  expect(optsArg.config?.ack_policy).toBe(AckPolicy.Explicit);
});

it('should preserve caller config but default ack_policy when missing in a plain consumerOpts object', async () => {
  const handler = jest.fn().mockResolvedValue(undefined);
  const asyncIterable = (async function* () {})();
  jetStream.subscribe.mockResolvedValue(asyncIterable);

  await service.subscribe({ subject: testSubject, handler, consumerOpts: { config: { durable_name: 'd' } } });

  const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, Partial<ConsumerOpts>];
  expect(optsArg.config?.ack_policy).toBe(AckPolicy.Explicit);
  expect(optsArg.config?.durable_name).toBe('d');
});

it('should preserve a caller-supplied ack_policy in a plain consumerOpts object', async () => {
  const handler = jest.fn().mockResolvedValue(undefined);
  const asyncIterable = (async function* () {})();
  jetStream.subscribe.mockResolvedValue(asyncIterable);

  await service.subscribe({ subject: testSubject, handler, consumerOpts: { config: { ack_policy: AckPolicy.All } } });

  const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, Partial<ConsumerOpts>];
  expect(optsArg.config?.ack_policy).toBe(AckPolicy.All);
});
```

> Note: `jetStream.subscribe` is mocked (`jest.fn()`), so it never invokes real NATS `_processOptions`. Tests therefore assert the *arguments* passed, which is the behavior under fix.

## 4. Rules-compliance review

- **max-arguments-per-method:** All new functions have ≤ 2 params. ✔
- **max-depth:** Every new function body stays within 2 nesting levels. ✔
- **max-lines-per-method:** Every new function is < 10 lines. ✔
- **max-lines-per-file:** `subscribe-options.interface.ts` grows ~30 lines (62 → ~92, under 200). Service file ~+2 lines. Spec grows but is not under the 200-line `src/` rule (spec files are test files; still kept reasonable). ✔
- **single-section-boolean-conditions:** `isConsumerOptsBuilder` returns a single `typeof ... === 'function'` comparison. `resolveConsumerSubscribeOpts` has no multi-section `if` conditions. ✔
- **prefer-private-members:** `ensureValidConsumerConfig` is module-private (not exported); only the necessary public helpers are exported. ✔
- **no-commented-code / self-documenting-code:** Names are descriptive; minimal doc comments for public API only. ✔
- **avoid-magic-numbers:** No magic numbers; `DEFAULT_ACK_POLICY` named constant replaces the inline enum value. ✔
- **security / error-handling / edge-cases:** The fix specifically handles the edge cases `undefined`, builder, plain `{}`, and plain `{ config: {...} }` with missing `ack_policy`. ✔

## 5. Build / test / lint verification (console commands)

Run sequentially (single commands, not chained — per `tool-selection-priority.md`):

1. `npm run typecheck`
2. `npm run lint`
3. `npm test -- jetstream-consumer.service.spec`  (focused)
4. `npm test`  (full suite)
5. `npm run build`

A command is considered passing only when it exits 0. If any fails, stop and report the failure before continuing.

## 6. Git actions (performed by implementer in step 4.2)

- Stage only the three changed files:
  - `src/consumer/subscribe-options.interface.ts`
  - `src/consumer/jetstream-consumer.service.ts`
  - `src/consumer/jetstream-consumer.service.spec.ts`
- Before committing, run `git status` and ensure no `.gitignore`-matching files are staged (gitignore-compliance rule).
- Suggested commit message (follows existing repo style):
  `fix(consumer): default JetStream consumer ack_policy to Explicit via consumerOpts builder`

No git commands are run during this planning step (4.1).

## 7. Code review + simplification (deferred to step 4.3)

After implementation, the code-reviewer and code-simplifier sub-agents will verify:
- Implementation matches this plan exactly.
- No deviation in helper signatures or default values.
- No remaining `?? {}` or literal `{}` passed to `jetStream.subscribe` within `JetStreamConsumerService`.

## 8. Documentation (deferred to step 4.4)

Docs specialist should:
- Add a short note to consumer docs (if any exists under `docs/`) describing that `JetStreamConsumerService.subscribe()` defaults to a `ConsumerOptsBuilder` with `AckPolicy.Explicit` + `manualAck(true)` when `consumerOpts` is omitted.
- Keep changes scoped; do not document the out-of-sscope item below unless it is also accepted.

## 9. Ambiguity / Out-of-scope flag (requires caller decision)

The root-cause analysis in the TODO and the runtime evidence (logged subject `company.*.response.v1`) point to a **second, identical bug** not listed in the assigned files:

- `src/consumer/request-reply-consumer.service.ts:92`:
  ```ts
  const subscription = await this.jetStream.subscribe(subject, {});
  ```
  This passes a literal `{}` (no `??`, always) and triggers the same `ack_policy` crash. `RequestReplyConsumerService.onModuleInit()` calls `subscribe(this.responseSubjectPattern)` (default `company.*.response.v1`) on module init, which matches the reported error subject exactly.

This file is **outside** the assignment scope (files to analyze listed only `jetstream-consumer.service.ts` line 65, `subscribe-options.interface.ts`, and the spec). Per instructions, I am not making assumptions and am not expanding scope without approval.

**Recommended (not executed in this plan):** Apply the same `resolveConsumerSubscribeOpts(...)` normalization to `RequestReplyConsumerService.subscribe()` (replacing `this.jetStream.subscribe(subject, {})` with `this.jetStream.subscribe(subject, resolveConsumerSubscribeOpts())`), import the helper, and add a corresponding unit test. This should be confirmed by the caller and may belong to the same task or a new TODO sub-item.

## 10. Verification of plan vs. original task

- TODO sub-item: "Update `JetStreamConsumerService.subscribe()` to build proper consumer options using NATS `ConsumerOptsBuilder`" → covered by step 3.2 + `createDefaultConsumerOpts()` factory.
- TODO sub-item: "Ensure `ack_policy` is always set (default to `AckPolicy.Explicit`)" → covered by `ackExplicit()` default + `ensureValidConsumerConfig` fallback (`DEFAULT_ACK_POLICY = AckPolicy.Explicit`).
- Acceptance criterion: "All existing library tests pass" → step 5.4 runs the full suite; the one updated assertion removes the stale `toHaveBeenCalledWith(testSubject, {})` expectation.
- Acceptance criterion: "New end-to-end test passes and is added to CI" → **out of scope** for Task 1; the e2e test is a separate TODO task ("Add end-to-end integration test"). This plan only adds/modifies unit tests for Task 1.