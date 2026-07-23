# Code Review — Idempotency Integration: Consumer, Discovery & Testing (Task 2)

**Review date:** 2026-07-23
**TODO:** `.agent/todos/20260722/20260722-todo-2.md`
**Plan:** `.kilo/plans/20260723-idempotency-integration-task2.md`

## Executive Summary

- `npm run build` ✅ passes
- `npm run test` ✅ passes (93 suites, 810 tests)
- `npm run typecheck` ✅ passes
- `npm run lint` ❌ fails (28 errors, several in Task 2 files)

Overall the integration follows the plan and the wiring is correct. The main issues are:
(1) `MockIdempotencyService.markAsProcessed` does not mirror the real service's optional `ttlSeconds` argument,
(2) a mandated idempotency failure-then-success test is missing,
(3) the toolkit-level capabilities E2E spec file is missing,
(4) `DiscoveryService` conditionally sets `capabilities` rather than always assigning the resolved array as the plan specified,
(5) several Prettier formatting errors in Task 2 files,
and (6) a couple of spec files exceed the 200-line limit.

No files were modified during this review.

## Issues

### 1. `MockIdempotencyService.markAsProcessed` does not mirror `IdempotencyService` API
- **File:** `src/testing/mock-idempotency.service.ts`
- **Line:** 33
- **Problem:** The real `IdempotencyService.markAsProcessed(event, ttlSeconds?)` accepts an optional TTL parameter. The mock only accepts `event`, so any caller passing a TTL will fail compilation or behave differently against the mock. The plan explicitly stated the TTL parameter must be accepted (and ignored).
- **Fix:** Add the optional parameter and explicitly ignore it.
  ```ts
  async markAsProcessed(event: AnyEventEnvelope<unknown>, ttlSeconds?: number): Promise<void> {
    void ttlSeconds;
    const key = buildIdempotencyKey(event);
    this.processed.set(key, true);
  }
  ```

### 2. Missing test: event is marked only when handler succeeds
- **File:** `src/consumer/decorators/on-event.explorer.spec.ts`
- **Line:** add after line 230 (inside `describe('idempotent flag')`)
- **Problem:** Plan section 4.2-A required a test where the handler throws on the first invocation and succeeds on the second, proving that the event is **not** marked as processed on failure. This coverage is missing.
- **Fix:** Add the test and a new fixture.
  In `src/consumer/decorators/on-event.explorer.fixtures.ts` add:
  ```ts
  export class FailingThenSucceedingConsumer {
    invokeCount = 0;
    shouldFail = true;

    @OnEvent('billing.invoice.adjusted', {
      version: '1',
      description: 'Handles invoice adjustments idempotently',
      payloadExample: { invoiceId: 'inv-1' },
      idempotent: true,
    })
    handleAdjusted(): void {
      this.invokeCount += 1;
      if (this.shouldFail) {
        throw new Error('first attempt fails');
      }
    }
  }
  ```
  In `src/consumer/decorators/on-event.explorer.spec.ts` add:
  ```ts
  it('marks event as processed only when handler succeeds', async () => {
    const idempotencyService = createIdempotencyService();
    const idempotentHandler = new FailingThenSucceedingConsumer();
    const localDeps: OnEventExplorerDeps = {
      discovery: discovery as unknown as DiscoveryService,
      reflector: new Reflector(),
      consumerService: new ConsumerService(),
      idempotencyService,
    };
    const explorerWithIdempotency = new OnEventExplorer(localDeps);

    (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: idempotentHandler }]);
    (discovery.getControllers as jest.Mock).mockReturnValue([]);

    explorerWithIdempotency.onModuleInit();

    const handler = localDeps.consumerService.getHandler('company.*.billing.invoice.adjusted.v1');
    expect(handler).toBeDefined();

    const event = buildIdempotentEvent();
    const context = buildEventContext();

    await expect(handler!(event, context)).rejects.toThrow('first attempt fails');
    expect(idempotentHandler.invokeCount).toBe(1);
    expect(await idempotencyService.isDuplicate(event)).toBe(false);

    idempotentHandler.shouldFail = false;
    await handler!(event, context);
    expect(idempotentHandler.invokeCount).toBe(2);
    expect(await idempotencyService.isDuplicate(event)).toBe(true);
  });
  ```

### 3. Missing `events-toolkit.capabilities.spec.ts`
- **File:** `src/events-toolkit.capabilities.spec.ts` (does not exist)
- **Problem:** Plan section 4.2-F explicitly requires a new spec file that verifies `EventsToolkitModule` resolves `capabilities` for both sync and async paths. The file is absent, leaving the toolkit-level capability resolution untested.
- **Fix:** Create the spec. Mock `nats` as in `src/events-toolkit.module.di.spec.ts`, build `EventsToolkitModule.forRoot(...)` and `forRootAsync(...)` with/without `idempotency` and `outbox`, then read the manifest via `DiscoveryService.getManifest()` and assert `capabilities` contains the expected entries. See plan 4.2-F for the detailed test outline.

### 4. `DiscoveryService.getOrGenerateManifest` does not always assign resolved capabilities
- **File:** `src/discovery/discovery.service.ts`
- **Line:** 114-118
- **Problem:** Plan section 3.2.4 specified:
  ```ts
  this.cachedManifest = { ...baseManifest, capabilities: this.resolvedOptions.capabilities };
  ```
  The implementation merges contributors and then conditionally assigns `capabilities` only when the array is non-empty. This causes the related test to assert `undefined` when `capabilities` is `[]`, which contradicts the plan's requirement that resolved capabilities default to `[]` and appear on the manifest.
