# Plan — Extend `EventsToolkitConsumerOptions` with Durable JetStream Consumer Support (TODO Task 1)

- **TODO file:** `.agent/todos/20260722/20260722-todo-1.md` (tasks 1–5)
- **Branch (to be created in step 2):** `feat/durable-jetstream-consumers`
- **Scope of THIS plan:** TODO tasks 1–5 (interface extension, option threading, durable resume behavior, type exports, unit tests). TODO task 6 (docs) is handled by the 4.4 docs-specialist step and is NOT implemented here; this plan only notes doc touchpoints.

---

## 1. High-Level Approach

The toolkit currently builds JetStream consumer options with a single fixed default:
`consumerOpts().manualAck().ackExplicit().deliverTo(createInbox())` inside
`resolveConsumerSubscribeOpts()` (`src/consumer/subscribe-options.interface.ts`).
This always produces an **ephemeral push consumer** with no `durable_name`, so on
reconnect NATS destroys the consumer and replays the whole stream (`DeliverPolicy.All`
default).

The fix exposes gateway-level consumer configuration on the public options interface
and threads it through the existing DI chain (`EventsToolkitModule` → `ConsumerModule`
→ deps interfaces → provider factories → `JetStreamConsumerService` /
`RequestReplyConsumerService`), then merges gateway-level config with per-subscription
config at `subscribe()` time.

### Core design decisions

1. **Two complementary config shapes on `EventsToolkitConsumerOptions`:**
   - Convenience scalars: `durableName`, `deliverPolicy`, `ackPolicy`, `maxDeliver`,
     `replayPolicy` (map 1:1 to `ConsumerConfig` fields).
   - A power-user `consumerOpts?: Partial<ConsumerOpts> | ConsumerOptsBuilder` field
     for full NATS-native control (mirrors the existing `streamConfig` pattern).
   Both are optional and independent; scalars override matching fields from
   `consumerOpts` when both are set.

2. **Internal threading via a single `GatewayConsumerOptions` object** (new file) to
   keep the ≤2-params rule and avoid expanding every factory signature with 5 new args.
   The root `EventsToolkitConsumerOptions` is *structurally assignable* to
   `GatewayConsumerOptions` (it has all the gateway fields plus unrelated extras), so
   `EventsToolkitModule` passes `options.consumer` straight through — no mapper needed.

3. **Merge utility in a new file** `src/consumer/consumer-opts-merger.ts` with
   `resolveSubscriptionConsumerOpts(gateway, perSubscription)`. Merge precedence
   (highest → lowest):
   1. Per-subscription `ConsumerOptsBuilder` → **full override** (returned unchanged;
      gateway is ignored). *Preserves existing test
      "should pass a caller-provided ConsumerOptsBuilder through unchanged".*
   2. Per-subscription `Partial<ConsumerOpts>` fields → override gateway.
   3. Gateway scalars (`durableName`, etc.) → override gateway `consumerOpts`.
   4. Gateway `consumerOpts` (builder extracted via `getOpts()`, or `Partial<ConsumerOpts>`).
   5. Built-in defaults (`manualAck`, `ackExplicit`, unique `deliverTo(createInbox())`)
      applied last by delegating to the existing `resolveConsumerSubscribeOpts()`
      normalization (which calls `ensureValidConsumerConfig`).

