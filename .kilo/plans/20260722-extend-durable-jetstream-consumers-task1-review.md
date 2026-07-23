# Code Review Plan — Task 1: Extend `@cobranza-apps/events-toolkit` to Support Durable JetStream Consumers

**Review scope:** implementation from Critical Workflow step 4.2, covering TODO file `.agent/todos/20260722/20260722-todo-1.md` and implementation plan `.kilo/plans/20260722-extend-durable-jetstream-consumers-task1.md`.

**Overall assessment:** The implementation matches the intended architecture, all verification commands pass, and no critical or security issues were found. A handful of warnings and suggestions are listed below; most relate to project-rule compliance, type-safety refinements, and test coverage gaps.

---

## Issues Found

### 1. Project rule violation: compound boolean condition not extracted to a method

- **File:** `src/consumer/consumer-opts-merger.ts`
- **Lines:** 44–49
- **Severity:** warning
- **Description:** The `hasScalar` local variable is built from five `||`-joined boolean sections. The project's *Single-Section Boolean Conditions Rule* requires such compound conditions to be extracted into a descriptively-named method whose call replaces the condition.
- **Proposed fix:** Extract a private helper:

```ts
function hasGatewayScalar(gateway: GatewayConsumerOptions | undefined): boolean {
  if (!gateway) {
    return false;
  }
  return (
    gateway.durableName !== undefined ||
    gateway.deliverPolicy !== undefined ||
    gateway.ackPolicy !== undefined ||
    gateway.maxDeliver !== undefined ||
    gateway.replayPolicy !== undefined
  );
}
```

Then replace lines 44–50 with `return hasGatewayScalar(gateway) || gateway.consumerOpts !== undefined;`.

---

### 2. Implementation deviates from plan's `mack` defaulting logic

- **File:** `src/consumer/consumer-opts-merger.ts`
- **Lines:** 27–29, 62
- **Severity:** suggestion
- **Description:** The plan specified `mack: per.mack ?? base.mack` and delegated all defaults to `resolveConsumerSubscribeOpts`. The implementation (a) early-returns `createDefaultConsumerOpts()` when neither gateway nor per-subscription options are present, and (b) defaults `mack` to `true` via `per.mack ?? base.mack ?? true`. The deviation is functionally correct — without it, a merged plain object would have `mack: undefined`, losing the manual-ack default — but the plan text and the implementation are not in sync.
- **Proposed fix:** Update the implementation plan to reflect the corrected defaulting behavior so the 4.5 verification step does not flag the delta.

---

### 3. Type-unsafe cast for `ConsumerOptsBuilder.getOpts()`

- **File:** `src/consumer/consumer-opts-merger.ts`
- **Line:** 72
- **Severity:** warning
- **Description:** Because the NATS package does not expose `getOpts()` on the public `ConsumerOptsBuilder` interface, the code uses `(opts as unknown as { getOpts: () => ConsumerOpts }).getOpts()`. This weakens type safety and is duplicated in tests. It is also called after `isConsumerOptsBuilder(opts)` has narrowed the value, so the cast is only needed to satisfy the compiler.
- **Proposed fix:** Introduce a small internal type alias and reuse it in the merger and test helpers:

```ts
type ConsumerOptsBuilderWithGetOpts = { getOpts(): ConsumerOpts };
```

Use `const builder = opts as unknown as ConsumerOptsBuilderWithGetOpts; return builder.getOpts();`.

---

### 4. Optional `consumerOptsBuilder` callback suggested by TODO is not implemented

- **File:** `src/events-toolkit-options.interface.ts`
- **Lines:** 68–83
- **Severity:** suggestion
- **Description:** TODO task 1 says the interface should "preferably" accept a `consumerOptsBuilder?: (subject: string) => ConsumerOptsBuilder`. The acceptance criteria only require `durableName` and/or `consumerOpts`, so the current implementation meets the acceptance criteria. Adding the callback would give callers per-subject control, but it is not required.
- **Proposed fix:** Optionally add `consumerOptsBuilder?: (subject: string) => ConsumerOptsBuilder` to `EventsToolkitConsumerOptions`, thread it through to `resolveSubscriptionConsumerOpts`, and give it precedence just below a per-subscription builder. If not added, document the deliberate scope limitation.

---

### 5. Test gap: `deliverPolicy` is omitted when only `durableName` is set

- **File:** `src/consumer/consumer-opts-merger.spec.ts`
- **Lines:** 41–53
- **Severity:** warning
- **Description:** TODO task 3 requires that omitting `deliverPolicy` when `durableName` is set lets NATS resume from the durable's stored state. The current test verifies `durable_name` but does not assert that `deliver_policy` is absent from the merged config.
- **Proposed fix:** Add an assertion inside the `gateway durableName only` block:

```ts
it('does not set deliver_policy so NATS uses the durable stored state', () => {
  expect(config.config?.deliver_policy).toBeUndefined();
});
```

---

### 6. Test gap: gateway scalar `ackPolicy` overriding a gateway builder is not verified

