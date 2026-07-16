# Simplification Plan — Task 2: `resolveConsumerSubscribeOpts` defaulting

> Source: `.kilo/plans/20260716-fix-deliverTo-push-consumer-task2.md` (post-4.2)
> Target: `src/consumer/subscribe-options.interface.ts`
> Date: 2026-07-16

## Finding

The three new functions `ensureValidConsumerConfig`, `applyDefaultAckPolicy`, and `applyDefaultDeliverSubject` can be collapsed into a single function using nullish-coalescing assignment (`??=`).

## Current state (after 4.2)

```ts
function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
  const config = { ...opts.config };
  applyDefaultAckPolicy(config);
  applyDefaultDeliverSubject(config);
  return { ...opts, config };
}

function applyDefaultAckPolicy(config: Partial<ConsumerConfig>): void {
  if (config.ack_policy === undefined) {
    config.ack_policy = DEFAULT_ACK_POLICY;
  }
}

function applyDefaultDeliverSubject(config: Partial<ConsumerConfig>): void {
  if (config.deliver_subject === undefined) {
    config.deliver_subject = createInbox();
  }
}
```

## Proposed simplification

Replace the block above with:

```ts
function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
  const config = { ...opts.config };
  config.ack_policy ??= DEFAULT_ACK_POLICY;
  config.deliver_subject ??= createInbox();
  return { ...opts, config };
}
```

## Additional cleanup

Remove `ConsumerConfig` from the `nats` import because the helper parameter types that required it are deleted. The inferred type of `config` (`{ ...opts.config }`) is sufficient for the two property assignments.

```ts
import {
  AckPolicy,
  consumerOpts,
  ConsumerOptsBuilder,
  ConsumerOpts,
  createInbox,
  JsMsg,
} from 'nats';
```

## Why this is safe

- `??=` assigns only when the left-hand side is `null` or `undefined`, which matches the current "preserve caller-supplied value" behavior and also covers an explicit `null`.
- `ack_policy` and `deliver_subject` are the only two fields being defaulted; a single function keeps the normalization in one place without loss of readability.
- The project compiles to `ES2021` (`tsconfig.json`) and uses TypeScript `^5.9.3` (`package.json`), so `??=` is fully supported.

## Rules compliance after change

| Rule | Status |
|------|--------|
| max-lines-per-file (≤200) | File shrinks. ✅ |
| max-lines-per-method (≤50 body) | `ensureValidConsumerConfig` body = 4 lines. ✅ |
| max-depth (≤2) | One level of property access, no nested blocks. ✅ |
| max-2-params | Single param. ✅ |
| single-section-boolean-conditions | `??=` replaces the `if` statements; no compound conditions introduced. ✅ |
| no-commented-code | None. ✅ |
| prefer-private-members | `ensureValidConsumerConfig` remains module-private. ✅ |

## Out of scope

- No behavior change for `ConsumerOptsBuilder` or `undefined` paths.
- No test changes (TODO Task 3 handles tests).
- No documentation changes (TODO Task 4 handles docs).