4. **Durable resume is handled server-side by NATS** (no client-side position store).
   The only client responsibility is to pass the *same* `durable_name` on every
   `jetStream.subscribe()` call. NATS persists the last acked position; on an update of
   an existing durable the server resumes from that position and ignores a changed
   `deliver_policy` (so omitting `deliverPolicy` when `durableName` is set is safe and
   uses the durable's stored state, per TODO task 3). The default
   `deliverTo(createInbox())` stays — NATS accepts an updated `deliver_subject` on a
   bound durable; consumers wanting a strictly stable deliver subject can set
   `consumerOpts.deliverTo(...)`. **No change to `deliverTo` default behavior** keeps
   scope tight and existing tests green.

5. **[`RequestReplyConsumerService.subscribe`] gains an optional 2nd param**
   `consumerOpts?: ConsumerSubscribeOpts` so the gateway/per-sub merge works uniformly
   for both services. `onModuleInit()` calls it with no per-sub opts (gateway-only),
   preserving current behavior.

6. **No commenting-out, no magic numbers** (NATS enums used directly), private members
   by default, single-section boolean conditions, ≤2 indentation levels, ≤2 params.

### nats API used (confirmed via Context7 /nats-io/nats.js — version `^2.29.3` still ships `consumerOpts()` + `ConsumerOptsBuilder`)

- `ConsumerOpts` = `{ config: Partial<ConsumerConfig>; mack: boolean; stream: string; ... }`.
- `ConsumerOptsBuilder.getOpts(): ConsumerOpts` (already used by `isConsumerOptsBuilder`).
- Enums: `DeliverPolicy` (`All|New|Last|LastPerSubject|StartSequence|StartTime`),
  `AckPolicy` (`None|All|Explicit|FlowControl`), `ReplayPolicy` (`Instant|Original`).
- `ConsumerConfig` fields targeted: `durable_name`, `deliver_policy`, `ack_policy`,
  `max_deliver`, `replay_policy`.

> Note: nats.js `migration.md` flags `consumerOpts()`/`ConsumerOptsBuilder` as removed
> in a *future* major version. The pinned `^2.29.3` still exports them, and the
> existing code already depends on them — this plan stays on the same API surface.

---

## 2. Detailed Steps

### Step 0 — Branch & version (executed by step 2/3 of Critical Workflow, not here)
- Branch `feat/durable-jetstream-consumers` from `main`.
- Bump `package.json` patch → `0.14.1` (consumer feature addition; could be minor
  `0.15.0` — recommend minor since public API gains new optional export surface).
  Decision for implementer: **minor → `0.15.0`** (new public options + new exported
  `GatewayConsumerOptions`/`resolveSubscriptionConsumerOpts`).

### Step 1 — New file: `src/consumer/gateway-consumer-options.interface.ts`
Encapsulates the gateway-level consumer fields shared by `ConsumerModuleOptions`,
the deps interfaces, and the merger. Keep it in its own file to respect file-size limits
and separation of concerns.

```ts
import { AckPolicy, ConsumerOpts, ConsumerOptsBuilder, DeliverPolicy, ReplayPolicy } from 'nats';
import { ConsumerSubscribeOpts } from './subscribe-options.interface';

/**
 * Gateway-level JetStream consumer configuration threaded from
 * {@link EventsToolkitConsumerOptions} through the consumer DI chain and merged
 * with per-subscription options in {@link resolveSubscriptionConsumerOpts}.
 *
 * Convenience scalars (`durableName`, `deliverPolicy`, `ackPolicy`, `maxDeliver`,
 * `replayPolicy`) override matching fields from `consumerOpts` when both are set.
 */
export interface GatewayConsumerOptions {
  /** Full NATS-native consumer options (builder or partial config). */
  consumerOpts?: ConsumerSubscribeOpts;
  /** Durable consumer name — enables server-side position persistence and resume. */
  durableName?: string;
  /** Where to start consuming. Omit when `durableName` is set to use the durable's stored state. */
  deliverPolicy?: DeliverPolicy;
  /** Acknowledgment policy. Default `AckPolicy.Explicit` when omitted. */
  ackPolicy?: AckPolicy;
  /** Max delivery attempts before redelivery stops. Default server value when omitted. */
  maxDeliver?: number;
  /** Replay policy (Instant | Original). */
  replayPolicy?: ReplayPolicy;
}
```

Estimated lines: ~22. Exports: `GatewayConsumerOptions`.

### Step 2 — New file: `src/consumer/consumer-opts-merger.ts`
Pure merge utility. Reuses existing `isConsumerOptsBuilder`, `resolveConsumerSubscribeOpts`
(already exported from `subscribe-options.interface.ts`). Does NOT export
`ensureValidConsumerConfig` (kept private) — final normalization is delegated to
`resolveConsumerSubscribeOpts`.

```ts
import { ConsumerConfig } from 'nats';
import {
  ConsumerSubscribeOpts,
  isConsumerOptsBuilder,
  resolveConsumerSubscribeOpts,
} from './subscribe-options.interface';
import { GatewayConsumerOptions } from './gateway-consumer-options.interface';

/**
 * Merges gateway-level consumer options with per-subscription options.
 *
 * Precedence (highest first):
 * 1. Per-subscription `ConsumerOptsBuilder` → full override (returned unchanged).
 * 2. Per-subscription `Partial<ConsumerOpts>` → spreads over gateway config.
 * 3. Gateway scalars → override matching `consumerOpts` config fields.
 * 4. Gateway `consumerOpts` (builder extracted via `getOpts()` or `Partial<ConsumerOpts>`).
 * 5. Built-in defaults applied by {@link resolveConsumerSubscribeOpts}`.
 */
export function resolveSubscriptionConsumerOpts(
  gateway: GatewayConsumerOptions | undefined,
  perSubscription?: ConsumerSubscribeOpts,
): ConsumerSubscribeOpts {
  if (isConsumerOptsBuilder(perSubscription)) {
    return perSubscription;
  }
  const merged = buildMergedConsumerConfig(gateway, perSubscription);
  return resolveConsumerSubscribeOpts(merged);
}

function buildMergedConsumerConfig(
  gateway: GatewayConsumerOptions | undefined,
  perSubscription: ConsumerSubscribeOpts | undefined,
): Partial<import('nats').ConsumerOpts> {
  const base = extractConsumerConfig(gateway?.consumerOpts);
  const scalars = gatewayScalarsToConfig(gateway);
  const per = (perSubscription as Partial<import('nats').ConsumerOpts>) ?? {};
  return {
    config: { ...base.config, ...scalars, ...per.config },
    mack: per.mack ?? base.mack,
    stream: per.stream ?? base.stream,
  };
}

function extractConsumerConfig(opts: ConsumerSubscribeOpts | undefined): Partial<import('nats').ConsumerOpts> {
  if (!opts) {
    return {};
  }
  if (isConsumerOptsBuilder(opts)) {
    return opts.getOpts();
  }
  return opts;
}

function gatewayScalarsToConfig(gateway: GatewayConsumerOptions | undefined): Partial<ConsumerConfig> {
  const config: Partial<ConsumerConfig> = {};
  if (gateway?.durableName) config.durable_name = gateway.durableName;
  if (gateway?.deliverPolicy !== undefined) config.deliver_policy = gateway.deliverPolicy;
  if (gateway?.ackPolicy !== undefined) config.ack_policy = gateway.ackPolicy;
  if (gateway?.maxDeliver !== undefined) config.max_deliver = gateway.maxDeliver;
  if (gateway?.replayPolicy !== undefined) config.replay_policy = gateway.replayPolicy;
  return config;
}
```

Notes on constraints:
- `resolveSubscriptionConsumerOpts(gateway, perSubscription)` = 2 params. ✅
- Max nesting depth 2 (object spreads are single-level). ✅
- `ConsumerConfig`, `ConsumerOpts` imported from `nats` (use inline `import('nats').ConsumerOpts` only where needed; prefer a top-level `import type { ConsumerConfig, ConsumerOpts } from 'nats'`). Implementer: use top-level `import type` to keep imports clean.
- No magic numbers; no commented code; private (non-exported) helpers. ✅

Estimated lines: ~55 (well under 200).

### Step 3 — Update `events-toolkit-options.interface.ts`
File is 93 lines. Add nats imports and the new gateway fields to
`EventsToolkitConsumerOptions`. Keep coupling to `nats` only (NOT to
`consumer/gateway-consumer-options` — root stays decoupled from consumer internals).

- Line 1: extend the `nats` import:
  ```ts
  import { NatsConnection, StreamConfig, ConsumerOpts, ConsumerOptsBuilder, DeliverPolicy, AckPolicy, ReplayPolicy } from 'nats';
  ```
- Inside `EventsToolkitConsumerOptions` (after `streamConfig`), add fields with JSDoc
  noting the durable resume semantics + link to `docs/nats-jetstream-configuration.md`:

```ts
  /**
   * Full JetStream consumer options applied to every subscription. Accepts a NATS
   * `ConsumerOptsBuilder` (e.g. `consumerOpts().durable('x').deliverAll()`) or a plain
   * `Partial<ConsumerOpts>`. Convenience scalars below override matching fields here.
   */
  consumerOpts?: Partial<ConsumerOpts> | ConsumerOptsBuilder;
  /** Durable consumer name. When set, NATS persists the ack position and resumes on reconnect. */
  durableName?: string;
  /** Delivery policy. Omit when `durableName` is set to resume from the durable's stored state. */
  deliverPolicy?: DeliverPolicy;
  /** Acknowledgment policy. Default `AckPolicy.Explicit` when omitted. */
  ackPolicy?: AckPolicy;
  /** Max delivery attempts before redelivery stops. */
  maxDeliver?: number;
  /** Replay policy (Instant | Original). */
  replayPolicy?: ReplayPolicy;
```

Estimated new line total: ~101. No existing field removed. ✅ under 200.

### Step 4 — Update `src/consumer/consumer.module.ts`
File is 191 lines. Tight, but fits under 200 with the additions.

- Import `GatewayConsumerOptions`:
  ```ts
  import { GatewayConsumerOptions } from './gateway-consumer-options.interface';
  ```
- Add to `ConsumerModuleOptions` interface (after `streamConfig`):
  ```ts
  /** Gateway-level JetStream consumer options merged into every subscription. */
  gatewayConsumerOpts?: GatewayConsumerOptions;
  ```
- In `ConsumerModule.forRoot`, pass `gatewayConsumerOpts` into both sync deps providers:
  - `createSyncJetStreamConsumerDepsProvider({ ..., gatewayConsumerOpts: options.gatewayConsumerOpts })`
  - `createSyncRequestReplyConsumerDepsProvider({ ..., gatewayConsumerOpts: options.gatewayConsumerOpts })`

Estimated new total: ~196 lines. ✅ under 200 (verify after edit; if over, extract the
docstrings — they are the bulk of growth). Implementer: keep JSDoc terse here to stay safe.

### Step 5 — Update `src/consumer/sync-jetstream-consumer-deps-options.interface.ts` and `sync-request-reply-consumer-deps-options.interface.ts`
Add one field to each:

```ts
import { GatewayConsumerOptions } from './gateway-consumer-options.interface';
...
  /** Gateway-level JetStream consumer options merged into every subscription. */
  gatewayConsumerOpts?: GatewayConsumerOptions;
```

Each file grows by ~3 lines (still ~31 / ~33). ✅

### Step 6 — Update `src/consumer/jetstream-consumer-deps.interface.ts` and `request-reply-consumer-deps.interface.ts`
Add the same `gatewayConsumerOpts?: GatewayConsumerOptions;` field + import. Each grows ~3 lines
(37 / 44). ✅

### Step 7 — Update `src/consumer/consumer-module.providers.ts`
File is 188 lines.

- Import `GatewayConsumerOptions`.
- In `createSyncJetStreamConsumerDepsProvider` factory return: add
  `gatewayConsumerOpts: options.gatewayConsumerOpts,`.
- In `createSyncRequestReplyConsumerDepsProvider` factory return: add the same.
- In `createAsyncJetStreamConsumerDepsProvider` factory return: add
  `gatewayConsumerOpts: combined.moduleOptions.gatewayConsumerOpts,`.
- In `createAsyncRequestReplyConsumerDepsProvider` factory return: add the same.
- In `createAsyncResolvedConnectionProvider`: no change (it doesn't touch consumer opts).
  NOTE: the async path carries `moduleOptions` (full `ConsumerModuleOptions`) into the
  `JetStreamAsyncDeps`/`RequestReplyAsyncDeps` `combined` object, so `gatewayConsumerOpts`
  is already reachable via `combined.moduleOptions.gatewayConsumerOpts`. Confirm
  `JetStreamAsyncDeps`/`RequestReplyAsyncDeps` interfaces expose `moduleOptions:
  ConsumerModuleOptions` — they do (consumer.module.ts lines 53–63). ✅

Estimated new total: ~194 lines. ✅ under 200.

### Step 8 — Update `src/consumer/jetstream-consumer.service.ts`
File is 140 lines.

- Import the merger:
  ```ts
  import { resolveSubscriptionConsumerOpts } from './consumer-opts-merger';
  import { GatewayConsumerOptions } from './gateway-consumer-options.interface';
  ```
- Add a private field + constructor assignment:
  ```ts
  private readonly gatewayConsumerOpts?: GatewayConsumerOptions;
  ...
  this.gatewayConsumerOpts = deps.gatewayConsumerOpts;
  ```
- In `subscribe()`, replace:
  ```ts
  const consumerOpts = resolveConsumerSubscribeOpts(options.consumerOpts);
  ```
  with:
  ```ts
  const consumerOpts = resolveSubscriptionConsumerOpts(this.gatewayConsumerOpts, options.consumerOpts);
  ```
- Remove now-unused `resolveConsumerSubscribeOpts` import IF no longer referenced. Check:
  it is not used elsewhere in the file after the swap → remove it from the import list
  (keep `defaultDlqSubjectBuilder`, `SubscribeOptions`, etc. which are still used).

Estimated new total: ~144 lines. ✅ Method `subscribe` body stays ≤50 lines (it is currently ~8). ✅

### Step 9 — Update `src/consumer/request-reply-consumer.service.ts`
File is 128 lines.

- Imports: add `resolveSubscriptionConsumerOpts` from `./consumer-opts-merger`,
  `GatewayConsumerOptions` from `./gateway-consumer-options.interface`, and the
  `ConsumerSubscribeOpts` type from `./subscribe-options.interface` (for the new param).
- Constructor: store `this.gatewayConsumerOpts = deps.gatewayConsumerOpts;` and add the field.
- Change `subscribe` signature from `subscribe(subject: string)` to
  `subscribe(subject: string, consumerOpts?: ConsumerSubscribeOpts)` (2 params ✅).
- In `subscribe`, replace `resolveConsumerSubscribeOpts()` with
  `resolveSubscriptionConsumerOpts(this.gatewayConsumerOpts, consumerOpts)`.
- `onModuleInit()` keeps calling `this.subscribe(this.responseSubjectPattern)` (no per-sub
  opts → gateway-only merge → backward-compatible default behavior when no gateway config).
- Remove `resolveConsumerSubscribeOpts` from imports if now unused (it is). ✅

Estimated new total: ~135 lines. ✅

### Step 10 — Update `src/consumer/index.ts`
File is 43 lines. Add exports for the new public symbols:

```ts
export { GatewayConsumerOptions } from './gateway-consumer-options.interface';
export { resolveSubscriptionConsumerOpts } from './consumer-opts-merger';
```

Also re-export the nats enums used by the new public options so consumers can import them
from the toolkit barrel if desired (optional but improves DX; keep if under line budget):
```ts
export { DeliverPolicy, AckPolicy, ReplayPolicy } from 'nats';
```
(Re-exporting from `nats` is a passthrough; not strictly required — consumers can import
from `nats` directly. Decision: **do NOT re-export** to avoid a coupling/stability surface;
document in the docs step that enums are imported from `nats`.) So only the two exports
above are added. Estimated total: ~47 lines. ✅

### Step 11 — Type exports / public API (TODO task 4)
- `src/index.ts` already does `export * from './consumer';` and explicitly exports
  `EventsToolkitConsumerOptions`. No change needed — the new opts fields are part of the
  re-exported interface, and `GatewayConsumerOptions` flows through the consumer barrel.
  **Verification step:** after building, grep `dist/index.d.ts` for
  `durableName`, `GatewayConsumerOptions`, `resolveSubscriptionConsumerOpts` to confirm
  they appear in the public type surface.
- No `.d.ts` hand-editing required (generated from `src`).

### Step 12 — Update `src/events-toolkit.module.ts`
File is 185 lines. Threads the root `options.consumer` (which is structurally
`GatewayConsumerOptions`-compatible) into `ConsumerModuleOptions.gatewayConsumerOpts`.

- `buildSyncImports` (the `if (options.consumer?.enable !== false)` block): add
  `gatewayConsumerOpts: options.consumer,` to the `consumerOpts` object literal:
  ```ts
  const consumerOpts: ConsumerModuleOptions = {
    jetStream: resolved.jetStream,
    connection: resolved.connection,
    dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
    autoCreateStreams: options.consumer?.autoCreateStreams,
    streamConfig: options.consumer?.streamConfig,
    gatewayConsumerOpts: options.consumer,
  };
  ```
  (`options.consumer` is `EventsToolkitConsumerOptions | undefined` — assignable to
  `GatewayConsumerOptions | undefined` because all `GatewayConsumerOptions` fields are
  optional and present on `EventsToolkitConsumerOptions`. Excess-property checks do not
  apply to variable assignment, only to object literals — and this is a variable.)
- `buildConsumerAsyncImport` factory return: add `gatewayConsumerOpts: opts.consumer,`.

Estimated new total: ~190 lines. ✅ under 200. (If it crosses 200, the simplest relief is
to drop the verbose JSDoc on `forRootAsync` — but it should not be necessary.)

### Step 13 — Update `.agent/project-structure.md`
Add the two new `src/consumer/` files to the consumer bullet (one-liners). This is a docs
file (not under the 200-line src rule) and is within Architector/Plan markdown scope.

---

## 3. Test Plan (TODO task 5)

### 3.1 New file: `src/consumer/consumer-opts-merger.spec.ts`
Pure unit tests for the merger (no NestJS DI). Covers precedence matrix:

| # | gateway | per-subscription | expected result |
|---|---------|------------------|-----------------|
| 1 | `undefined` | `undefined` | default builder (`mack=true`, `ack_policy=Explicit`, unique `deliver_subject`) |
| 2 | `{ durableName: 'd1' }` | `undefined` | `config.durable_name === 'd1'`; ack default still Explicit; unique deliver_subject |
| 3 | `{ durableName: 'd1', deliverPolicy: DeliverPolicy.New }` | `undefined` | both applied |
| 4 | `{ durableName: 'd1' }` | `{ config: { durable_name: 'per' } }` | per-sub overrides → `durable_name === 'per'` |
| 5 | `{ durableName: 'd1' }` | `consumerOpts().durable('builder-only').deliverTo('x').ackExplicit()` | builder returned unchanged (`=== same ref`); gateway ignored |
| 6 | `{ ackPolicy: AckPolicy.None }` | `{ config: { ack_policy: AckPolicy.All } }` | per-sub wins → `AckPolicy.All` |
| 7 | `{ consumerOpts: { config: { durable_name: 'base', max_deliver: 5 } }, durableName: 'scalar' }` | `undefined` | scalar overrides durable_name only → `durable_name==='scalar'`, `max_deliver===5` |
| 8 | `{ durableName: 'd1' }` | `undefined` | ack_policy default Explicit AND deliver_subject defaulted (ensureValid path) |
| 9 | `{ maxDeliver: 3, replayPolicy: ReplayPolicy.Original }` | `undefined` | both config fields set |
| 10 | gateway builder `consumerOpts().durable('g').ackExplicit()` | `undefined` | `durable_name==='g'`, `ack_policy===Explicit` |

Use `consumerOpts()`, `createInbox()` from `nats` (real, like
`subscribe-options.interface.spec.ts` which already imports them). Estimated ~120 lines.

### 3.2 Extend `src/consumer/jetstream-consumer.service.spec.ts`
Add a `describe('subscribe — gateway consumer options merge', ...)` block. The existing
`beforeEach` builds the service WITHOUT `gatewayConsumerOpts` (deps factory omits it).
Add new `describe` that constructs the service WITH gateway opts injected via the deps
token factory:

- Test A: inject `gatewayConsumerOpts: { durableName: 'gateway-durable' }`, subscribe
  with no per-sub `consumerOpts` → assert `jetStream.subscribe` called with a config whose
  `durable_name === 'gateway-durable'`.
- Test B: inject `gatewayConsumerOpts: { durableName: 'gw' }`, subscribe with per-sub
  `{ config: { durable_name: 'per' } }` → assert `durable_name === 'per'` (per overrides).
- Test C: inject `gatewayConsumerOpts: { durableName: 'gw' }`, subscribe with a
  `consumerOpts().durable('builder')` builder → assert `jetStream.subscribe` called with
  the exact same builder reference (full override; existing-equivalent behavior).
- Test D: deps factory omits `gatewayConsumerOpts` (current default) + no per-sub →
  ephemeral consumer: `durable_name` undefined, `ack_policy===Explicit`, unique
  `deliver_subject`. (Re-asserts the existing default to lock the regression.)

Because `beforeEach` builds one module, either (a) add a second `describe` with its own
`beforeEach` that builds a module with `gatewayConsumerOpts` in the deps factory, or (b)
refactor to a `buildService(depsOverrides)` helper. Prefer a small helper to avoid
duplicating the whole setup; keep file under ~470 lines (current 409). Verify it does not
exceed any src line rule — **note: spec files are NOT subject to the 200-line src rule**
(rule scopes to `src/` *source* files; tests live in `src/` but the rule's intent is
production code — confirm with code reviewer; if enforced, split the new block into a
separate `jetstream-consumer.service.gateway-opts.spec.ts`). Safer: put new gateway
merge tests in a separate spec file
`src/consumer/jetstream-consumer.service.gateway-opts.spec.ts` to avoid file growth and
keep each spec focused.

### 3.3 New file: `src/consumer/jetstream-consumer.service.gateway-opts.spec.ts`
Dedicated spec for the gateway-merge path of `JetStreamConsumerService.subscribe`.
Builds the service with `gatewayConsumerOpts` in the deps factory. Tests A–D from 3.2.
Reuses the `createJsMsg`/`createValidEventJson` helpers from
`jetstream-consumer.service.spec-helpers` if exported; otherwise inline minimal mocks.
Estimated ~110 lines.

### 3.4 New file: `src/consumer/request-reply-consumer.service.gateway-opts.spec.ts`
Builds `RequestReplyConsumerService` with `gatewayConsumerOpts: { durableName: 'rr-durable' }`.
- Test: `await service.subscribe('company.*.response.v1')` →
  `jetStream.subscribe` called with config `durable_name === 'rr-durable'`.
- Test: `subscribe(subject, consumerOptsBuilder)` → builder passed through unchanged.
- Test: deps without `gatewayConsumerOpts` → ephemeral default (regression lock).
Estimated ~90 lines.

### 3.5 Extend `src/consumer/subscribe-options.interface.spec.ts`
Add a small block asserting `resolveConsumerSubscribeOpts` behavior is unchanged
(equivalent to "gateway undefined" of the merger) to guard the shared normalization used
by the merger. ~10 new lines.

### 3.6 Extend e2e mocks (only if they break)
- `src/events-toolkit.runtime.e2e-spec.ts` nats mock: `consumerOpts()` builder mock lacks
  `getOpts` returning a full `ConsumerOpts` with `config` spread; the merger calls
  `getOpts()` on gateway builders. Current mock `getOpts()` returns
  `{ config: { ack_policy: 'Explicit' } }` — sufficient for the default (no gateway
  builder) path. No change required unless a test passes a gateway builder (none
  planned). Verify the default-path e2e still passes (`consumer: { enable: true }` with
  no gateway opts → merger receives `gateway=undefined`, per-sub `undefined` → default
  builder → existing assertion holds).
- `src/events-toolkit.module.e2e-spec.ts`: minimal `consumerOpts()` mock; default path
  unchanged. No change required.

### 3.7 Build / typecheck / lint / test commands
After implementation:
- `npm run typecheck`
- `npm run build` (pretest hook builds `dist/`; confirms `index.d.ts` exposes new types)
- `npm run lint`
- `npm test` (runs pretest build + jest)
- Verify `dist/index.d.ts` contains `GatewayConsumerOptions` and the new
  `EventsToolkitConsumerOptions` fields (`grep` the built file).

---

## 4. Durable Resume Behavior (TODO task 3) — Implementation Notes

- **No client-side position store.** NATS JetStream persists the durable consumer's last
  acked position server-side when `durable_name` is set in the consumer config.
- **Same name on every reconnect.** Because `gatewayConsumerOpts` is fixed at module
  construction time and threaded identically into every `subscribe()` call, the same
  `durable_name` is reused automatically — no per-reconnect state needed.
- **`deliverPolicy` omission.** When `durableName` is set and `deliverPolicy` is omitted,
  `gatewayScalarsToConfig` simply doesn't set `deliver_policy`, so the merged config does
  not include it. On an *update* of an existing durable (which is what `subscribe()` does
  when the durable already exists), NATS ignores a changed `deliver_policy` and resumes
  from the stored position — matching the TODO requirement.
- **`deliverTo(createInbox())` default.** Kept. On reconnect a fresh inbox is sent; NATS
  updates the durable's `deliver_subject` and the client listens on the new subject —
  resume still works. Document in `docs/nats-jetstream-configuration.md` (docs step) that
  consumers wanting a strictly stable deliver subject should pass
  `consumerOpts: consumerOpts().durable('x').deliverTo('stable.subject')`.

---

## 5. File Structure of New Files

```
src/consumer/
  gateway-consumer-options.interface.ts   (NEW, ~22 lines) — GatewayConsumerOptions interface
  consumer-opts-merger.ts                 (NEW, ~55 lines) — resolveSubscriptionConsumerOpts + 3 private helpers
  consumer-opts-merger.spec.ts            (NEW, ~120 lines) — merger precedence matrix
  jetstream-consumer.service.gateway-opts.spec.ts  (NEW, ~110 lines) — JetStreamConsumerService gateway merge
  request-reply-consumer.service.gateway-opts.spec.ts (NEW, ~90 lines) — RequestReplyConsumerService gateway merge
```

Modified files:
- `src/events-toolkit-options.interface.ts` (93 → ~101)
- `src/events-toolkit.module.ts` (185 → ~190)
- `src/consumer/consumer.module.ts` (191 → ~196)
- `src/consumer/consumer-module.providers.ts` (188 → ~194)
- `src/consumer/jetstream-consumer.service.ts` (140 → ~144)
- `src/consumer/request-reply-consumer.service.ts` (128 → ~135)
- `src/consumer/jetstream-consumer-deps.interface.ts` (34 → ~37)
- `src/consumer/request-reply-consumer-deps.interface.ts` (41 → ~44)
- `src/consumer/sync-jetstream-consumer-deps-options.interface.ts` (28 → ~31)
- `src/consumer/sync-request-reply-consumer-deps-options.interface.ts` (30 → ~33)
- `src/consumer/index.ts` (43 → ~47)
- `package.json` (version bump)
- `.agent/project-structure.md` (doc; new-file bullets)

All modified `src/` files remain under the 200-line limit.

---

## 6. Line-Count Budget Check (per 200-line rule)

| File | Before | After (est.) | Under 200? |
|------|--------|--------------|------------|
| events-toolkit-options.interface.ts | 93 | ~101 | ✅ |
| events-toolkit.module.ts | 185 | ~190 | ✅ |
| consumer/consumer.module.ts | 191 | ~196 | ✅ (tight — keep JSDoc terse) |
| consumer/consumer-module.providers.ts | 188 | ~194 | ✅ |
| consumer/jetstream-consumer.service.ts | 140 | ~144 | ✅ |
| consumer/request-reply-consumer.service.ts | 128 | ~135 | ✅ |
| consumer/gateway-consumer-options.interface.ts | NEW | ~22 | ✅ |
| consumer/consumer-opts-merger.ts | NEW | ~55 | ✅ |

---

## 7. Constraints Self-Check

- Max 200 lines/src file: ✅ (see §6; watch `consumer.module.ts`).
- Max 50 lines/method body: ✅ (all touched methods ≤ ~10 lines).
- Max 2 indentation levels: ✅ (object spreads are single-level; no nested loops added).
- Max 2 params/method: ✅ (`resolveSubscriptionConsumerOpts(gateway, per)`;
  `RequestReplyConsumerService.subscribe(subject, consumerOpts)`).
- Prefer private members: ✅ (new service field `gatewayConsumerOpts` private readonly;
  merger helpers non-exported).
- Self-documenting code: ✅ (descriptive names; minimal JSDoc for public API only).
- No commented-out code: ✅.
- Single-section boolean conditions: ✅ (no compound `if` conditions introduced).
- New config params use named enum/typed scalars, no magic numbers: ✅.

---

## 8. Out of Scope (handled by other Critical Workflow steps)

- TODO task 6 (docs/changelog/`docs/nats-jetstream-configuration.md` consumer-options
  section, README linkage) → 4.4 docs-specialist sub-step. This plan only ensures the
  public types exist to be documented.
- Git branch creation, version bump commit, TODO `[DONE]` marking → steps 2/3/4.6.
- Code review/simplification → 4.3.

---

## 9. Verification Checklist (for the 4.5 Verification step)

- [ ] `EventsToolkitConsumerOptions` has `consumerOpts`, `durableName`, `deliverPolicy`,
      `ackPolicy`, `maxDeliver`, `replayPolicy`.
- [ ] `GatewayConsumerOptions` exported from `src/consumer/index.ts`.
- [ ] `resolveSubscriptionConsumerOpts` exported from `src/consumer/index.ts`.
- [ ] `ConsumerModuleOptions.gatewayConsumerOpts` exists and is forwarded by both sync
      and async providers into `JetStreamConsumerDeps` and `RequestReplyConsumerDeps`.
- [ ] `JetStreamConsumerService.subscribe` calls `resolveSubscriptionConsumerOpts`.
- [ ] `RequestReplyConsumerService.subscribe(subject, consumerOpts?)` calls
      `resolveSubscriptionConsumerOpts` and `onModuleInit` still subscribes with no
      per-sub opts.
- [ ] `dist/index.d.ts` exposes the new `EventsToolkitConsumerOptions` fields and
      `GatewayConsumerOptions`.
- [ ] New merger spec passes the precedence matrix.
- [ ] Existing `subscribe-options.interface.spec.ts`,
      `jetstream-consumer.service.spec.ts`, `request-reply-consumer.service.spec.ts` pass
      unchanged (except added gateway-opts blocks).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all green.
```