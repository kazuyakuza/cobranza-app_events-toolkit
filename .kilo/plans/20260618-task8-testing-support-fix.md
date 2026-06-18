# Task 8 Testing Support — Code Review Fix Plan

## Review Summary

The testing support implementation for discovery provides useful mocks and assertion helpers, and all tests pass (496/496). However, two rule/API compliance issues need correction before approval:

1. `MockDiscoveryService` does not fully mirror the real `DiscoveryService` public API (missing NestJS lifecycle hooks), which breaks the test module's "drop-in replacement" guarantee.
2. `EventsToolkitTestModule.buildDiscoveryProviders` violates the max indentation-depth rule (3+ levels inside the method body).

Two lower-severity items are also noted for completeness: a behavioral gap in heartbeat payload options and missing test coverage for one helper.

## Issues Found

### 1. `MockDiscoveryService` does not implement the real `DiscoveryService` public API

- **Severity: High**
- **Files**: `src/testing/mock-discovery.service.ts`, `src/testing/events-toolkit-test.module.ts`
- **Details**:
  - Real `DiscoveryService` implements `OnModuleInit`, `OnApplicationBootstrap`, and `OnModuleDestroy`.
  - The mock exposes only `triggerStartup`, `triggerHeartbeat`, `triggerShutdown`, and `clear`.
  - `EventsToolkitTestModule` aliases `MockDiscoveryService` as the `DiscoveryService` token via `useExisting`, so application code injecting `DiscoveryService` receives the mock. Any consumer that invokes `onModuleInit`, `onApplicationBootstrap`, or `onModuleDestroy` will fail at runtime.
  - This contradicts the module's documented claim that "application code receives mocks transparently without any import changes."
- **Fix**:
  - Add `implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy` to `MockDiscoveryService`.
  - Implement the three lifecycle methods delegating to the existing trigger methods, respecting the `enabled` flag.
  - Keep `triggerStartup`, `triggerHeartbeat`, and `triggerShutdown` as explicit test-control methods.

### 2. `EventsToolkitTestModule.buildDiscoveryProviders` exceeds max indentation depth

- **Severity: Medium**
- **File**: `src/testing/events-toolkit-test.module.ts`
- **Details**:
  - The `useFactory` arrow function body is nested inside an object literal, inside an array literal, inside the method body — reaching 3–4 indentation levels.
  - Project rule: max 2 nested blocks per method; deeper nesting must be extracted into a separate method.
- **Fix**:
  - Extract the `MockDiscoveryService` provider object creation into a private static method.
  - Extract the factory function itself into a private static method to keep every method body at ≤ 2 indentation levels.
  - Ensure `EventsToolkitTestModuleOptions` is still passed correctly.

### 3. `MockDiscoveryEventPublisher` constructor does not mirror the real publisher constructor

- **Severity: Medium**
- **File**: `src/testing/mock-discovery-event-publisher.service.ts`
- **Details**:
  - Real constructor: `constructor(@Optional() producerService: ProducerService | null, @Inject(DISCOVERY_MODULE_OPTIONS) options: DiscoveryModuleOptions)`.
  - Mock constructor: `constructor(private readonly producer: MockProducerService)`.
  - Direct construction with real dependency shapes is not possible, weakening API parity.
- **Fix** (choose one):
  - Option A: Update the mock constructor to accept `ProducerService` and an optional `DiscoveryModuleOptions` object (defaulting `includeFullManifestInHeartbeat` to false), preserving the current simple behavior when options are omitted.
  - Option B: Document clearly that the mock constructor is intentionally simplified and only intended for use through `EventsToolkitTestModule`.
  - **Recommended**: Option A to maximize drop-in compatibility.

### 4. `MockDiscoveryEventPublisher.publishHeartbeat` ignores `includeFullManifestInHeartbeat`

- **Severity: Low**
- **File**: `src/testing/mock-discovery-event-publisher.service.ts`
- **Details**:
  - The real publisher conditionally embeds the full manifest in the heartbeat payload based on `DiscoveryModuleOptions.includeFullManifestInHeartbeat`.
  - The mock always omits the manifest, so tests cannot assert the full-manifest heartbeat behavior.
- **Fix**:
  - If Option A from issue 3 is adopted, use the injected options flag to decide whether to include `manifest` in the heartbeat payload.
  - If the constructor is kept simple, add a `setIncludeFullManifestInHeartbeat(boolean)` helper on the mock for test control.

### 5. Missing test coverage

- **Severity: Low**
- **Files**: `src/testing/discovery-assertion.helpers.spec.ts`, `src/testing/events-toolkit-test.module.spec.ts`
- **Details**:
  - `expectShutdownPublished` is defined in `discovery-assertion.helpers.ts` but has no test case.
  - The disabled-discovery test only asserts `ManifestService` is missing; it should also assert `DiscoveryService` and `DiscoveryEventPublisher` are not provided.
- **Fix**:
  - Add a test for `expectShutdownPublished`.
  - Extend the disabled-discovery test to verify `DiscoveryService` and `DiscoveryEventPublisher` throw when resolved.

## Implementation Steps

1. **Update `src/testing/mock-discovery.service.ts`**
   - Import `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy` from `@nestjs/common`.
   - Add `implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy`.
   - Add:
     - `onModuleInit(): void` — generate and cache manifest when enabled.
     - `onApplicationBootstrap(): Promise<void>` — delegate to `triggerStartup()`.
     - `onModuleDestroy(): void` — delegate to `triggerShutdown()` (using `void` to avoid unhandled-promise warnings).
   - Keep existing trigger and clear methods unchanged.
   - Add/update unit tests in `src/testing/mock-discovery.service.spec.ts` covering lifecycle hooks.

2. **Refactor `src/testing/events-toolkit-test.module.ts`**
   - Create `private static buildMockDiscoveryServiceProvider(options?: EventsToolkitTestModuleOptions): Provider`.
   - Create `private static buildMockDiscoveryServiceFactory(options?: EventsToolkitTestModuleOptions): (manifestService: MockManifestService, eventPublisher: MockDiscoveryEventPublisher) => MockDiscoveryService`.
   - Update `buildDiscoveryProviders` to call these helpers so no method body exceeds 2 indentation levels.
   - Verify `EventsToolkitTestModule.forRoot()` and `.forRoot({ discovery: { enabled: false } })` still pass.

3. **(Optional but recommended) Update `src/testing/mock-discovery-event-publisher.service.ts`**
   - Change constructor to accept `ProducerService` and optional `DiscoveryModuleOptions` (or a compatible options object).
   - Use the options flag to conditionally include the full manifest in heartbeat payloads.
   - Add a setter or factory option to configure `includeFullManifestInHeartbeat` for tests.
   - Update `src/testing/mock-discovery-event-publisher.service.spec.ts` with a full-manifest heartbeat test.

4. **Add missing tests**
   - In `src/testing/discovery-assertion.helpers.spec.ts`, add `expectShutdownPublished` tests.
   - In `src/testing/events-toolkit-test.module.spec.ts`, extend the disabled-discovery test to cover `DiscoveryService` and `DiscoveryEventPublisher`.

5. **Verification**
   - Run `npm run lint`.
   - Run `npm run typecheck`.
   - Run `npm run test -- --testPathPattern=src/testing`.
   - Confirm all checks pass.

## Acceptance Criteria

- `MockDiscoveryService` implements `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy`.
- No method in the reviewed files exceeds 2 indentation levels.
- All existing and new tests pass.
- `npm run lint` and `npm run typecheck` pass.
