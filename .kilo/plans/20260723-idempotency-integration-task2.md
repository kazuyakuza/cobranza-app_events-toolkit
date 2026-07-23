# Plan — Idempotency Integration: Consumer, Discovery & Testing (TODO #7, Task 2)

> TODO: `.agent/todos/20260722/20260722-todo-2.md` — items **4 (Consumer integration)**,
> **5 (Discovery integration)**, **6 (Test & Testing support)**.
> Branch: `feat/idempotency-support` (already created during Task 1).
> Core idempotency module (`src/idempotency/`) is **complete** (commit `755e47d`).

---

## 1. High-Level Approach

Task 1 delivered the core `IdempotencyModule`/`IdempotencyService` and already wires it
into `EventsToolkitModule` (both `forRoot` and `forRootAsync`). Task 2 integrates it into
the three remaining subsystems:

1. **Consumer** — add an `idempotent?: boolean` flag to `@OnEvent()` options. When the flag is
   set **and** the `IdempotencyModule` is registered, the `OnEventExplorer` wraps each
   discovered handler with a duplicate-check + mark-as-processed layer. The wiring is
   **opt-in and optional**: if idempotency is disabled, the explorer keeps the current
   behavior; if the flag is absent, the handler runs unwrapped.

2. **Discovery** — add an optional `capabilities?: string[]` field to the service manifest
   and to discovery options. `EventsToolkitModule` populates `capabilities` based on which
   subsystems are enabled (`'idempotency'` and, for consistency, `'outbox'`). The field is
   purely informational metadata for the service registry; it requires no new providers.

3. **Testing** — add a `MockIdempotencyService` that mirrors `IdempotencyService`'s public
   API and tracks processed keys in a `Map`, plus expose it through the test module and the
   testing barrel. This mirrors the existing `MockOutboxService` pattern.

All changes respect the coding rules (max 200 lines/file, max 50 lines/method, max 2 depth,
max 2 params, private members by default, self-documenting code, single-section boolean
conditions, no commented code).

---

## 2. Technical Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| TD1 | Wire idempotency into the consumer via `OnEventExplorerDeps`, not via `JetStreamConsumerService`. | The explorer is where handlers are registered; wrapping at registration time keeps the consumer service thin and preserves the existing `ConsumerService.registerHandler` contract. |
| TD2 | Make `idempotencyService` in `OnEventExplorerDeps` **optional** and use `@Optional()` injection in the consumer providers. | The idempotency module may not be registered (omitted or `enabled: false`). Forcing it would break the consumer for services without idempotency. |
| TD3 | When `metadata.idempotent` is `true` but `deps.idempotencyService` is `undefined`, log a warning and register the **unwrapped** handler (no throw). | Failing fast would surprise users who enable the flag without configuring the module. A warning preserves the contract "flag is a no-op when idempotency is off". |
| TD4 | Wrapper uses `IdempotencyService.isDuplicate`/`markAsProcessed` rather than `executeIfNotProcessed`. | The explorer binds the handler `this` and must invoke `handler(event, context)` with the original arguments. `executeIfNotProcessed` wraps a zero-arg `() => Promise<T>`; replicating its semantics inline keeps the explorer handler signature intact. Marking occurs only on successful execution (handler throws → not marked, matching `executeIfNotProcessed`). |
| TD5 | Inject `IdempotencyService` into the `OnEventExplorerDeps` factory using `@Optional()`. | Ensures `undefined` (not a DI error) when the idempotency module is absent. Matches `DiscoveryService`'s `@Optional() @Inject(EventLoggerService)` pattern (`src/discovery/discovery.service.ts:27`). |
| TD6 | Duplicate-check key uses the existing `buildIdempotencyKey(event)` utility (`event.id:event.correlation_id`). | Consistent with `IdempotencyService.isDuplicate`; no new key derivation logic. |
| TD7 | Add `capabilities?: string[]` to `ServiceManifestDto`, `EventsToolkitDiscoveryOptions`, and `DiscoveryModuleOptions`. | Simplest, lowest-risk approach: pass-through metadata field. Avoids introducing a new `ManifestContributor` for toolkit-level static capabilities. Field is optional; default `[]` keeps existing manifests valid. |
| TD8 | Build the `capabilities` array in `EventsToolkitModule` (not in `DiscoveryModule`). | The toolkit module is the only place that knows whether idempotency/outbox are enabled. `DiscoveryModule` simply threads the options through. Preserves separation of concerns. |
| TD9 | Also add `['outbox']` to capabilities when the outbox is enabled. | TODO item 5 frames idempotency as the primary capability, but the task prompt explicitly requests outbox parity for consistency. Low-cost addition. |
| TD10 | `MockIdempotencyService` uses a `Map<string, boolean>` keyed by `buildIdempotencyKey(event)`. | Mirrors `MemoryIdempotencyRepository` semantics (overwrite on re-mark) and keeps the mock self-contained (no repository indirection needed for tests). |
| TD11 | Register `MockIdempotencyService` as a mock pair (`useExisting` alias to `IdempotencyService`) in `EventsToolkitTestModule`, following the `MockOutboxService` pattern. | Test consumers inject `IdempotencyService` and transparently get the mock; explicit access to `MockIdempotencyService` enables assertions. |
| TD12 | Default the idempotency mock in the test module options to `enabled: true`. | Matches the discovery-mock default and ensures services that injected `IdempotencyService` via Task 1 do not break in tests. Provide an opt-out via `EventsToolkitTestModuleOptions.idempotency.enabled`. |
| TD13 | Async (`forRootAsync`) discovery capabilities: resolve via `EVENTS_TOOLKIT_OPTIONS` in the existing `buildDiscoveryAsyncImport` factory. | The async import factory already receives `EventsToolkitModuleOptions`; computing capabilities there mirrors the sync path and requires no new tokens. |

