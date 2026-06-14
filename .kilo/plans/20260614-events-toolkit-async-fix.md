# Fix Plan: EventsToolkitModule Async Registration

**Plan Date**: 2026-06-14
**Review Step**: 4.3 Code Review — Task 5 Final Polish & Configuration
**Branch**: `feat/outbox-logging-polish-finalization`
**Files Affected**: `src/events-toolkit.module.ts`, sub-module async interfaces, `src/events-toolkit.module.spec.ts` (new)

---

## Issues Found

### 1. `EventsToolkitModule.forRootAsync` exports nothing
**File**: `src/events-toolkit.module.ts` (line 91)

Current implementation returns `exports: []`. This breaks the public API contract: users registering the module asynchronously cannot inject `ProducerService`, `ConsumerService`, `OutboxService`, or `EventLoggerService`.

**Fix**: Set `exports` to `[ProducerService, ConsumerService, OutboxService, EventLoggerService]` to match `forRoot`.

---

### 2. `EventsToolkitModule.forRootAsync` only imports `ProducerModule`
**File**: `src/events-toolkit.module.ts` (lines 79–91)

The async variant is missing:
- `ConsumerModule.forRootAsync` (conditional on `consumer.enable !== false`).
- `OutboxModule.forRootAsync` (conditional on `options.outbox`).
- `EventLoggerService` override provider based on `options.logging`.

This makes `forRootAsync` functionally incomplete compared with `forRoot`.

**Fix**: Build the same conditional import list as `forRoot`, using each sub-module's `forRootAsync` method.

---

### 3. Duplicate/conflicting `JETSTREAM_TOKEN` provider
**File**: `src/events-toolkit.module.ts` (lines 65–76)

`forRootAsync` declares its own `JETSTREAM_TOKEN` provider and also imports `ProducerModule.forRootAsync`, which provides the same token. NestJS will see two providers for `JETSTREAM_TOKEN` in overlapping scopes, leading to unpredictable injection or startup errors.

**Fix**: Remove the top-level `jetStreamProvider` from `EventsToolkitModule.forRootAsync`. Let sub-modules own `JETSTREAM_TOKEN` resolution, or — preferably — resolve JetStream once and share it across sub-modules.

---

### 4. Multiple NATS connections created in async mode
**File**: `src/events-toolkit.module.ts` (async factory callbacks)

Because each sub-module resolves `asyncOptions.useFactory(...args)` independently and calls `resolveConnection(opts)`, using `nats.servers` in `forRootAsync` opens one connection per sub-module. Only the last resolved connection is tracked in the static `ownedConnection` field, leaving earlier connections leaked.

**Fix**: Resolve NATS connection exactly once in `forRootAsync`. Share the resulting `JetStreamClient` with `ProducerModule` and `ConsumerModule`. The cleanest way is to extend sub-module async options with an optional `useExisting` token:

- `ProducerModuleAsyncOptions.useExisting?: string | symbol | Type<unknown>` — use an existing `JetStreamClient` token instead of a factory.
- `ConsumerModuleAsyncOptions.useExisting?: string | symbol | Type<unknown>` — use an existing `JetStreamClient` token.
- `OutboxModuleAsyncOptions.useExisting?: string | symbol | Type<unknown>` — use an existing `OutboxModuleOptions` token.

Then `EventsToolkitModule.forRootAsync` can:
1. Provide `EVENTS_TOOLKIT_OPTIONS`.
2. Provide `JETSTREAM_TOKEN` via a single async factory that resolves NATS once and sets `ownedConnection`.
3. Import sub-modules with `useExisting: JETSTREAM_TOKEN` / `useExisting: EVENTS_TOOLKIT_OPTIONS`.

This keeps connection lifecycle centralized and avoids leaks.

---

### 5. Missing logging provider in async mode
**File**: `src/events-toolkit.module.ts`

`forRootAsync` does not call `buildLoggingProvider(options)`, so `options.logging` is ignored.

**Fix**: Add the logging provider to the `providers` array, using `EVENTS_TOOLKIT_OPTIONS` as an injected dependency in an async factory when logging is configured.

---

### 6. No unit tests for `EventsToolkitModule`
**File**: missing

There are no tests verifying `forRoot`, `forRootAsync`, option resolution, or module exports.

**Fix**: Create `src/events-toolkit.module.spec.ts` covering:
- `forRoot` returns a `DynamicModule` with expected imports/providers/exports.
- `forRoot` conditionally imports `ConsumerModule` and `OutboxModule`.
- `forRoot` closes an owned NATS connection on module destroy.
- `forRoot` does not close a user-provided NATS connection.
- `forRootAsync` returns expected exports.
- `forRootAsync` resolves JetStream once and shares it across sub-modules.
- `forRootAsync` applies logging options.

---

## Detailed Implementation Steps

### Step 1: Extend sub-module async options with `useExisting`

**Files**:
- `src/producer/producer.module.ts`
- `src/consumer/consumer.module.ts`
- `src/outbox/outbox.types.ts`

For each async options interface, add an optional `useExisting` field:

```ts
export interface ProducerModuleAsyncOptions {
  useExisting?: string | symbol | Type<unknown>;
  useFactory?: (...args: unknown[]) => Promise<ProducerModuleOptions> | ProducerModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}
```

If `useExisting` is provided, `forRootAsync` must create the JetStream provider with `useExisting` instead of `useFactory`. The factory path remains the default behavior.

Apply the same pattern to `ConsumerModuleAsyncOptions` and `OutboxModuleAsyncOptions`.

