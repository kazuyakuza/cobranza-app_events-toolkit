# Plan: Task 1 — Fix `createDefaultConsumerOpts` missing `deliverTo` for push consumers

- **TODO file:** `.agent/todos/20260716/20260716-todo-0.md`
- **Scope:** Task 1 ONLY (`Update subscribe-options.interface.ts`). Tasks 2, 3, 4 are handled in separate workflow cycles.
- **Date:** 2026-07-16

## 1. Problem

`src/consumer/subscribe-options.interface.ts` builds default JetStream consumer options as a **push consumer** via `jetStream.subscribe()`, but does not set `deliver_subject`. NATS 2.29.3 validates:

```js
if (!cso.isBind && !cso.config.deliver_subject) {
    throw new Error("push consumer requires deliver_subject");
}
```

Result: `ms-db-gateway` fails to start (`Error: push consumer requires deliver_subject`) when `RequestReplyConsumerService` or `JetStreamConsumerService` subscribes without caller-provided `consumerOpts`.

## 2. Root Cause

`createDefaultConsumerOpts()` returns:

```typescript
return consumerOpts().manualAck().ackExplicit();
```

No `deliverTo(...)` is chained, so `config.deliver_subject` stays `undefined`.

## 3. Verification of Native APIs (from `node_modules/nats/lib`)

- `createInbox` is exported from the top-level `nats` package:
  - `nats-base-client/mod.d.ts` re-exports `createInbox`.
  - Signature: `export declare function createInbox(prefix?: string): string;` (`core.d.ts:930`).
- `ConsumerOptsBuilder.deliverTo(subject: string): this;` exists:
  - `jetstream/types.d.ts:412` and `jsapi_types.d.ts:1418`.
- Chain return type: each builder method returns `this` (a `ConsumerOptsBuilder`), so appending `.deliverTo(createInbox())` keeps the existing `ConsumerOptsBuilder` return type — no signature change needed.

## 4. Callers of the changed function (impact analysis)

- `src/consumer/request-reply-consumer.service.ts:93`
  `await this.jetStream.subscribe(subject, resolveConsumerSubscribeOpts())`
  → No caller `consumerOpts` passed → hits the `opts === undefined` branch → receives the new default with `deliver_subject` set. Fix applies here directly.
- `src/consumer/jetstream-consumer.service.ts:57`
  `const consumerOpts = resolveConsumerSubscribeOpts(options.consumerOpts);`
  → When `options.consumerOpts` is undefined → uses new default (fixed). When a builder is supplied (e.g. spec at `jetstream-consumer.service.spec.ts:290` already chains `.deliverTo('company.deliver.subject')`), `resolveConsumerSubscribeOpts` returns it unchanged — preserves caller `deliverTo`. This is Task 2 territory; **no change in Task 1**.

## 5. High-Level Approach

Apply the exact modification prescribed by TODO Task 1: add `createInbox` to the `nats` import and chain `.deliverTo(createInbox())` onto the default builder. This guarantees a unique inbox as `deliver_subject` for every default push consumer. No other source file is touched in this task.

## 6. Detailed Steps

### Step 6.1 — Edit `src/consumer/subscribe-options.interface.ts`

**6.1.1 — Update the `nats` import (line 1).**

Old:

```typescript
import { AckPolicy, consumerOpts, ConsumerOptsBuilder, ConsumerOpts, JsMsg } from 'nats';
```

New:

```typescript
import { AckPolicy, consumerOpts, ConsumerOptsBuilder, ConsumerOpts, createInbox, JsMsg } from 'nats';
```

Placement convention: alphabetical order within the named-import list (`ConsumerOptsBuilder`, `ConsumerOpts`, `createInbox`, `JsMsg`) — `createInbox` is inserted between `ConsumerOpts` and `JsMsg` to keep it sorted.

**6.1.2 — Modify `createDefaultConsumerOpts` (lines 19–22).**

Old:

```typescript
/** Builds the default JetStream consumer options used when none are provided. */
export function createDefaultConsumerOpts(): ConsumerOptsBuilder {
  return consumerOpts().manualAck().ackExplicit();
}
```

New:

```typescript
/** Builds the default JetStream consumer options used when none are provided.
 * Chains `.deliverTo(createInbox())` so the push consumer gets a unique `deliver_subject`,
 * required by NATS 2.29.3 `jetStream.subscribe()` (`push consumer requires deliver_subject`). */
export function createDefaultConsumerOpts(): ConsumerOptsBuilder {
  return consumerOpts().manualAck().ackExplicit().deliverTo(createInbox());
}
```

**No other lines in this file change.** Return type stays `ConsumerOptsBuilder` because `deliverTo` returns `this`. `DEFAULT_ACK_POLICY`, `ensureValidConsumerConfig`, `resolveConsumerSubscribeOpts`, and the interface/type declarations remain untouched (Task 1 does not modify `resolveConsumerSubscribeOpts`).

### Step 6.2 — No new files

No new files are created in Task 1. Tests (Task 3) and docs/changelog (Task 4) are separate workflow cycles.

### Step 6.3 — Terminal commands (build/typecheck verification)

Run after the edit (single commands, not chained):

```bash
npm run build
```

```bash
npm run typecheck
```

Expected: both succeed. No new type errors because `deliverTo(createInbox())` is type `ConsumerOptsBuilder` and `createInbox` is a valid named export of `nats`.

### Step 6.4 — Existing tests sanity check

```bash
npm test -- --testPathPattern=subscribe-options|jetstream-consumer
```

Rationale: confirm no regression in suites touching the modified symbol. Task 3 will add dedicated unit tests for `deliver_subject` presence; that is out of scope here. Do **not** modify existing specs in this task.

### Step 6.5 — Git actions

```bash
git add src/consumer/subscribe-options.interface.ts
```

```bash
git status
```

Verify only `src/consumer/subscribe-options.interface.ts` is staged and no `node_modules/` or other gitignored artifacts are present (per gitignore-compliance rule).

```bash
git commit -m "fix(consumer): set deliver_subject on default push consumer options"
```

Commit message describes the fix: default consumer options now chain `.deliverTo(createInbox())`, preventing the NATS `push consumer requires deliver_subject` error on `jetStream.subscribe()`.

### Step 6.6 — Verification checkpoint (for step 4.5 verification cycle later)

After Step 6.1, confirm via reading the file:
- Line 1 import list contains `createInbox`.
- `createDefaultConsumerOpts` body ends with `.deliverTo(createInbox())`.
- No other function signatures changed.
- File still respects project rules (max-lines ≤200, no commented-out code, single-section conditions unaffected, ≤2 params per method, private-by-default — all unchanged).

## 7. Edge Cases Considered

- **`createInbox` already imported?** No — current line 1 imports only `AckPolicy, consumerOpts, ConsumerOptsBuilder, ConsumerOpts, JsMsg`. Safe to add.
- **Name collision with a local `createInbox`?** None exists in `src/consumer` (grep found only the nats usage pattern). Safe.
- **Return type regression?** `deliverTo` returns `this` (typed `ConsumerOptsBuilder`); no callers depend on the absence of `deliver_subject`. Existing spec at `jetstream-consumer.service.spec.ts:290` already supplies its own `deliverTo` for caller-provided builders and is unaffected.
- **`resolveConsumerSubscribeOpts` behavior re existing `deliverTo`:** unchanged by this task. Builder path returns `opts` as-is (preserves caller `deliver_subject`); plain-object path merges `config` but does not inject `deliver_subject` (that is Task 2’s scope). Task 1 only ensures the `undefined`-opts path now produces a valid `deliver_subject`.

## 8. Out of Scope (handled in other workflow cycles)

- Task 2: `resolveConsumerSubscribeOpts` plain-object `deliver_subject` defaulting/preservation logic.
- Task 3: unit tests for `deliver_subject` presence in default and resolved opts.
- Task 4: changelog and documentation updates.

## 9. Acceptance Criteria for Task 1

- [ ] `createInbox` added to `nats` import in `src/consumer/subscribe-options.interface.ts`.
- [ ] `createDefaultConsumerOpts()` chains `.deliverTo(createInbox())`.
- [ ] `npm run build` succeeds.
- [ ] `npm run typecheck` succeeds.
- [ ] Existing tests touching the symbol do not regress.
- [ ] Single commit with described message, only the target file staged.