---

## 3. File-by-File Detailed Plan

### 3.1 Consumer Integration

#### 3.1.1 `src/consumer/decorators/on-event.decorator.ts`
**Change:** Add optional `idempotent?: boolean` to both `OnEventOptions` and `OnEventMetadata`.

- In `OnEventOptions`, after `scope?: EventScope;`, add:
  ```ts
  /** When true and IdempotencyModule is registered, the explorer wraps this handler
   *  with a duplicate check so repeated delivery of the same event is skipped silently.
   *  No-op when the idempotency module is not configured. */
  idempotent?: boolean;
  ```
- In `OnEventMetadata`, after `scope?: EventScope;`, add the same `idempotent?: boolean;` field with the same JSDoc.
- `OnEvent()` factory already spreads `...options` into `OnEventMetadata`, so `idempotent` flows through with no body change. Verify the spread line: `const metadata: OnEventMetadata = { eventType, ...options };` — no edit needed.

**Max-params note:** `OnEvent` already has 2 params (eventType, options) — unchanged.

#### 3.1.2 `src/consumer/decorators/on-event-explorer-deps.interface.ts`
**Change:** Add optional `idempotencyService?: IdempotencyService` to `OnEventExplorerDeps`.

- Import: `import type { IdempotencyService } from '../../idempotency/idempotency.service';`
- Add to the interface:
  ```ts
  /** Idempotency service used to wrap handlers declared with `idempotent: true`.
   *  Optional — undefined when IdempotencyModule is not registered. */
  idempotencyService?: IdempotencyService;
  ```
- Keep all existing members (`discovery`, `reflector`, `consumerService`).

#### 3.1.3 `src/consumer/decorators/on-event.explorer.ts`
**Change:** Wrap the handler when `metadata.idempotent && deps.idempotencyService`.

Replace `tryRegisterHandler` (lines 68–79) with:

```ts
private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
  if (!descriptor) return;
  if (typeof descriptor.value !== 'function') return;
  const methodRef = descriptor.value as (...args: unknown[]) => unknown;
  const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
  if (!metadata) return;

  const handler = methodRef.bind(target.instance) as EventHandler;
  const subject = this.buildWildcardSubject(metadata);
  const finalHandler = this.resolveHandler(handler, metadata);
  this.deps.consumerService.registerHandler(subject, finalHandler);
}
```

Add two private helpers (each well under 50 lines, depth ≤ 2):

```ts
/** Returns the handler to register, wrapping it with idempotency when the
 *  decorator opted in and the idempotency service is available. */
private resolveHandler(handler: EventHandler, metadata: OnEventMetadata): EventHandler {
  if (!metadata.idempotent) return handler;
  if (!this.deps.idempotencyService) return handler;
  return this.wrapWithIdempotency(handler, this.deps.idempotencyService);
}

/** Wraps a handler so duplicate events are skipped and processed events are marked. */
private wrapWithIdempotency(handler: EventHandler, service: IdempotencyService): EventHandler {
  return async (event, context) => {
    if (await service.isDuplicate(event)) return;
    await handler(event, context);
    await service.markAsProcessed(event);
  };
}
```

Add imports at the top:
- `import { IdempotencyService } from '../../idempotency/idempotency.service';`
- `import { EventHandler } from '../consumer.service';` — already imported; keep.

**Depth/single-section compliance:** `if (!metadata.idempotent)` and `if (!this.deps.idempotencyService)` are single-section conditions. The async wrapper has depth 1 inside its body.

