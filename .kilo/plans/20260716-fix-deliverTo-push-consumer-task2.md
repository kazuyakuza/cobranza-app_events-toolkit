# Plan — Task 2: Update `resolveConsumerSubscribeOpts` to default `deliver_subject` for plain objects

> TODO: `.agent/todos/20260716/20260716-todo-0.md` — Task 2 (Task 1 `[DONE]`)
> Step: 4.1 Analysis & Planning (Architector)
> Date: 2026-07-16
> Scope boundary: targeted code change in `src/consumer/subscribe-options.interface.ts` only. Tests/Docs are separate TODO tasks (3 & 4) and are NOT implemented here.

## 1. Task Restatement

`resolveConsumerSubscribeOpts(opts?)` handles three input shapes:

| # | Input shape | Current behavior | `deliver_subject` after Task 1? |
|---|-------------|------------------|--------------------------------|
| 1 | `undefined` | `return createDefaultConsumerOpts()` | ✅ Task 1 added `.deliverTo(createInbox())` |
| 2 | `ConsumerOptsBuilder` (duck-typed via `getOpts()`) | returned as-is | caller-controlled (existing contract) |
| 3 | plain `Partial<ConsumerOpts>` | `ensureValidConsumerConfig(opts)` only defaults `ack_policy` | ❌ missing → NATS 2.29.3 throws `push consumer requires deliver_subject` |

Goal of Task 2: in the plain-object path (case 3), **preserve** a caller-supplied `config.deliver_subject` when present, and **default** it to a unique inbox (`createInbox()`) when absent — mirroring the fix already applied in case 1.

## 2. Root Cause (confirmed by reading current file)

File: `src/consumer/subscribe-options.interface.ts` (104 lines, post-Task-1).

```ts
// line 36-44
export function resolveConsumerSubscribeOpts(opts?: ConsumerSubscribeOpts): ConsumerSubscribeOpts {
  if (opts === undefined) {
    return createDefaultConsumerOpts();
  }
  if (isConsumerOptsBuilder(opts)) {
    return opts;
  }
  return ensureValidConsumerConfig(opts);
}

// line 46-50
function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
  const config = { ack_policy: DEFAULT_ACK_POLICY, ...opts.config };
  return { ...opts, config };
}
```

`ensureValidConsumerConfig` spreads `opts.config` *after* `DEFAULT_ACK_POLICY`, so a caller-supplied `ack_policy` is preserved (and an explicitly-`undefined` `ack_policy` would clobber the default — a latent edge not addressed here, out of scope). `deliver_subject` is never touched, so plain-objects always reach `jetStream.subscribe()` without `deliver_subject` and crash with the NATS 2.29.3 guard:

```js
// node_modules/nats/lib/jetstream/jsclient.ts (paraphrased in TODO)
if (!cso.isBind && !cso.config.deliver_subject) {
  throw new Error("push consumer requires deliver_subject");
}
```

## 3. Design Decisions

### 3.1 Where to apply the fix: `ensureValidConsumerConfig` (NOT `resolveConsumerSubscribeOpts`)

- `resolveConsumerSubscribeOpts` is the **dispatcher**; it selects among the three input shapes.
- `ensureValidConsumerConfig` is the **normalizer** for plain `Partial<ConsumerOpts>` and already owns the "make a plain object safe for subscribe" responsibility (it already defaults `ack_policy`).
- Cohesion: placing `deliver_subject` defaulting alongside `ack_policy` defaulting keeps a single source of truth for plain-object normalization and avoids branching in the dispatcher.

**Decision:** implement inside `ensureValidConsumerConfig`.

### 3.2 Defaulting strategy: conditional, not spread (correctness)

A naive `{ ack_policy, deliver_subject: createInbox(), ...opts.config }` would let an explicit `opts.config.deliver_subject = undefined` clobber the default — same latent bug as the current `ack_policy` handling. To strictly honor **"preserve when set, default when not"**, set each field conditionally on `=== undefined`.

```ts
function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
  const config = { ...opts.config };
  applyDefaultAckPolicy(config);
  applyDefaultDeliverSubject(config);
  return { ...opts, config };
}
```

Extracting `applyDefault*` private helpers keeps method body short (max-lines-per-method rule) and indentation ≤ 2 (max-depth rule). Both helpers take a single `config` param (max-2-params rule). Each `if (config.x === undefined)` is a single-section boolean condition.

### 3.3 Builder case (case 2): intentionally left as-is

