# Idempotency Integration — Code Simplification Plan

**Scope:** Task 2 (Toolkit Integration, Consumer, Discovery & Testing), Step 4.3 — Code Simplification
**Date:** 2026-07-23

## Summary

The integration is clean and follows project conventions. This plan identifies 6 concrete simplifications that reduce duplication, flatten nesting, and make tests more maintainable. None of the changes alter runtime behavior.

---

## 1. Extract shared `resolveCapabilities` helper between sync and async paths

**Files:**
- `src/events-toolkit.module.ts`
- `src/events-toolkit-module.imports.ts`

**Current complexity:**
Both files contain almost identical capability-resolution logic:

```ts
// src/events-toolkit.module.ts
function resolveCapabilities(options: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(options.idempotency)) capabilities.push('idempotency');
  if (options.outbox) capabilities.push('outbox');
  return [...capabilities, ...(options.discovery?.capabilities ?? [])];
}
```

```ts
// src/events-toolkit-module.imports.ts
function resolveAsyncCapabilities(opts: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(opts.idempotency)) capabilities.push('idempotency');
  if (opts.outbox) capabilities.push('outbox');
  return [...capabilities, ...(opts.discovery?.capabilities ?? [])];
}
```

**Simplified version:**

Move the helper to `src/events-toolkit-module.imports.ts` (already home to `isIdempotencyEnabled`) and re-use it from `src/events-toolkit.module.ts`:

```ts
// src/events-toolkit-module.imports.ts
export function resolveCapabilities(options: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(options.idempotency)) capabilities.push('idempotency');
  if (options.outbox) capabilities.push('outbox');
  return [...capabilities, ...(options.discovery?.capabilities ?? [])];
}
```

```ts
// src/events-toolkit.module.ts
import {
  buildConsumerAsyncImport,
  buildOutboxAsyncImport,
  buildIdempotencyAsyncImport,
  buildDiscoveryAsyncImport,
  isIdempotencyEnabled,
  resolveCapabilities,
} from './events-toolkit-module.imports';

function buildDiscoveryOptions(options: EventsToolkitModuleOptions): EventsToolkitDiscoveryOptions {
  return {
    ...options.discovery,
    capabilities: resolveCapabilities(options),
  };
}
```

Then delete `resolveCapabilities` from `events-toolkit.module.ts` and rename/remove `resolveAsyncCapabilities` in `events-toolkit-module.imports.ts`. This removes ~10 lines of duplication and keeps the capability rule in one place.

---

## 2. Inline redundant wrapper method in `OnEventExplorer`

**File:** `src/consumer/decorators/on-event.explorer.ts`

**Current complexity:**

```ts
private getValidInstances(): object[] {
  const allWrappers = [...this.deps.discovery.getProviders(), ...this.deps.discovery.getControllers()];
  return allWrappers.filter((w) => this.isValidWrapper(w)).map((w) => w.instance as object);
}

private isValidWrapper(wrapper: { instance?: unknown }): boolean {
  return this.hasObjectInstance(wrapper);
}

private hasObjectInstance(wrapper: { instance?: unknown }): boolean {
  return wrapper.instance != null && typeof wrapper.instance === 'object';
}
```

`isValidWrapper` adds no value over `hasObjectInstance`.

**Simplified version:**

```ts
private getValidInstances(): object[] {
  const allWrappers = [...this.deps.discovery.getProviders(), ...this.deps.discovery.getControllers()];
  return allWrappers.filter((w) => this.hasObjectInstance(w)).map((w) => w.instance as object);
}

private hasObjectInstance(wrapper: { instance?: unknown }): boolean {
  return wrapper.instance != null && typeof wrapper.instance === 'object';
}
```

Delete `isValidWrapper`. This removes one method and one indirection layer.

---

## 3. Flatten capability overlay in `DiscoveryService.getOrGenerateManifest`

**File:** `src/discovery/discovery.service.ts`

**Current complexity:**

```ts
private getOrGenerateManifest(): ServiceManifestDto {
  if (this.cachedManifest) {
    return this.cachedManifest;
  }
  const baseManifest = this.manifestService.generateManifest(this.resolvedOptions.service);
  this.cachedManifest = this.merger.merge(baseManifest, this.contributors);
  const capabilities = this.resolvedOptions.capabilities ?? [];
  if (capabilities.length > 0) {
    this.cachedManifest.capabilities = capabilities;
  }
  return this.cachedManifest;
}
```