**File length check:** current file = 87 lines; additions ≈ 18 lines → ~105 lines. Under the 200-line limit. ✓

> Note (TD3 follow-up): If `idempotent` is set but `deps.idempotencyService` is undefined, the handler runs unwrapped silently. A log warning is intentionally omitted here to avoid coupling the explorer to `EventLoggerService`; the consumer providers factory can log once when wiring. Keep this scope minimal — the plan documents the no-op contract in the decorator JSDoc (3.1.1).

#### 3.1.4 `src/consumer/consumer-module.providers.ts`
**Change:** Inject `IdempotencyService` (optional) into `createOnEventExplorerDepsProvider`.

Update `createOnEventExplorerDepsProvider` (lines 39–49):

```ts
import { Optional } from '@nestjs/common'; // add to existing '@nestjs/common' import
import { IdempotencyService } from '../idempotency/idempotency.service'; // new import

/** Provider for @OnEvent() explorer dependencies. */
export function createOnEventExplorerDepsProvider(): Provider {
  return {
    provide: ON_EVENT_EXPLORER_DEPS_TOKEN,
    useFactory: (
      pair: DiscoveryReflectorPair,
      consumerService: ConsumerService,
      @Optional() idempotencyService?: IdempotencyService,
    ) => ({
      discovery: pair.discovery,
      reflector: pair.reflector,
      consumerService,
      idempotencyService,
    }),
    inject: [DISCOVERY_REFLECTOR_PAIR, ConsumerService, IdempotencyService],
  };
}
```

> NestJS resolves `@Optional()` metadata on a `useFactory` parameter by inspecting the
> parameter decorator. When `IdempotencyService` is not provided, Nest passes `undefined`
> for that injected token instead of throwing. This pattern is used elsewhere in the codebase
> (e.g. `@Optional() @Inject(EventLoggerService)` in `discovery.service.ts:27`). Verify the
> exact NestJS factory-optional syntax compiles during the build step; if `@Optional()` on a
> factory param is not honored, fall back to a manual `optional: true` flag via a dedicated
> provider: define `{ provide: 'IDEMPOTENCY_OPTIONAL', useFactory: (svc) => svc, inject: [IdempotencyService], optional: true }` and inject that token instead. The implementer MUST confirm
> the chosen approach compiles and passes typecheck (Step 6.3).

**File length check:** current = 192 lines; this change is net-neutral (+3 lines). Approaching but within the 200-line limit. If it exceeds, extract a new helper
`createOnEventExplorerDepsProvider` to a dedicated file — but per current line count it stays under. ✓ (Implementer must re-verify after the edit; if >200, move the function to a new `src/consumer/on-event-explorer-deps.provider.ts` and re-export, updating `consumer.module.ts` imports.)

---

### 3.2 Discovery Integration

#### 3.2.1 `src/discovery/dto/service-manifest.dto.ts`
**Change:** Add optional `capabilities?: string[]`.

```ts
export interface ServiceManifestDto {
  name: string;
  version: string;
  description: string;
  instanceId: string;
  consumes: ManifestConsumeEntry[];
  produces: ManifestProduceEntry[];
  /** Toolkit-level capabilities advertised by this service (e.g. 'idempotency', 'outbox').
   *  Populated by EventsToolkitModule based on which subsystems are enabled. */
  capabilities?: string[];
}
```

#### 3.2.2 `src/discovery/discovery-service-options.interface.ts`
**Change:** Add `capabilities?: string[]` to `EventsToolkitDiscoveryOptions`.

After the existing fields (before `service?`), add:
```ts
/** Capabilities advertised in the service manifest (e.g. 'idempotency', 'outbox').
 *  Typically populated automatically by EventsToolkitModule; pass manually only when
 *  registering DiscoveryModule standalone with custom capabilities. */
capabilities?: string[];
```

#### 3.2.3 `src/discovery/discovery.module.ts`
**Changes:**
- Add `capabilities: string[]` to `DiscoveryModuleOptions` (resolved shape) — required after resolution (default `[]`).
- Add `capabilities` to `resolveDiscoveryOptions`:
  ```ts
  capabilities: userOptions.capabilities ?? [],
  ```
- Update `DEFAULT_DISCOVERY_OPTIONS` to include `capabilities: [] as string[]`.

Updated `DiscoveryModuleOptions`:
```ts
export interface DiscoveryModuleOptions {
  enabled: boolean;
  registerOnStartup: boolean;
  heartbeatIntervalMinutes: number;
  includeFullManifestInHeartbeat: boolean;
  service: ServiceInfo;
  schemaDir: string;
  forceRegenerateSchemas: boolean;
  /** Resolved capabilities advertised in the manifest. */
  capabilities: string[];
}
```

