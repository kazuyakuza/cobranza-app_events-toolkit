# Simplification Plan: Durable JetStream Consumers (Task 1 Step 4.3)

## Scope

Review the implementation produced by step 4.2 for the six files listed in the TODO task. Identify simplifications that reduce duplication, remove redundant code, and keep methods/files under the project limits.

## Current State

| File | Lines | Max Method Body | Notes |
|------|-------|-------------------|-------|
| `src/consumer/consumer-opts-merger.ts` | 87 | 19 | Clean but has a removable helper |
| `src/consumer/consumer-opts-merger.spec.ts` | 145 | n/a | One duplicate describe block |
| `src/consumer/jetstream-consumer.service.ts` | 119 | 19 | `ensureStreamIfNeeded` duplicated with RR service |
| `src/consumer/request-reply-consumer.service.ts` | 123 | 14 | Same as above |
| `src/consumer/jetstream-consumer.service.gateway-opts.spec.ts` | 137 | n/a | `extractDurableName` duplicated |
| `src/consumer/request-reply-consumer.service.gateway-opts.spec.ts` | 117 | n/a | `extractDurableName` duplicated |

All files are already under the 200-line limit and all method bodies are under the 50-line limit.

## Simplification Opportunities

### 1. Remove redundant default branch in `consumer-opts-merger.ts`

**File:** `src/consumer/consumer-opts-merger.ts`

**Current:** `resolveSubscriptionConsumerOpts` uses `hasGatewayOrPerSubscription` plus `createDefaultConsumerOpts()` to return defaults when both inputs are undefined.

**Current complexity:** 87 lines, helper `hasGatewayOrPerSubscription` 15 lines.

**Proposed simplified version:**

```ts
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
```

Remove `hasGatewayOrPerSubscription` and the `createDefaultConsumerOpts` import. `resolveConsumerSubscribeOpts` already applies the same defaults.

**Impact:** Removes ~15 lines and one helper. The only behavioral change for the `undefined, undefined` case is the return type becomes `Partial<ConsumerOpts>` instead of `ConsumerOptsBuilder`; both are accepted by `jetStream.subscribe()`.

### 2. Condense scalar mapping in `consumer-opts-merger.ts`

**File:** `src/consumer/consumer-opts-merger.ts`

**Current:** `gatewayScalarsToConfig` has five repetitive `if` blocks (23 lines).

**Proposed simplified version:**

```ts
function gatewayScalarsToConfig(gateway: GatewayConsumerOptions | undefined): Partial<ConsumerConfig> {
  if (!gateway) {
    return {};
  }
  return {
    ...(gateway.durableName && { durable_name: gateway.durableName }),
    ...(gateway.deliverPolicy !== undefined && { deliver_policy: gateway.deliverPolicy }),
    ...(gateway.ackPolicy !== undefined && { ack_policy: gateway.ackPolicy }),
    ...(gateway.maxDeliver !== undefined && { max_deliver: gateway.maxDeliver }),
    ...(gateway.replayPolicy !== undefined && { replay_policy: gateway.replayPolicy }),
  };
}
```

**Impact:** ~13 lines instead of 23. Preserves the truthy check for `durableName`.

### 3. Remove duplicate default test describe in `consumer-opts-merger.spec.ts`

**File:** `src/consumer/consumer-opts-merger.spec.ts`

**Current:** The first describe block (`no gateway, no per-subscription → default builder`) and the last describe block (`gateway undefined, per-subscription undefined → defaults`) test the same inputs with the same assertions.

**Current complexity:** 145 lines.

**Proposed simplified version:** Delete the last describe block.

**Impact:** Reduces to ~131 lines. No loss of coverage.

### 4. Extract duplicated `extractDurableName` test helper

**Files:** `src/consumer/jetstream-consumer.service.gateway-opts.spec.ts` and `src/consumer/request-reply-consumer.service.gateway-opts.spec.ts`