The conditional assignment is unnecessary because `capabilities` is always resolved to `[]` by `DiscoveryModule`, and assigning `[]` to an optional field is harmless. The early-return can also be expressed more concisely.

**Simplified version:**

```ts
private getOrGenerateManifest(): ServiceManifestDto {
  if (this.cachedManifest) {
    return this.cachedManifest;
  }
  const baseManifest = this.manifestService.generateManifest(this.resolvedOptions.service);
  this.cachedManifest = {
    ...this.merger.merge(baseManifest, this.contributors),
    capabilities: this.resolvedOptions.capabilities,
  };
  return this.cachedManifest;
}
```

This removes the local `capabilities` variable, the `if` block, and the `?? []` fallback (already guaranteed by `DiscoveryModule`). If the test asserting `capabilities` is `undefined` when the resolved array is empty must be preserved, keep the fallback `this.resolvedOptions.capabilities || undefined` instead.

---

## 4. Extract idempotency test-setup helper in `on-event.explorer.spec.ts`

**File:** `src/consumer/decorators/on-event.explorer.spec.ts`

**Current complexity:**
Every idempotent test repeats the same dependency construction:

```ts
const idempotencyService = createIdempotencyService();
const idempotentHandler = new IdempotentConsumer();
const localDeps: OnEventExplorerDeps = {
  discovery: discovery as unknown as DiscoveryService,
  reflector: new Reflector(),
  consumerService: new ConsumerService(),
  idempotencyService,
};
const idempotentExplorer = new OnEventExplorer(localDeps);

(discovery.getProviders as jest.Mock).mockReturnValue([{ instance: idempotentHandler }]);
(discovery.getControllers as jest.Mock).mockReturnValue([]);

idempotentExplorer.onModuleInit();

const handler = localDeps.consumerService.getHandler('company.*.billing.invoice.adjusted.v1');
expect(handler).toBeDefined();
```

**Simplified version:**

Add a helper in the spec file:

```ts
function createIdempotentExplorer(
  consumer: IdempotentConsumer,
  idempotencyService?: IdempotencyService,
): { explorer: OnEventExplorer; consumerService: ConsumerService } {
  const consumerService = new ConsumerService();
  const localDeps: OnEventExplorerDeps = {
    discovery: discovery as unknown as DiscoveryService,
    reflector: new Reflector(),
    consumerService,
    idempotencyService,
  };
  const explorer = new OnEventExplorer(localDeps);
  (discovery.getProviders as jest.Mock).mockReturnValue([{ instance: consumer }]);
  (discovery.getControllers as jest.Mock).mockReturnValue([]);
  explorer.onModuleInit();
  return { explorer, consumerService };
}
```

Tests then collapse to:

```ts
it('wraps handler with idempotency when idempotent:true and service present', async () => {
  const idempotencyService = createIdempotencyService();
  const idempotentHandler = new IdempotentConsumer();
  const { consumerService } = createIdempotentExplorer(idempotentHandler, idempotencyService);

  const handler = consumerService.getHandler('company.*.billing.invoice.adjusted.v1');
  const event = buildIdempotentEvent();
  const context = buildEventContext();

  await handler!(event, context);
  expect(idempotentHandler.invokeCount).toBe(1);

  await handler!(event, context);
  expect(idempotentHandler.invokeCount).toBe(1);
});
```

This removes ~25 lines of boilerplate across the four idempotency tests and makes their intent clearer.

---

## 5. Parameterize repetitive mock-service assertions in `events-toolkit-test.module.spec.ts`

**File:** `src/testing/events-toolkit-test.module.spec.ts`

**Current complexity:**
The first five tests are structurally identical:

```ts
it('provides MockProducerService as ProducerService', async () => {
  const module = await Test.createTestingModule({
    imports: [EventsToolkitTestModule.forRoot()],
  }).compile();

  const producer = module.get(ProducerService);
  expect(producer).toBeInstanceOf(MockProducerService);
});

it('provides MockConsumerService as ConsumerService', async () => {
  // ... same shape
});

// repeated for EventLoggerService, OutboxService, RequestReplyService
```

**Simplified version:**

Use `it.each` to collapse the five cases into one table-driven test:

```ts
it.each([
  { token: ProducerService, mock: MockProducerService },
  { token: ConsumerService, mock: MockConsumerService },
  { token: EventLoggerService, mock: MockEventLoggerService },
  { token: OutboxService, mock: MockOutboxService },
  { token: RequestReplyService, mock: MockRequestReplyService },
])('provides $mock.name as $token.name', async ({ token, mock }) => {
  const module = await Test.createTestingModule({
    imports: [EventsToolkitTestModule.forRoot()],
  }).compile();

  const service = module.get(token);
  expect(service).toBeInstanceOf(mock);
});
```