#### 3.2.4 `src/discovery/manifest.service.ts`
**Change:** Include `capabilities` in the generated manifest DTO.

`generateManifest` currently builds the DTO without capabilities. Since `ManifestService`
does not directly access `DiscoveryModuleOptions` (it receives `ServiceInfo`), the cleanest
approach is to pass capabilities through the `ServiceInfo` caller path **or** extend
`ManifestServiceDeps`. To keep this minimal and avoid coupling `ManifestService` to discovery
options, **add an optional `capabilities` field to `ManifestServiceDeps`**

Review of `manifest-deps.interface.ts`:
```ts
export interface ManifestServiceDeps {
  discovery: DiscoveryService;
  reflector: Reflector;
  metadataScanner: MetadataScanner;
}
```

**Decision (TD7 refinement):** Rather than threading capabilities through the deps interface
(used heavily by `ManifestServiceDepsProvider`), set capabilities on the manifest at the
`DiscoveryService.getOrGenerateManifest()` layer, which already holds
`resolvedOptions.capabilities`.

Update `DiscoveryService.getOrGenerateManifest()` (lines 108–115):

```ts
private getOrGenerateManifest(): ServiceManifestDto {
  if (this.cachedManifest) return this.cachedManifest;
  const baseManifest = this.manifestService.generateManifest(this.resolvedOptions.service);
  this.cachedManifest = { ...baseManifest, capabilities: this.resolvedOptions.capabilities };
  return this.cachedManifest;
}
```

This keeps `ManifestService` unchanged (no new deps, no risk to the 200-line limit —
`manifest.service.ts` is already 121 lines) and places capability injection in the
already-responsible orchestrator. `ServiceManifestDto.capabilities` is optional, so
manifests generated directly by `MockManifestService` in tests remain valid (`undefined`
preserved).

**Single-section compliance:** the ternary `if (this.cachedManifest) return ...;` is single
section. The spread addition is a single expression. ✓

#### 3.2.5 `src/events-toolkit.module.ts` — sync path
**Change:** Pass computed `capabilities` to `DiscoveryModule.forRoot()`.

Update `buildSyncImports` (lines 132–134):

```ts
if (options.discovery?.enabled !== false) {
  imports.push(DiscoveryModule.forRoot(buildDiscoveryOptions(options)));
}
```

Add a private (module-level) helper function near `buildSyncImports`:

```ts
function buildDiscoveryOptions(options: EventsToolkitModuleOptions): EventsToolkitDiscoveryOptions {
  return {
    ...options.discovery,
    capabilities: resolveCapabilities(options),
  };
}

function resolveCapabilities(options: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(options.idempotency)) capabilities.push('idempotency');
  if (options.outbox) capabilities.push('outbox');
  return [...capabilities, ...(options.discovery?.capabilities ?? [])];
}
```

Import `isIdempotencyEnabled` is already present (from `.events-toolkit-module.imports`).
`EventsToolkitDiscoveryOptions` is already imported via `events-toolkit-options.interface`.

**Ordering note:** user-supplied `discovery.capabilities` are appended after auto-detected
ones; duplicates are acceptable (registry dedups). Keep it simple per single-section rule.

#### 3.2.6 `src/events-toolkit-module.imports.ts` — async path
**Change:** `buildDiscoveryAsyncImport` resolves capabilities via `EVENTS_TOOLKIT_OPTIONS`.

Update `buildDiscoveryAsyncImport` (lines 86–94):

```ts
import { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';
import { isIdempotencyEnabled } from './events-toolkit-module.imports'; // self — already here

export function buildDiscoveryAsyncImport(): DynamicModule {
  return DiscoveryModule.forRootAsync({
    useFactory: (...args: unknown[]) => {
      const opts = args[0] as EventsToolkitModuleOptions;
      return {
        ...opts.discovery,
        capabilities: resolveAsyncCapabilities(opts),
      } satisfies EventsToolkitDiscoveryOptions;
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}

function resolveAsyncCapabilities(opts: EventsToolkitModuleOptions): string[] {
  const capabilities: string[] = [];
  if (isIdempotencyEnabled(opts.idempotency)) capabilities.push('idempotency');
  if (opts.outbox) capabilities.push('outbox');
  return [...capabilities, ...(opts.discovery?.capabilities ?? [])];
}
```

> `isIdempotencyEnabled` is exported from this same file (line 22), so no new import needed.
> `EventsToolkitDiscoveryOptions` import must be added at the top of the file
> (`import type { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';`). The existing `import type { ... } from './events-toolkit-options.interface'` line already imports `EventsToolkitModuleOptions`, `EventsToolkitIdempotencyOptions` — extend it or add a new import line.