---

### Step 2: Refactor `EventsToolkitModule.forRootAsync`

**File**: `src/events-toolkit.module.ts`

Replace the current `forRootAsync` implementation with the following structure:

```ts
static forRootAsync(asyncOptions: EventsToolkitModuleAsyncOptions): DynamicModule {
  const optionsProvider: Provider = {
    provide: EVENTS_TOOLKIT_OPTIONS,
    useFactory: async (...args: unknown[]): Promise<EventsToolkitModuleOptions> =>
      asyncOptions.useFactory(...args),
    inject: asyncOptions.inject ?? [],
  };

  const jetStreamProvider: Provider = {
    provide: JETSTREAM_TOKEN,
    useFactory: async (opts: EventsToolkitModuleOptions): Promise<JetStreamClient> => {
      const resolved = await resolveConnection(opts);
      EventsToolkitModule.ownedConnection = resolved.owned ? resolved.connection : null;
      return resolved.jetStream;
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };

  const loggingProvider: Provider = buildAsyncLoggingProvider();

  const imports: DynamicModule[] = [
    ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN }),
  ];

  // Consumer and Outbox imports must be deferred to a factory that reads
  // EVENTS_TOOLKIT_OPTIONS because `imports` is resolved synchronously.
  // Use helper dynamic modules that inject EVENTS_TOOLKIT_OPTIONS and map
  // to sub-module options.
  imports.push(buildAsyncConsumerImport());
  imports.push(buildAsyncOutboxImport());

  return {
    module: EventsToolkitModule,
    imports: [...imports, ...(asyncOptions.imports ?? [])],
    providers: [optionsProvider, jetStreamProvider, loggingProvider],
    exports: [ProducerService, ConsumerService, OutboxService, EventLoggerService],
  };
}
```

**Notes**:
- `buildAsyncLoggingProvider`, `buildAsyncConsumerImport`, and `buildAsyncOutboxImport` should be extracted as module-level helpers to keep `forRootAsync` under the 50-line method limit.
- Each helper may inject `EVENTS_TOOLKIT_OPTIONS` and map to sub-module async options.

---

### Step 3: Add async helper builders

**File**: `src/events-toolkit.module.ts`

Add the following helpers next to the existing sync helpers:

```ts
function buildAsyncLoggingProvider(): Provider {
  return {
    provide: EventLoggerService,
    useFactory: async (opts: EventsToolkitModuleOptions): Promise<EventLoggerService> => {
      if (opts.logging) {
        return new EventLoggerService({
          level: opts.logging.level,
          transports: opts.logging.transports,
        });
      }
      return new EventLoggerService();
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
}

function buildAsyncConsumerImport(): DynamicModule {
  return ConsumerModule.forRootAsync({
    useExisting: JETSTREAM_TOKEN,
    imports: [
      {
        module: class EventsToolkitOptionsModule {},
        providers: [
          {
            provide: EVENTS_TOOLKIT_OPTIONS,
            useFactory: async (...args: unknown[]) => args[0] as EventsToolkitModuleOptions,
            inject: [EVENTS_TOOLKIT_OPTIONS],
          },
        ],
        exports: [EVENTS_TOOLKIT_OPTIONS],
      },
    ],
  });
}
```

> **Decision needed**: The inline `imports` trick above is verbose. A cleaner alternative is to extend `ConsumerModuleAsyncOptions` with an explicit `dlqSubjectBuilder` factory and `jetStreamToken`, and `OutboxModuleAsyncOptions` with a `mapFrom` factory. The exact API should be finalized before implementation.

Keep the helpers under the file line limit by extracting mapping logic into small, single-purpose functions.

---

### Step 4: Create `src/events-toolkit.module.spec.ts`

**File**: `src/events-toolkit.module.spec.ts` (NEW)

Cover sync and async registration. Use Jest mocks for NATS connection/JetStream.

Example test structure:

```ts
describe('EventsToolkitModule', () => {
  describe('forRoot', () => { ... });
  describe('forRootAsync', () => { ... });
  describe('onModuleDestroy', () => { ... });
});
```

Keep the spec file under 200 lines; split into separate `describe` blocks for clarity.

---

### Step 5: Run verification

- `npm run test -- src/events-toolkit.module.spec.ts`
- `npm run lint`
- `npm run build`

---

## Acceptance Criteria

- [ ] `EventsToolkitModule.forRootAsync` exports `ProducerService`, `ConsumerService`, `OutboxService`, and `EventLoggerService`.
- [ ] `EventsToolkitModule.forRootAsync` conditionally imports `ConsumerModule` (default enabled) and `OutboxModule`.
- [ ] `EventsToolkitModule.forRootAsync` applies `options.logging` to `EventLoggerService`.
- [ ] NATS connection is resolved exactly once in async mode.
- [ ] User-provided NATS connection is not closed on destroy; module-created connection is closed.
- [ ] No duplicate `JETSTREAM_TOKEN` providers.
- [ ] New unit tests pass.
- [ ] All files remain within line-count and method-length limits.
- [ ] No `git status` violations of `.gitignore`.

---

## Risk Notes

- Modifying sub-module async interfaces (`ProducerModuleAsyncOptions`, etc.) is a public API change. Ensure backwards compatibility by keeping `useExisting` optional and preserving the existing factory path.
- If the `useExisting` approach is rejected, an alternative is to duplicate sub-module providers inside `EventsToolkitModule.forRootAsync`, but that will likely violate the 200-line file limit and is discouraged.