- **File:** `src/consumer/consumer-opts-merger.spec.ts`
- **Lines:** 98–113
- **Severity:** suggestion
- **Description:** The precedence rule states that gateway scalars override matching fields from `gateway.consumerOpts`, including when `consumerOpts` is a builder. The existing scalar-override test uses a partial `consumerOpts` object. There is no test verifying a scalar override of a builder's `ack_policy`.
- **Proposed fix:** Add a test case:

```ts
it('scalar ackPolicy overrides gateway builder ack_policy', () => {
  const gateway: GatewayConsumerOptions = {
    consumerOpts: consumerOpts().ackAll(),
    ackPolicy: AckPolicy.Explicit,
  };
  const resolved = resolveSubscriptionConsumerOpts(gateway, undefined);
  const config = getConfig(resolved);
  expect(config.config?.ack_policy).toBe(AckPolicy.Explicit);
});
```

---

### 7. Test gap: `RequestReplyConsumerService.onModuleInit` path not covered with gateway opts

- **File:** `src/consumer/request-reply-consumer.service.gateway-opts.spec.ts`
- **Lines:** 60–78
- **Severity:** suggestion
- **Description:** The spec tests `subscribe(subject)` and `subscribe(subject, builder)` directly. The auto-subscription path triggered by `onModuleInit()` — which is the production path for request-reply responses — is not exercised with gateway consumer options.
- **Proposed fix:** Add a test in the `with gatewayConsumerOpts { durableName: "rr-durable" }` block:

```ts
it('applies gateway durable_name when onModuleInit auto-subscribes', async () => {
  service.onModuleInit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const [, optsArg] = jetStream.subscribe.mock.calls[0] as [string, unknown];
  expect(extractDurableName(optsArg)).toBe('rr-durable');
});
```

---

### 8. Version bump does not match plan recommendation

- **File:** `package.json`
- **Line:** 3
- **Severity:** suggestion
- **Description:** The plan recommended a minor bump to `0.15.0` because the public API gained new optional exports (`GatewayConsumerOptions`, `resolveSubscriptionConsumerOpts`, and new `EventsToolkitConsumerOptions` fields). The current version is `0.14.0`. If `main` was `0.13.0`, the bump is a minor increment and matches the intent; if `main` was already `0.14.0`, the version was not bumped at all.
- **Proposed fix:** Verify `main`'s version. If the public API expansion warrants a minor bump, set version to `0.15.0` and commit as `chore: bump version to 0.15.0`.

---

### 9. Edge case: empty string `durableName` is silently ignored

- **File:** `src/consumer/consumer-opts-merger.ts`
- **Line:** 79
- **Severity:** suggestion
- **Description:** `if (gateway?.durableName)` treats an empty string as unset. Empty durable names are invalid for NATS, so the practical impact is low, but the behavior is implicit.
- **Proposed fix:** Either keep the truthy check and document that empty strings are treated as unset, or validate explicitly:

```ts
if (gateway?.durableName !== undefined && gateway.durableName !== '') {
  config.durable_name = gateway.durableName;
}
```

---

### 10. Redundant test block

- **File:** `src/consumer/consumer-opts-merger.spec.ts`
- **Lines:** 140–155
- **Severity:** suggestion
- **Description:** The describe block `gateway undefined, per-subscription undefined → defaults` duplicates the assertions in the first describe block at lines 24–39.
- **Proposed fix:** Remove the redundant describe block or merge it with the first one to reduce test maintenance surface.

---

### 11. Branch name differs from plan

- **Severity:** suggestion
- **Description:** The plan specified branch `feat/durable-jetstream-consumers`. The active branch is `feat/extend-durable-jetstream-consumers`. There is no functional impact.
- **Proposed fix:** No action required unless the project enforces exact branch names from plans.

---

## Compliance Checklist

| Rule | Status | Notes |
|------|--------|-------|
| Max 200 lines per `src/` file | ✅ | Largest touched file is `consumer.module.ts` at 196 lines. |
| Max 50 lines per method body | ✅ | All new/modified methods are well under 50 lines. |
| Max 2 params per method | ✅ | `resolveSubscriptionConsumerOpts(gateway, perSubscription)` and `subscribe(subject, consumerOpts?)` both have 2 params. |
| Max 2 nesting levels | ✅ | No new deeply nested blocks. |
| Prefer private members | ✅ | `gatewayConsumerOpts` is `private readonly`; merger helpers are non-exported. |
| Self-documenting code | ✅ | Descriptive names and JSDoc on public interfaces. |
| No commented-out code | ✅ | None found. |
| Single-section boolean conditions | ⚠️ | See issue #1 (`hasScalar` compound condition). |

---

## Verification Results

All verification commands were executed and passed:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — 86 suites, 750 tests passed.
- `npm run test:e2e` — 2 suites, 12 tests passed.
- `dist/index.d.ts` exposes `GatewayConsumerOptions`, `resolveSubscriptionConsumerOpts`, and the new `EventsToolkitConsumerOptions` fields (`consumerOpts`, `durableName`, `deliverPolicy`, `ackPolicy`, `maxDeliver`, `replayPolicy`).

---

## Security Assessment

No security issues identified. The new `gatewayConsumerOpts` is injected via NestJS DI and is not derived from untrusted input. No secrets, eval, or unsafe dynamic calls were introduced.