**File length check:** current = 94 lines; additions ≈ 18 lines → ~112 lines. Under 200. ✓

---

### 3.3 Testing Integration

#### 3.3.1 `src/testing/mock-idempotency.service.ts` (NEW FILE)
**Purpose:** In-memory mock mirroring `IdempotencyService` public API.

```ts
import { Injectable } from '@nestjs/common';
import type { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { buildIdempotencyKey } from '../idempotency/build-idempotency-key.util';
import { ExecuteIfNotProcessedParams } from '../idempotency/execute-if-not-processed-params.interface';

/**
 * In-memory mock for {@link IdempotencyService}.
 *
 * Tracks processed event keys in a `Map`. Skips duplicate events on
 * {@link executeIfNotProcessed} the same way the real service does. Use the
 * {@link clear} method to reset state between tests.
 *
 * @see {@link MockOutboxService} for the analogous outbox mock.
 */
@Injectable()
export class MockIdempotencyService {
  private readonly processed = new Map<string, boolean>();

  /** Returns true when the event key has been marked as processed. */
  async isDuplicate(event: AnyEventEnvelope<unknown>): Promise<boolean> {
    const key = buildIdempotencyKey(event);
    return this.processed.has(key);
  }

  /** Marks the event key as processed. Re-marking overwrites (matches MemoryIdempotencyRepository). */
  async markAsProcessed(event: AnyEventEnvelope<unknown>): Promise<void> {
    const key = buildIdempotencyKey(event);
    this.processed.set(key, true);
  }

  /** Executes the handler only when the event is not a duplicate, then marks it. */
  async executeIfNotProcessed<T>(params: ExecuteIfNotProcessedParams<T>): Promise<T | undefined> {
    if (await this.isDuplicate(params.event)) return undefined;
    const result = await params.handler();
    await this.markAsProcessed(params.event);
    return result;
  }

  /** Returns the set of processed event keys (for assertions). */
  get processedKeys(): ReadonlySet<string> {
    return new Set(this.processed.keys());
  }

  /** Number of processed event keys. */
  get count(): number {
    return this.processed.size;
  }

  /** Resets all tracked processed keys. */
  clear(): void {
    this.processed.clear();
  }
}
```

**Length:** ~55 lines. ✓  **Params:** `executeIfNotProcessed` takes a single params object. ✓
**Depth:** max 2. ✓  **Private members:** `processed` is private; accessors are read-only public.

#### 3.3.2 `src/testing/events-toolkit-test-options.interface.ts`
**Change:** Add optional idempotency test config.

```ts
export interface IdempotencyTestOptions {
  /** Whether to register idempotency mock services. Default: true. */
  enabled?: boolean;
}

export interface EventsToolkitTestModuleOptions {
  discovery?: DiscoveryTestOptions;
  /** Idempotency mock configuration. Omit for defaults (enabled: true). */
  idempotency?: IdempotencyTestOptions;
}
```

#### 3.3.3 `src/testing/events-toolkit-test.module.ts`
**Changes:**
- Import `MockIdempotencyService` and `IdempotencyService`.
- Add the mock pair to providers and exports, gated by `idempotency.enabled !== false`.

In `buildProviders`, add after the outbox pair (`MockOutboxService` / `OutboxService`):

```ts
if (options?.idempotency?.enabled !== false) {
  providers.push(...this.buildIdempotencyProviders());
}
```

Add the helper method:
```ts
private static buildIdempotencyProviders(): Provider[] {
  return [
    MockIdempotencyService,
    { provide: IdempotencyService, useExisting: MockIdempotencyService },
  ];
}
```

In `buildExports`, add:
```ts
if (options?.idempotency?.enabled !== false) {
  exports.push(MockIdempotencyService, IdempotencyService);
}
```

**Signature change:** `buildExports` currently takes only `discoveryEnabled`. To gate
idempotency, either:
- Pass `options` into `buildExports` (preferred) and read `options?.idempotency?.enabled !== false`.
- Or add a second boolean param `idempotencyEnabled`.

**Decision:** pass `options` (single-object param, respects max 2 params already used). Update
`buildExports(discoveryEnabled, options)` and the call site in `forRoot`.