**Current:** Both files define an identical `extractDurableName` helper (8 lines each, 16 lines total).

**Proposed simplified version:** Move the helper to a shared test utility file, for example `src/consumer/testing/extract-durable-name.ts`, and import it from both spec files.

```ts
// src/consumer/testing/extract-durable-name.ts
export function extractDurableName(optsArg: unknown): string | undefined {
  const getOptsFn = (optsArg as { getOpts?: () => { config: Record<string, unknown> } }).getOpts;
  if (typeof getOptsFn === 'function') {
    return getOptsFn.call(optsArg).config.durable_name as string | undefined;
  }
  return (optsArg as { config?: Record<string, unknown> }).config?.durable_name as string | undefined;
}
```

**Impact:** Removes ~16 lines of duplication. Requires creating a shared testing location.

### 5. Extract shared stream auto-creator helpers

**Files:** `src/consumer/jetstream-consumer.service.ts` and `src/consumer/request-reply-consumer.service.ts`

**Current:** Both services contain an identical `ensureStreamIfNeeded` private method and identical `StreamAutoCreator` construction logic.

**Current complexity:** 4 lines per service for each duplicated pattern (8 lines total per pattern).

**Proposed simplified version:** Add `src/consumer/consumer-stream.utils.ts` with:

```ts
export function createStreamAutoCreator(deps: {
  autoCreateStreams?: boolean;
  connection?: NatsConnection;
  streamConfig?: Partial<StreamConfig>;
  logger: EventLoggerService;
}): StreamAutoCreator | undefined {
  return deps.autoCreateStreams && deps.connection
    ? new StreamAutoCreator({ connection: deps.connection, streamConfig: deps.streamConfig, logger: deps.logger })
    : undefined;
}

export async function ensureStreamExists(
  autoCreator: StreamAutoCreator | undefined,
  subject: string,
): Promise<void> {
  if (autoCreator) {
    await autoCreator.ensureStreamExists(subject);
  }
}
```

Then import and use these in both services.

**Impact:** Removes ~8 lines of duplication from each service. Keeps behavior identical.

### 6. (Optional) Extract common subscription helper

**Files:** `src/consumer/jetstream-consumer.service.ts` and `src/consumer/request-reply-consumer.service.ts`

**Current:** Both `subscribe` methods call `resolveSubscriptionConsumerOpts` followed by `jetStream.subscribe` followed by `processSubscription`.

**Proposed simplified version:** A shared helper could be overkill because the input types differ, but if duplication grows, add a generic helper in `src/consumer/subscribe-with-opts.ts` that takes `subject`, `gatewayConsumerOpts`, `consumerOpts`, and a `process` callback.

**Impact:** Low priority. Consider only if the subscription pattern expands further.

### 7. (Optional) Unify `logGeneralError` implementations

**Files:** `src/consumer/jetstream-consumer.service.ts` and `src/consumer/request-reply-consumer.service.ts`

**Current:** `logGeneralError` is similar but not identical. `JetStreamConsumerService` always wraps non-Errors in `Error` to capture a stack; `RequestReplyConsumerService` only logs the string message.

**Proposed simplified version:** Unify to a single helper that always wraps non-Errors in `Error`.

**Impact:** Removes duplication but changes `RequestReplyConsumerService` behavior by adding stack traces. Only apply if the behavior change is acceptable.

## Summary

The highest-value simplifications are:

1. Remove the unnecessary `hasGatewayOrPerSubscription` helper in `consumer-opts-merger.ts`.
2. Remove the duplicate test describe block in `consumer-opts-merger.spec.ts`.
3. Extract the duplicated `extractDurableName` test helper into a shared test utility.
4. Extract shared stream auto-creator construction and `ensureStreamIfNeeded` helpers to reduce duplication between the two consumer services.

All files already meet the 200-line file limit and 50-line method body limit. No simplification is required for compliance.