Per Task-1 JSDoc comment already in the file ("{@link ConsumerOptsBuilder} → returned as-is (caller is responsible for `deliverTo`)") and the existing test `jetstream-consumer.service.spec.ts:290` where builders are created *with* `.deliverTo(...)`, the contract is: callers passing a `ConsumerOptsBuilder` own the `deliverTo` decision. Mutating an already-built `ConsumerOptsBuilderImpl` to inject `deliverTo` risks altering bound-durable semantics and exceeds the TODO's stated scope ("caller-provided `consumerOpts` already has `deliverTo` set, preserve it" — implies the caller set it). **Decision: leave case 2 unchanged.**

### 3.4 Bind edge case (documented, not auto-handled)

If a caller intends a **bound durable** (subscribe to an existing durable without a new `deliver_subject`), the NATS check is skipped only when `cso.isBind` is true. A plain `Partial<ConsumerOpts>` cannot easily express `isBind`; the toolkit's plain-object path is exclusively for push consumers. Our conditional default (`deliver_subject === undefined` → `createInbox()`) is safe: it only fires when the caller omitted it, which is exactly the push-consumer scenario. Callers needing a bound durable must use a `ConsumerOptsBuilder` (case 2) and call `.bind()` themselves. This matches the existing module contract. **No code is added to detect bind.**

## 4. Concrete Code Changes

### 4.1 File: `src/consumer/subscribe-options.interface.ts`

#### 4.1.1 Add `DEFAULT_DELIVER_SUBJECT` semantics via `createInbox` (already imported)

Reuse the already-imported `createInbox` from line 1. No new import needed (the file already imports `createInbox` from `'nats'` since Task 1).

#### 4.1.2 Rewrite `ensureValidConsumerConfig` and add two private helpers

Replace the current `ensureValidConsumerConfig` (lines 46-50) with:

```ts
/** Normalizes a plain {@link ConsumerOpts} so it is safe for `jetStream.subscribe()`.
 * Defaults `config.ack_policy` and `config.deliver_subject` only when the caller
 * omitted them; explicitly-supplied values (including the push invariant
 * `deliver_subject`) are preserved verbatim. */
function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
  const config = { ...opts.config };
  applyDefaultAckPolicy(config);
  applyDefaultDeliverSubject(config);
  return { ...opts, config };
}

/** Sets {@link DEFAULT_ACK_POLICY} when the caller did not supply an ack policy. */
function applyDefaultAckPolicy(config: Partial<ConsumerConfig>): void {
  if (config.ack_policy === undefined) {
    config.ack_policy = DEFAULT_ACK_POLICY;
  }
}

/** Sets a unique `deliver_subject` (via {@link createInbox}) when the caller did not
 * supply one, satisfying the NATS 2.29.3 `push consumer requires deliver_subject`
 * guard for non-bound push consumers. */
function applyDefaultDeliverSubject(config: Partial<ConsumerConfig>): void {
  if (config.deliver_subject === undefined) {
    config.deliver_subject = createInbox();
  }
}
```

#### 4.1.3 Add `ConsumerConfig` import

`applyDefaultAckPolicy` / `applyDefaultDeliverSubject` parameter types need `ConsumerConfig` (the type of `ConsumerOpts.config`). Add it to the existing `nats` import on line 1:

```ts
import {
  AckPolicy,
  ConsumerConfig,
  consumerOpts,
  ConsumerOptsBuilder,
  ConsumerOpts,
  createInbox,
  JsMsg,
} from 'nats';
```

> Verification step for implementer: confirm `ConsumerConfig` is exported by `nats` v2.29.x. Evidence (`rg "ConsumerConfig" node_modules/nats/lib/jetstream/types.d.ts`) was found via the earlier Bifrost search (interface `ConsumerOpts` at types.d.ts:357 references `ConsumerConfig`, and `jsapi_types.d.ts` defines `deliver_subject?: string`). If `ConsumerConfig` turns out not to be re-exported from the package root, fall back to typing the helpers' params as `Partial<{ ack_policy?: AckPolicy; deliver_subject?: string }>` instead — functionally equivalent and dependency-free. Prefer the typed `ConsumerConfig` if available.

#### 4.1.4 Update the JSDoc on `resolveConsumerSubscribeOpts`

Change the third bullet (lines 31-34 area) to reflect that `deliver_subject` is now defaulted too. New JSDoc:

```ts
/**
 * Normalizes caller-supplied consumer options into a value safe for `jetStream.subscribe()`.
 *
 * - `undefined` → returns {@link createDefaultConsumerOpts} (includes `deliverTo(createInbox())`).
 * - {@link ConsumerOptsBuilder} → returned as-is (caller is responsible for `deliverTo`).
 * - `Partial<ConsumerOpts>` → `config.ack_policy` and `config.deliver_subject` are defaulted
 *   (to {@link DEFAULT_ACK_POLICY} and a unique {@link createInbox}, respectively) when omitted;
 *   supplied values are preserved. This prevents the NATS `ack_policy` undefined crash and the
 *   `push consumer requires deliver_subject` error.
 */
```

## 5. Rules Compliance Check (self-audit before hand-off)

| Rule | Status |
|------|--------|
| max-lines-per-file (≤200) | File grows ~104 → ~140 lines. ✅ |
| max-lines-per-method (≤50 body) | `ensureValidConsumerConfig` body 4 lines; helpers 3-line bodies. ✅ |
| max-depth (≤2) | Only one level of nesting per helper. ✅ |
| max-2-params | All new functions single-param. ✅ |
| single-section-boolean-conditions | `config.x === undefined` single section. ✅ |
| no-commented-code | None added. ✅ |
| self-documenting-code | Names: `applyDefaultAckPolicy`, `applyDefaultDeliverSubject`, `ensureValidConsumerConfig`. ✅ |
| prefer-private-members | Helpers are module-private (no `export`). ✅ |
| newline-prevention | Real newlines only. ✅ |
| Preserve existing code | `createDefaultConsumerOpts`, `resolveConsumerSubscribeOpts` dispatcher, `isConsumerOptsBuilder`, DLQ/envelope helpers untouched. ✅ |

## 6. Git Actions (for implementer, step 4.2)

1. Confirm on feature branch `feat/fix-deliverto-push-consumer` (created in workflow step 2). `git branch --show-current`.
2. After edit: `git status` then stage only `src/consumer/subscribe-options.interface.ts`.
3. Commit message: `fix(consumer): default deliver_subject for plain consumer opts in resolveConsumerSubscribeOpts`.
   - Do NOT stage `node_modules/`, `dist/`, or anything matching `.gitignore` (gitignore-compliance rule).

## 7. Build / Typecheck / Lint (for implementer, step 4.2 — NOT part of this plan step)

- `npm run typecheck` (if script exists) or `npm run build` — must pass with new `ConsumerConfig` import.
- `npm run lint` — must pass.
- If lint fails on import ordering, reorder alphabetically per existing prettier/eslint config and re-run.
- No test execution in this step (tests are TODO Task 3).

## 8. Code Review Checklist (for 4.3 reviewer)

- [ ] Plain object *with* `config.deliver_subject` set arrives at subscribe unchanged.
- [ ] Plain object *without* `config.deliver_subject` arrives with a non-empty unique inbox string and `ack_policy === Explicit`.
- [ ] `undefined` still returns `createDefaultConsumerOpts()` (Task-1 behavior intact).
- [ ] Builder path returns the same instance reference, unmutated.
- [ ] No new exports leaked from the file beyond what callers already import.
- [ ] File remains ≤200 lines; all method bodies ≤50 lines.

## 9. Out of Scope (explicit non-goals for this task)

- Writing/updating unit tests for `subscribe-options.interface.ts` → **TODO Task 3** (will live in a new `subscribe-options.interface.spec.ts` or extend the existing `jetstream-consumer.service.spec.ts`).
- Updating CHANGELOG / docs → **TODO Task 4**.
- Changing case 2 (builder) behavior.
- Changing `createDefaultConsumerOpts()` (fixed in Task 1, marked `[DONE]`).

## 10. Verification Against Original TODO

TODO Task 2 text:
> "When caller-provided `consumerOpts` already has `deliverTo` set, preserve it. When not set, ensure the default includes it."

Mapping:
- "already has deliverTo set, preserve it" → `applyDefaultDeliverSubject` only writes when `deliver_subject === undefined`; supplied value passes through. ✅
- "When not set, ensure the default includes it" → `applyDefaultDeliverSubject` writes `createInbox()` when undefined. The "default includes it" for case 1 (`undefined` input) is already satisfied by Task 1's `createDefaultConsumerOpts()`. ✅
- Applies to plain-object path (the only path that can be missing `deliverTo` after Task 1). ✅

Plan is consistent with the TODO. No assumptions invented beyond the documented three-case dispatcher.