Updated `forRoot`:
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
```

Update `buildExports(discoveryEnabled, idempotencyEnabled)`:
```ts
private static buildExports(discoveryEnabled: boolean, idempotencyEnabled: boolean): Type<unknown>[] {
  const exports: Type<unknown>[] = [
    MockProducerService, ProducerService,
    MockConsumerService, ConsumerService,
    MockEventLoggerService, EventLoggerService,
    MockOutboxService, OutboxService,
    MockRequestReplyService, RequestReplyService,
  ];
  if (idempotencyEnabled) {
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

Imports to add at top:
```ts
import { IdempotencyService } from '../idempotency/idempotency.service';
import { MockIdempotencyService } from './mock-idempotency.service';
```

**File length check:** current = 123 lines; additions ≈ 20 lines → ~143 lines. Under 200. ✓

#### 3.3.4 `src/testing/index.ts`
**Change:** Export `MockIdempotencyService` and `IdempotencyTestOptions`.

Add:
```ts
export { MockIdempotencyService } from './mock-idempotency.service';
```
And update the `EventsToolkitTestModuleOptions` re-export line to include `IdempotencyTestOptions`:
```ts
export { EventsToolkitTestModuleOptions, DiscoveryTestOptions, IdempotencyTestOptions } from './events-toolkit-test-options.interface';
```

---

## 4. Test Plan

All tests use Jest with `@jest/globals` (testing subpath). Run `npm test`.

### 4.1 New / Modified Specs

| Spec file | Status | Coverage |
|-----------|--------|----------|
| `src/consumer/decorators/on-event.explorer.spec.ts` | **Modify** | Add cases for `idempotent` flag wrapping. |
| `src/consumer/decorators/on-event.explorer.fixtures.ts` | **Modify** | Add `IdempotentConsumer` fixture with `idempotent: true`. |
| `src/testing/mock-idempotency.service.spec.ts` | **NEW** | Mock behavior parity. |
| `src/discovery/discovery.service.spec.ts` | **Modify** | Assert `capabilities` appears on manifest. |
| `src/testing/events-toolkit-test.module.spec.ts` (new or existing DI spec) | **NEW/MODIFY** | Assert `MockIdempotencyService` + `IdempotencyService` are provided. |
| `src/events-toolkit.module.di.spec.ts` (or new `events-toolkit.capabilities.spec.ts`) | **NEW** | End-to-end DI: `capabilities` resolved correctly for sync + async. |

### 4.2 Detailed Test Cases

**A. `on-event.explorer.spec.ts` — new `describe('idempotent flag')` block:**
- `it('wraps handler with idempotency when idempotent:true and service present')`:
  - Build `OnEventExplorerDeps` with a real `IdempotencyService` backed by
    `MemoryIdempotencyRepository` (no Nest runtime; construct manually like the existing
    `createDeps` helper already does).
  - Register `IdempotentConsumer` instance via mocked discovery.
  - Dispatch the **same event twice** through the registered handler and assert:
    - The handler body runs **once** (`handlerInvoked === 1`).
    - `idempotencyService.isDuplicate(event)` returns `true` on the second call.
- `it('does not wrap when idempotent:true but idempotencyService is undefined')`:
  - `createDeps` without `idempotencyService`.
  - Dispatch the same event twice → handler runs **twice** (no dedup).
- `it('does not wrap when idempotent flag is absent')`:
  - Existing `SampleConsumer` (no flag) + service present → handler runs each dispatch,
    `markAsProcessed` never called.
- `it('marks event as processed only when handler succeeds')`:
  - Handler throws on first call, succeeds on second.
  - First call rejects; `isDuplicate` returns `false` afterward (not marked).
  - Second call succeeds; `isDuplicate` returns `true` after.

**B. `on-event.explorer.fixtures.ts` — add:**
```ts
export class IdempotentConsumer {
  invokeCount = 0;
  @OnEvent('billing.invoice.adjusted', {
    version: '1',
    description: 'Handles invoice adjustments idempotently',
    payloadExample: { invoiceId: 'inv-1' },
    idempotent: true,
  })
  handleAdjusted(): void {
    this.invokeCount += 1;
  }
}
```

**C. `mock-idempotency.service.spec.ts` (NEW):**
- `isDuplicate` returns false initially, true after `markAsProcessed`.
- `markAsProcessed` keys by `event.id:correlation_id` (verify via two events).
- `executeIfNotProcessed`:
  - runs handler when not duplicate, marks, returns result.
  - returns `undefined` and skips handler when duplicate.
  - does NOT mark when handler throws.
- `clear` resets state; `count` and `processedKeys` reflect state.
- TTL param is accepted on `markAsProcessed` but ignored (mock does not honor TTL — document).

**D. `discovery.service.spec.ts` — modify:**
- Extend `createMockOptions` default to include `capabilities: []`.
- Add `it('includes capabilities on generated manifest')`: set
  `capabilities: ['idempotency', 'outbox']` on options, call `getManifest()`, assert
  `manifest.capabilities` equals the array.
- Add `it('defaults capabilities to [] when unset')` (after updating default to `[]`).

**E. `events-toolkit-test.module.spec.ts` (or new DI spec):**
- `it('provides MockIdempotencyService and aliases IdempotencyService to it')`:
  Compile test module with default options, inject both `MockIdempotencyService` and
  `IdempotencyService`, assert they are the same instance.
- `it('omits idempotency mocks when idempotency.enabled=false')`:
  `forRoot({ idempotency: { enabled: false } })` → injecting `IdempotencyService` should
  throw (Nest reports no provider). Use `expect(() => module.get(IdempotencyService)).toThrow()`.

**F. `events-toolkit.capabilities.spec.ts` (NEW, lightweight):**
- Unit-test `resolveCapabilities` / `resolveAsyncCapabilities` indirectly by inspecting the
  `DiscoveryModule.forRoot` options built. If those helpers are not exported, instead write
  an integration test: build a minimal `EventsToolkitModule.forRoot({ nats: {...}, idempotency:
  { type: 'memory', enabled: true }, outbox: { type: 'sqlite' } })`, then read the manifest via
  `DiscoveryService.getManifest()` and assert `capabilities` contains `'idempotency'` and
  `'outbox'`.
- Assert that omitting idempotency yields `capabilities` without `'idempotency'`.
- For the async path, replicate with `forRootAsync({ useFactory: () => ({...}) })`.

> If full `EventsToolkitModule.forRoot` requires a NATS connection, prefer a focused unit
> test on `buildDiscoveryOptions` by exporting it from `events-toolkit.module.ts`
> (or testing the resolved `DiscoveryModuleOptions` via the async factory injection). Keep
> the integration test within Jest's no-network constraints; `Connected` tests of NATS belong
> in e2e. Co-ordinate with the e2e config as needed.

### 4.3 Existing Tests That Must Still Pass
- `src/idempotency/*.spec.ts` (Task 1 suite) — unchanged behavior.
- `src/discovery/manifest.service.spec.ts` — `generateManifest` still omits capabilities
  (set at DiscoveryService layer), so existing assertions on the DTO are unaffected. Verify
  no test asserts the **absence** of `capabilities`; if one does, update it.
- `src/testing/mock-discovery.service.spec.ts` — confirm `getManifest()` returns capabilities
  from `MockManifestService`; since `MockDiscoveryService` builds the manifest via
  `MockManifestService.generateManifest` (no DiscoveryService-level overlay), capabilities
  will be `undefined` on the mock — existing tests asserting optional fields remain valid.

---

## 5. Build / Lint / Typecheck Steps

Run after implementation and after each file group:

1. `npm run build` — TypeScript compilation must succeed (catches `@Optional()` factory
   syntax issues from 3.1.4 first).
2. `npm run lint` — ESLint on `src/`.
3. `npm test` — full Jest suite (unit + integration without NATS).
4. (If available) `npm run typecheck` — defensive type check.

> The implementer MUST commit with meaningful messages after each cohesive group (consumer,
> discovery, testing) — not one giant commit. Suggested messages:
> - `feat(consumer): wrap idempotent @OnEvent handlers with IdempotencyService`
> - `feat(discovery): add capabilities to service manifest`
> - `feat(testing): add MockIdempotencyService and wire into test module`

---

## 6. Verification Checklist

### 6.1 TODO Alignment
- [x] TODO item 4 (Consumer integration): `@OnEvent(..., { idempotent: true })` triggers
      automatic idempotency when the module is registered; manual usage still available. ✓ (3.1)
- [x] TODO item 5 (Discovery): `'idempotency'` added to manifest `capabilities` when enabled. ✓ (3.2)
- [x] TODO item 6 (Testing): `MockIdempotencyService` created, exported via testing subpath,
      wired into `EventsToolkitTestModule`. ✓ (3.3)

### 6.2 Coding Rules
- [ ] No `src/` file exceeds 200 lines (re-verify `consumer-module.providers.ts`,
      `events-toolkit-test.module.ts`, `events-toolkit-module.imports.ts` after edits).
- [ ] No method body exceeds 50 lines.
- [ ] No nesting deeper than 2 levels.
- [ ] All methods have ≤ 2 params (object-encapsulated where more are needed).
- [ ] Members private by default; public only for the mock's assertion accessors and
      `IdempotencyService`/`MockIdempotencyService` public API.
- [ ] No commented-out code anywhere.
- [ ] Single-section boolean conditions (use extracted helpers `resolveHandler`,
      `resolveCapabilities`, etc.).
- [ ] Self-documenting names; JSDoc only where it adds value (capabilities, idempotent flag).

### 6.3 Compile / Runtime Safeguards
- [ ] `@Optional()` on `useFactory` parameter compiles and Nest resolves to `undefined` when
      `IdempotencyService` is absent. If not, apply the documented fallback provider (3.1.4).
- [ ] `IdempotencyService` injection does NOT break the consumer when `EventsToolkitModule`
      is configured without `idempotency` (existing `events-toolkit.module.di.spec.ts` still
      passes; add a case with `idempotency` omitted).
- [ ] `DiscoveryModule` standalone (imported without `EventsToolkitModule`) still works —
      `capabilities` defaults to `[]`.

### 6.4 Documentation (out of scope for Task 2 but flag)
- This task does **NOT** include documentation updates (TODO item 7 is a separate task).
- Do not modify `docs/`, `README.md`, or `CHANGELOG.md` in this step.
- The implementer should NOT touch `.agent/project-info/context.md` — that is updated at
  task-completion (4.6) and verification (4.5).

---

## 7. Out of Scope (Explicitly Excluded)

- TODO items 1–3 (core idempotency module) — already DONE.
- TODO item 7 (Documentation & Examples, CHANGELOG) — separate task; do not implement here.
- Postgres/SQLite repository logic — unchanged.
- `JetStreamConsumerService` internal changes — wrapper lives in the explorer only.
- `@OnRequestReply` idempotency flag — not requested in TODO item 4; the prompt scopes
  integration to `@OnEvent`. If desired later, mirror the 3.1 pattern in
  `on-request-reply.explorer.ts`.
- E2E NATS tests — unit/integration level only in this task.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `@Optional()` on a factory param is not Nest's documented API. | Build step validates early (5.1). Documented fallback provider in 3.1.4. |
| `consumer-module.providers.ts` exceeds 200 lines after edits. | Plan keeps it net-neutral; if exceeded, move `createOnEventExplorerDepsProvider` to its own file (noted in 3.1.4). |
| Existing discovery tests assert strict DTO shape (no `capabilities`). | Spec review (4.3) catches and updates any strict equality assertions. |
| Async capabilities resolution duplicates sync logic. | Both call small `resolveCapabilities` helpers (TD8); acceptable duplication given sync/async module separation (matches existing outbox/idempotency patterns). |
| Mock `markAsProcessed` ignores TTL param. | Documented in mock JSDoc; tests verify TTL is accepted (not applied). Mock parity is behavioral, not persistence-faithful. |

---

## 9. Summary of Files Touched

| File | Action |
|------|--------|
| `src/consumer/decorators/on-event.decorator.ts` | Edit — add `idempotent` to options + metadata |
| `src/consumer/decorators/on-event-explorer-deps.interface.ts` | Edit — add optional `idempotencyService` |
| `src/consumer/decorators/on-event.explorer.ts` | Edit — wrap handlers when idempotent |
| `src/consumer/consumer-module.providers.ts` | Edit — optional `IdempotencyService` injection |
| `src/discovery/dto/service-manifest.dto.ts` | Edit — add `capabilities?` |
| `src/discovery/discovery-service-options.interface.ts` | Edit — add `capabilities?` |
| `src/discovery/discovery.module.ts` | Edit — resolve `capabilities` into `DiscoveryModuleOptions` |
| `src/discovery/discovery.service.ts` | Edit — overlay `capabilities` on generated manifest |
| `src/events-toolkit.module.ts` | Edit — sync `buildDiscoveryOptions` + `resolveCapabilities` |
| `src/events-toolkit-module.imports.ts` | Edit — async `resolveAsyncCapabilities` in `buildDiscoveryAsyncImport` |
| `src/testing/mock-idempotency.service.ts` | **NEW** |
| `src/testing/events-toolkit-test-options.interface.ts` | Edit — add `IdempotencyTestOptions` |
| `src/testing/events-toolkit-test.module.ts` | Edit — register idempotency mock pair |
| `src/testing/index.ts` | Edit — export `MockIdempotencyService`, `IdempotencyTestOptions` |
| `src/consumer/decorators/on-event.explorer.fixtures.ts` | Edit — add `IdempotentConsumer` |
| `src/consumer/decorators/on-event.explorer.spec.ts` | Edit — add idempotency test block |
| `src/testing/mock-idempotency.service.spec.ts` | **NEW** spec |
| `src/discovery/discovery.service.spec.ts` | Edit — capabilities assertions |
| `src/testing/events-toolkit-test.module.spec.ts` | **NEW/MODIFY** — idempotency mock DI |
| `src/events-toolkit.capabilities.spec.ts` | **NEW** — capabilities resolution (sync + async) |

No source files outside this list are modified. No documentation files are touched in
this task.