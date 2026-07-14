# Simplification Plan: RequestReplyService Registration Fix

## Files Reviewed

1. `src/events-toolkit-module.providers.ts`
2. `src/events-toolkit.module.ts`
3. `src/events-toolkit-options.interface.ts`
4. `src/events-toolkit.module.spec.ts`
5. `CHANGELOG.md`

## Simplification Opportunities

### 1. `src/events-toolkit-module.providers.ts`

#### 1.1 Remove redundant wrapper in `buildAsyncOptionsProvider`

**Current:**

```ts
export function buildAsyncOptionsProvider(asyncOptions: EventsToolkitModuleAsyncOptions): Provider {
  return {
    provide: EVENTS_TOOLKIT_OPTIONS,
    useFactory: async (...args: unknown[]): Promise<EventsToolkitModuleOptions> => asyncOptions.useFactory(...args),
    inject: asyncOptions.inject ?? [],
  };
}
```

**Simplified:**

```ts
export function buildAsyncOptionsProvider(asyncOptions: EventsToolkitModuleAsyncOptions): Provider {
  return {
    provide: EVENTS_TOOLKIT_OPTIONS,
    useFactory: asyncOptions.useFactory,
    inject: asyncOptions.inject ?? [],
  };
}
```

**Estimated impact:** Low. Removes 1 line and an unnecessary `async` wrapper. Behavior unchanged because NestJS accepts both sync and async factory functions.

#### 1.2 Replace tuple cast with named parameters in `buildAsyncRequestReplyDepsProvider`

**Current:**

```ts
export function buildAsyncRequestReplyDepsProvider(): Provider {
  return {
    provide: REQUEST_REPLY_DEPS_TOKEN,
    useFactory: (...args: unknown[]): RequestReplyDeps => {
      const [natsConnection, producerService, logger, opts] = args as [
        NatsConnection,
        ProducerService,
        EventLoggerService,
        EventsToolkitModuleOptions,
      ];
      return {
        natsConnection,
        producerService,
        logger,
        config: resolveRequestReplyConfig(opts.requestReply),
      };
    },
    inject: [NATS_CONNECTION_TOKEN, ProducerService, EventLoggerService, EVENTS_TOOLKIT_OPTIONS],
  };
}
```

**Simplified:**

```ts
export function buildAsyncRequestReplyDepsProvider(): Provider {
  return {
    provide: REQUEST_REPLY_DEPS_TOKEN,
    useFactory: (
      natsConnection: NatsConnection,
      producerService: ProducerService,
      logger: EventLoggerService,
      opts: EventsToolkitModuleOptions,
    ): RequestReplyDeps => ({
      natsConnection,
      producerService,
      logger,
      config: resolveRequestReplyConfig(opts.requestReply),
    }),
    inject: [NATS_CONNECTION_TOKEN, ProducerService, EventLoggerService, EVENTS_TOOLKIT_OPTIONS],
  };
}
```

**Estimated impact:** Medium. Eliminates unsafe `unknown[]` cast and improves readability and type safety. Injection order is still verified by the `inject` array.

#### 1.3 Extract shared logger construction helper

`buildLoggingProvider` and `buildAsyncLoggingProvider` both build `EventLoggerOptions` from `logging` config and instantiate `EventLoggerService`.

**Action:** Introduce a private helper:

```ts
function buildEventLogger(logging?: EventsToolkitLoggingOptions): EventLoggerService {
  return logging ? new EventLoggerService({ level: logging.level, transports: logging.transports }) : new EventLoggerService();
}
```

Then:

```ts
export function buildLoggingProvider(options: EventsToolkitModuleOptions): Provider {
  return { provide: EventLoggerService, useValue: buildEventLogger(options.logging) };
}
```

```ts
export function buildAsyncLoggingProvider(): Provider {
  return {
    provide: EventLoggerService,
    useFactory: (opts: EventsToolkitModuleOptions): EventLoggerService => buildEventLogger(opts.logging),
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
}
```

**Estimated impact:** Low. Deduplicates logger construction logic and reduces risk of sync/async behavior drift.

### 2. `src/events-toolkit.module.ts`

No major simplification warranted. The file is 169 lines (under limit) and methods are short. The sync/async import builders are structurally similar but operate on resolved vs. deferred values, so unifying them would add indirection without benefit.

### 3. `src/events-toolkit-options.interface.ts`

No simplification warranted. File is clean and under all limits.

### 4. `src/events-toolkit.module.spec.ts`

#### 4.1 Split or reduce to comply with 200-line file limit

The file is currently 216 lines, violating the `max-lines-per-file` rule for `src/` files.

**Action options:**

- **Option A (preferred):** Move `forRootAsync` tests to a new file `src/events-toolkit.module.async.spec.ts` (leaving `forRoot` and `onModuleDestroy` tests in the original file).
- **Option B:** Extract repeated setup into helpers to reduce line count below 200.

**Estimated impact:** Medium. Restores compliance with project file-size rule and separates sync vs. async test concerns.

#### 4.2 Simplify `findProvider` helper

**Current:**

```ts
function findProvider(providers: Provider[] | undefined, token: unknown): Provider | undefined {
  return providers?.find((p): p is Provider & { provide: unknown } => {
    if (p === token) {
      return true;
    }
    return 'provide' in p && p.provide === token;
  });
}
```

**Simplified:**

```ts
function findProvider(providers: Provider[] | undefined, token: unknown): Provider | undefined {
  return providers?.find((p) => p === token || ('provide' in p && p.provide === token));
}
```

**Estimated impact:** Low. Removes nested block and unnecessary type predicate. Return type remains correct via inference.

#### 4.3 Simplify `getModuleName` helper

**Current:**

```ts
function getModuleName(imported: unknown): string | undefined {
  return (imported as { module?: { name?: string } }).module?.name;
}
```

**Simplified:**

```ts
function getModuleName(imported: unknown): string | undefined {
  const dynamicModule = imported as DynamicModule | undefined;
  return dynamicModule?.module?.name;
}
```

**Estimated impact:** Low. Uses existing `DynamicModule` import for clearer intent.

### 5. `CHANGELOG.md`

No simplification warranted. Documentation file is not subject to code style rules.

## Recommended Priority

1. **High:** Split/reduce `src/events-toolkit.module.spec.ts` to comply with the 200-line file limit.
2. **Medium:** Replace tuple cast with named parameters in `buildAsyncRequestReplyDepsProvider`.
3. **Low:** Simplify `buildAsyncOptionsProvider`, extract `buildEventLogger` helper, and simplify test helpers.
