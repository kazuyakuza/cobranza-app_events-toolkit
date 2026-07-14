# Code Review & Simplification Plan: Fix JetStream consumer options (Task 1 — 4.3)

- **Original plan:** `.kilo/plans/20260714-fix-jetstream-consumer-options.md`
- **Commit reviewed:** `61d9d73`
- **Date:** 2026-07-14

## Review result

**Issues found.** The implementation is functionally correct and the new helper APIs match the original plan, but two deviations require fixes and one test can be simplified for consistency.

## Findings

### 1. Missing `DEFAULT_ACK_POLICY` named constant (plan deviation)

The original plan requires a module-private named constant to avoid the magic enum value:

```ts
/** Default ack policy applied when a caller omits consumer options. */
const DEFAULT_ACK_POLICY = AckPolicy.Explicit;
```

The committed implementation inlines `AckPolicy.Explicit` inside `ensureValidConsumerConfig` and never defines the constant. This violates the plan's `avoid-magic-numbers` note and creates two sources of truth for the default ack policy.

### 2. Scope expansion without plan update (process deviation)

The original plan explicitly flags `RequestReplyConsumerService.subscribe()` as **out of scope** and states the fix must not be applied without caller approval. The committed implementation changed both:

- `src/consumer/request-reply-consumer.service.ts`
- `src/consumer/request-reply-consumer.service.spec.ts`

The code change is correct (`resolveConsumerSubscribeOpts()` prevents the same `ack_policy` crash), but it was not part of the approved plan. The plan must be updated to reflect the expanded scope, or the changes must be reverted and handled as a separate task.

### 3. `jetstream-consumer.service.ts` exceeds max-lines-per-file

The file now totals **201 lines**, exceeding the project rule of **200 lines max** for `src/` source files. The implementation only added 2 lines, but it pushed the file over the limit.

### 4. Request-reply test assertion is weaker than the jetstream spec

`request-reply-consumer.service.spec.ts` asserts:

```ts
expect(resolved.config.ack_policy).toBeDefined();
```

The jetstream spec asserts the exact expected value:

```ts
expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
```

Aligning the request-reply test makes the contract explicit and consistent.

## Fix / simplification steps

### Step 1 — Add `DEFAULT_ACK_POLICY` constant and use it

**File:** `src/consumer/subscribe-options.interface.ts`

1. Add the named constant immediately after the imports and before `ConsumerSubscribeOpts`:

   ```ts
   /** Default ack policy applied when a caller omits consumer options. */
   const DEFAULT_ACK_POLICY = AckPolicy.Explicit;
   ```

2. Update `ensureValidConsumerConfig` to use the constant:

   ```ts
   function ensureValidConsumerConfig(opts: Partial<ConsumerOpts>): Partial<ConsumerOpts> {
     const config = { ack_policy: DEFAULT_ACK_POLICY, ...opts.config };
     return { ...opts, config };
   }
   ```

### Step 2 — Reduce `jetstream-consumer.service.ts` to ≤ 200 lines

**File:** `src/consumer/jetstream-consumer.service.ts`

Condense the class-level JSDoc to remove one non-essential paragraph while keeping the public API description. Example change that removes 2 lines:

```ts
/**
 * Manages JetStream subscriptions and message lifecycle for the Consumer Module.
 *
 * Handles the full consume pipeline: JSON parsing, envelope validation,
 * handler dispatch, ACK/NACK, and DLQ routing on failure.
 */
```

This brings the file to 199 lines.

### Step 3 — Strengthen request-reply test assertion

**File:** `src/consumer/request-reply-consumer.service.spec.ts`

1. Import `AckPolicy` from `'nats'` if not already imported.
2. Change the assertion to match the jetstream spec:

   ```ts
   expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
   ```

### Step 4 — Formalize the request-reply scope expansion

**File:** `.kilo/plans/20260714-fix-jetstream-consumer-options.md`

Update section 9 (Out-of-scope flag) to reflect that the caller approved the expansion, or create a separate TODO/plan for the request-reply fix. If formalizing within the same plan:

- Move `request-reply-consumer.service.ts` and `request-reply-consumer.service.spec.ts` into the scope.
- Add a step under section 3 for replacing `this.jetStream.subscribe(subject, {})` with `this.jetStream.subscribe(subject, resolveConsumerSubscribeOpts())`.
- Add a step for the corresponding unit test update.

## Verification after fixes

Run the same verification commands listed in the original plan:

1. `npm run typecheck`
2. `npm run lint`
3. `npm test -- jetstream-consumer.service.spec`
4. `npm test -- request-reply-consumer.service.spec`
5. `npm test`
6. `npm run build`

## Notes

- The implementation correctly handles the edge cases: `undefined`, `ConsumerOptsBuilder`, plain `{}`, and plain `{ config: {} }`.
- All new helper functions comply with max-params (≤ 2), max-depth (≤ 2), and max-lines-per-method rules.
- No `?? {}` or literal `{}` remains in `JetStreamConsumerService.subscribe()` or `RequestReplyConsumerService.subscribe()`.
