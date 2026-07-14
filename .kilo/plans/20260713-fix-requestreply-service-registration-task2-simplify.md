# Simplification Plan: Task 2 — `src/events-toolkit.module.e2e-spec.ts`

## File Under Review

`src/events-toolkit.module.e2e-spec.ts`

## Current State

The commit `1e546a1` added two new service-resolution assertions to the existing e2e DI compilation test. The file now contains six nearly identical `it(...)` blocks that each resolve a single service and assert `toBeInstanceOf(ServiceClass)`.

## Identified Simplification

### 1. Parameterize service-resolution assertions

**Location:** `describe('EventsToolkitModule.forRootAsync e2e DI compilation', ...)` block.

**Current pattern (duplicated 6 times):**

```typescript
it('resolves ProducerService from the compiled module', () => {
  expect(moduleRef.get(ProviderClass)).toBeInstanceOf(ProviderClass);
});
```

**Proposed change:**

Replace the six individual `it` blocks with a single data-driven loop over a `readonly` array of providers:

```typescript
const resolvableServices = [
  ProducerService,
  ConsumerService,
  OutboxService,
  DiscoveryService,
  RequestReplyService,
  RequestReplyConsumerService,
] as const;

it.each(resolvableServices)(
  'resolves %s from the compiled module',
  (ServiceClass) => {
    expect(moduleRef.get(ServiceClass)).toBeInstanceOf(ServiceClass);
  },
);
```

If the project does not use `jest-each` style or the team prefers a plain `forEach`, an equivalent `resolvableServices.forEach(...)` block achieves the same deduplication.

## Rationale

- Removes 5 near-identical test blocks (~20 lines).
- Adding future service assertions only requires appending an item to the array.
- Keeps the same coverage and failure granularity per service.
- Aligns with the project's `self-documenting-code` and `max-lines-per-file` rules.

## Estimated Impact

| Change | Lines removed | Risk | Benefit |
|--------|---------------|------|---------|
| Parameterize service assertions | ~20 | Very low — identical assertions, same Jest behavior | Higher maintainability, less duplication |

## What Was NOT Identified

- No other duplication, dead code, or over-complex logic was found in the modified file.
- The helper functions `buildForRootAsyncOptions` and `compileToolkitModule` are already concise and self-documenting.
- Mocks are minimal and scoped to the test; no simplification warranted.

## Recommendation

Apply simplification #1. It is low-risk and directly improves readability and maintainability.