- **Fix:** Always assign the resolved capabilities (the merger is correctly preserved):
  ```ts
  private getOrGenerateManifest(): ServiceManifestDto {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }
    const baseManifest = this.manifestService.generateManifest(this.resolvedOptions.service);
    this.cachedManifest = { ...this.merger.merge(baseManifest, this.contributors), capabilities: this.resolvedOptions.capabilities };
    return this.cachedManifest;
  }
  ```
  Then update `src/discovery/discovery.service.spec.ts` line 225:
  ```ts
  expect(manifest.capabilities).toEqual([]);
  ```

### 5. Prettier/lint errors in Task 2 files
- **Files & lines:**
  - `src/events-toolkit-module.imports.ts:12` — import formatting
  - `src/events-toolkit-module.imports.ts:35` — function parameter formatting
  - `src/testing/events-toolkit-test.module.ts:84` — array literal formatting
  - `src/testing/index.ts:17` — re-export formatting
- **Problem:** `npm run lint` fails with Prettier errors in Task 2 files. (There are also pre-existing lint errors in Task 1 files; running the auto-fix will resolve those as well.)
- **Fix:** Run `npm run lint:fix` or `npm run format` to auto-fix these. Alternatively apply the exact replacements reported by ESLint:
  - `src/events-toolkit-module.imports.ts:12` → `import { buildIdempotencyModuleOptions, buildOutboxModuleOptions } from './events-toolkit-module.providers';`
  - `src/events-toolkit-module.imports.ts:35` → `export function isIdempotencyEnabled(idempotency?: EventsToolkitIdempotencyOptions): idempotency is EventsToolkitIdempotencyOptions {`
  - `src/testing/events-toolkit-test.module.ts:84` → `return [MockIdempotencyService, { provide: IdempotencyService, useExisting: MockIdempotencyService }];`
  - `src/testing/index.ts:17` → break the re-export into multiple lines.

### 6. Spec files exceed 200-line limit
- **Files:** `src/consumer/decorators/on-event.explorer.spec.ts` (~234 lines), `src/discovery/discovery.service.spec.ts` (~238 lines)
- **Problem:** The project rule `max-lines-per-file` applies to source files in `src/`. `discovery.service.spec.ts` may have already been over the limit before Task 2; `on-event.explorer.spec.ts` was pushed over by the new idempotency tests.
- **Fix:** Split the idempotency `describe` block into a new `on-event.explorer.idempotent.spec.ts` and split the capabilities `describe` block into a new `discovery.service.capabilities.spec.ts`.

### 7. `createOnEventExplorerDepsProvider` useFactory has 3 parameters
- **File:** `src/consumer/consumer-module.providers.ts`
- **Line:** 50-57
- **Problem:** The `useFactory` function has three positional parameters (`pair`, `consumerService`, `idempotencyService`), violating the project rule that methods/functions must have at most 2 parameters. The plan showed the same signature, so this was pre-approved by the plan, but it still conflicts with the rule.
- **Fix:** Encapsulate the dependencies in a single object. One option is to extend `DiscoveryReflectorPair` to include `consumerService` so the factory can accept `(consumerDiscoveryPair, idempotencyService)`. A less invasive option is to create an intermediate provider token:
  ```ts
  const CONSUMER_DISCOVERY_PAIR_TOKEN = 'CONSUMER_DISCOVERY_PAIR';

  export function createConsumerDiscoveryPairProvider(): Provider {
    return {
      provide: CONSUMER_DISCOVERY_PAIR_TOKEN,
      useFactory: (pair: DiscoveryReflectorPair, consumerService: ConsumerService) => ({ ...pair, consumerService }),
      inject: [DISCOVERY_REFLECTOR_PAIR, ConsumerService],
    };
  }

  export function createOnEventExplorerDepsProvider(): Provider {
    return {
      provide: ON_EVENT_EXPLORER_DEPS_TOKEN,
      useFactory: (consumerDiscoveryPair: ConsumerDiscoveryPair, idempotencyService?: IdempotencyService) => ({
        discovery: consumerDiscoveryPair.discovery,
        reflector: consumerDiscoveryPair.reflector,
        consumerService: consumerDiscoveryPair.consumerService,
        idempotencyService,
      }),
      inject: [CONSUMER_DISCOVERY_PAIR_TOKEN, { token: IdempotencyService, optional: true }],
    };
  }
  ```

### 8. Test name/expectation mismatch in `discovery.service.spec.ts`
- **File:** `src/discovery/discovery.service.spec.ts`
- **Line:** 222-226
- **Problem:** The test is named "defaults capabilities to [] when unset" but it explicitly sets `capabilities: []` and expects `undefined`. The name and expectation are inconsistent.
- **Fix:** If aligning with the plan (always assign `[]`), change the expectation to `toEqual([])` and keep the name. Otherwise rename the test to "omits capabilities when resolved array is empty".

## Conclusion

The implementation is functionally close to the plan. The most important fixes are:
1. Add the `ttlSeconds` parameter to `MockIdempotencyService.markAsProcessed`.
2. Add the missing handler-failure-then-success test.
3. Create the missing `events-toolkit.capabilities.spec.ts`.
4. Align `DiscoveryService.getOrGenerateManifest` with the plan's always-assign-capabilities behavior.
5. Run `npm run lint:fix` (or `npm run format`) to clear the Prettier errors.

After applying the fixes, re-run `npm run build`, `npm run lint`, `npm run test`, and `npm run typecheck`.