This removes ~30 lines and makes adding future mocks a one-line change.

---

## 6. Unify `buildExports` signature with `buildProviders` in `EventsToolkitTestModule`

**File:** `src/testing/events-toolkit-test.module.ts`

**Current complexity:**

```ts
static forRoot(options?: EventsToolkitTestModuleOptions): DynamicModule {
  const discoveryEnabled = options?.discovery?.enabled !== false;
  const idempotencyEnabled = options?.idempotency?.enabled !== false;
  return {
    module: EventsToolkitTestModule,
    global: true,
    providers: this.buildProviders(discoveryEnabled, options),
    exports: this.buildExports(discoveryEnabled, idempotencyEnabled),
  };
}

private static buildProviders(discoveryEnabled: boolean, options?: EventsToolkitTestModuleOptions): Provider[] { ... }

private static buildExports(discoveryEnabled: boolean, idempotencyEnabled: boolean): Type<unknown>[] { ... }
```

`buildProviders` receives `options` so it can read `idempotency.enabled` directly; `buildExports` receives a derived boolean instead, requiring `forRoot` to compute `idempotencyEnabled`. This split is inconsistent.

**Simplified version:**

Pass `options` to `buildExports` and compute both flags inside it:

```ts
static forRoot(options?: EventsToolkitTestModuleOptions): DynamicModule {
  const discoveryEnabled = options?.discovery?.enabled !== false;
  return {
    module: EventsToolkitTestModule,
    global: true,
    providers: this.buildProviders(discoveryEnabled, options),
    exports: this.buildExports(discoveryEnabled, options),
  };
}

private static buildExports(discoveryEnabled: boolean, options?: EventsToolkitTestModuleOptions): Type<unknown>[] {
  const exports: Type<unknown>[] = [
    MockProducerService, ProducerService,
    MockConsumerService, ConsumerService,
    MockEventLoggerService, EventLoggerService,
    MockOutboxService, OutboxService,
    MockRequestReplyService, RequestReplyService,
  ];
  if (options?.idempotency?.enabled !== false) {
    exports.push(MockIdempotencyService, IdempotencyService);
  }
  if (discoveryEnabled) {
    exports.push(MockManifestService, ManifestService);
    exports.push(MockDiscoveryService, DiscoveryService);
    exports.push(MockDiscoveryEventPublisher, DiscoveryEventPublisher);
  }
  return exports;
}
```

Then remove the local `idempotencyEnabled` variable from `forRoot`. This keeps option-derived gating consistent between providers and exports.

---

## 7. Clarify the "default capabilities" test in `discovery.service.spec.ts`

**File:** `src/discovery/discovery.service.spec.ts`

**Current complexity:**

```ts
it('defaults capabilities to [] when unset', () => {
  moduleOptions.capabilities = [];
  const manifest = service.getManifest();
  expect(manifest.capabilities).toBeUndefined();
});
```

The test name says "when unset" but the code explicitly sets `capabilities: []`. This is testing an implementation detail (the service omits empty arrays) rather than the default-resolution path in `DiscoveryModule`.

**Simplified version:**

Either rename the test to match the behavior:

```ts
it('omits capabilities from manifest when resolved array is empty', () => {
  moduleOptions.capabilities = [];
  const manifest = service.getManifest();
  expect(manifest.capabilities).toBeUndefined();
});
```

Or, if the goal is to test the default, assert it in `discovery.module.spec.ts` instead:

```ts
it('resolves capabilities to [] by default', () => {
  const module = DiscoveryModule.forRoot({});
  const optionsProvider = module.providers?.find(
    (p) => 'provide' in p && p.provide === DISCOVERY_MODULE_OPTIONS,
  );
  expect((optionsProvider as { useValue: DiscoveryModuleOptions }).useValue.capabilities).toEqual([]);
});
```

The rename is the lowest-risk fix and removes the misleading description.

---

## Suggested Priority

1. **High:** Simplification 1 (shared `resolveCapabilities`) — removes real duplication between sync/async paths.
2. **Medium:** Simplifications 2, 3, 4, 6 — reduce indirection and boilerplate.
3. **Low:** Simplifications 5, 7 — test-only cleanups.

---

## Notes

- No source files should be modified by this step; only the plan is produced.
- After applying simplifications, re-run `npm run typecheck` and `npm test` to verify behavior is preserved.
