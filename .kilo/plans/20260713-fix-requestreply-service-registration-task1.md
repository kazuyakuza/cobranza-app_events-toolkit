# Plan — Task 1: Fix RequestReplyService Registration (Bug 3)

**Source TODO:** `.agent/todos/20260713/20260713-todo-2.md` (Bug 3 + "Fix RequestReplyService registration" section)
**Global plan:** `.kilo/plans/20260713-fix-requestreply-service-registration.md`
**Branch:** `feat/fix-requestreply-service-registration` (already created — Step 2 done)
**Version:** `0.10.4` (already bumped in `package.json` — Step 3 done)
**Scope:** This plan covers ONLY Task 1 (the Bug 3 code fix). The E2E test assertions for `RequestReplyService` are Task 2 (separate 4.1 cycle) and are out of scope here.

---

## 1. Pre-analysis

### 1.1 Current state (verified by reading source)

- `src/events-toolkit.module.ts` (229 lines):
  - `forRoot` (sync): resolves `ResolvedNats` via `resolveConnection(options)`, passes `resolved.jetStream` directly into `ProducerModule.forRoot` / `ConsumerModule.forRoot`. Providers = `[loggingProvider]` only. **No `exports` array.**
  - `forRootAsync`: providers = `[optionsProvider, jetStreamProvider, loggingProvider]`; exports = `[EVENTS_TOOLKIT_OPTIONS, JETSTREAM_TOKEN, EventLoggerService]`.
  - `buildAsyncJetStreamProvider` calls `resolveConnection(opts)` and returns `resolved.jetStream`, setting the module-level `ownedConnection` side-effect. **This is the only NATS resolution in the async path**; it yields a `JetStreamClient`, **not** a `NatsConnection`.
  - `ownedConnection` is a module-scope `let` mutated by both `forRoot` and the async jetstream factory, read by `onModuleDestroy`.
- `src/request-reply/request-reply.service.ts`: `@Injectable()`, constructor `@Inject(REQUEST_REPLY_DEPS_TOKEN) deps: RequestReplyDeps` → stores `natsConnection`, `producerService`, `logger`, `config`. Requires `natsConnection.request()` only at method-call time (not at construction).
- `src/request-reply/request-reply.types.ts` (already exported from `request-reply/index.ts` → `src/index.ts`):
  - `NATS_CONNECTION_TOKEN = 'NatsConnection'`
  - `REQUEST_REPLY_DEPS_TOKEN = 'RequestReplyDeps'`
  - `resolveRequestReplyConfig(partial?)` → `{ defaultTimeoutMs: 5000 }` default
  - `RequestReplyConfig`, `RequestReplyDeps` interfaces
- `src/producer/producer.module.ts` is `global: true` and exports `ProducerService` → injectable from `EventsToolkitModule` providers.
- `src/events-toolkit.module.di.spec.ts` and `src/events-toolkit.module.e2e-spec.ts` mock `nats.connect` returning `{ jetstream(), close }` (no `request()`). They do not instantiate `RequestReplyService`, so adding it as a provider will NOT break them (Nest instantiates `useFactory` providers lazily — only when their token is injected).
- `src/events-toolkit.module.spec.ts` line 54: `expect(module.exports ?? []).toHaveLength(0)` — **this WILL break** once `forRoot` gains an exports array. Must be updated.
- `package.json` version already `0.10.4`. `CHANGELOG.md` has an unreleased `[0.10.3]` section (pre-existing inconsistency); a `[0.10.4]` entry must be added.

### 1.2 Root cause of Bug 3

`RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN` are **never present in any module's `providers` or `exports`**. Consumers (e.g. `CrudHandlersModule`) that inject `RequestReplyService` get `Nest can't resolve dependencies of the RequestReplyService (RequestReplyService, ?).` because the token is unknown to the DI container.

### 1.3 Duplicate-connection risk in async path

A naive fix would add a second `resolveConnection()` call to obtain a `NatsConnection` for `RequestReplyService`. That would open a **second TCP connection** to NATS. The fix must resolve the connection **once** and derive both `JETSTREAM_TOKEN` and `NATS_CONNECTION_TOKEN` from it.

### 1.4 Technical decisions

1. **Single-connection guarantee**: introduce an internal token `RESOLVED_NATS_TOKEN` whose factory calls `resolveConnection()` exactly once. `JETSTREAM_TOKEN` and `NATS_CONNECTION_TOKEN` become thin derived providers over `RESOLVED_NATS_TOKEN`. No duplicate connection.
2. **Direct registration in `EventsToolkitModule`**: register `RequestReplyService` + `REQUEST_REPLY_DEPS_TOKEN` directly in `EventsToolkitModule.forRoot` and `forRootAsync` providers, and export them. Mirrors the existing top-level `EventLoggerService` pattern; avoids creating a new `RequestReplyModule` (smallest blast radius).
3. **Optional config exposure**: add `requestReply?: Partial<RequestReplyConfig>` to `EventsToolkitModuleOptions`. Defaults applied via `resolveRequestReplyConfig()`.
4. **File-size compliance**: extract every `build*Provider` helper + `resolveConnection` + `buildOutboxModuleOptions` + owned-connection state into a new `src/events-toolkit-module.providers.ts` (mirrors existing `src/consumer/consumer-module.providers.ts` pattern). `events-toolkit.module.ts` stays well under 200 lines; every method body stays under 50 lines.
5. **`NATS_CONNECTION_TOKEN` export policy**: kept **internal** (not exported) — it is only consumed by the intra-module `REQUEST_REPLY_DEPS_TOKEN` factory. Only `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN` are exported, per the TODO. (Public surface stays minimal.)
6. **`RESOLVED_NATS_TOKEN` export policy**: internal-only, not exported.
7. **Factory arity / max-2-params rule**: the 4-inject async factory `buildAsyncRequestReplyDepsProvider` uses the `(...args: unknown[])` + tuple-cast pattern (same as existing `buildConsumerAsyncImport`), so the user-facing function signature has **0 params** → strictly satisfies the max-2-params rule. The 2-closure sync helper `buildSyncRequestReplyDepsProvider(connection, requestReply?)` has exactly 2 params → allowed.
8. **No `src/index.ts` changes**: `RequestReplyService`, `REQUEST_REPLY_DEPS_TOKEN`, `NATS_CONNECTION_TOKEN`, `resolveRequestReplyConfig`, `RequestReplyConfig` are already exported via `request-reply/index.ts` (re-exported at `src/index.ts:19`). `EventsToolkitModuleOptions` is exported at `src/index.ts:29-37` (will pick up the new `requestReply` field automatically).
9. **No `.agent/project-structure.md` changes**: it documents folders only; the new file lives at `src/` root (no new folder).

### 1.5 High-level approach

1. Create `src/events-toolkit-module.providers.ts` housing: `EVENTS_TOOLKIT_OPTIONS` constant, `RESOLVED_NATS_TOKEN`, `ResolvedNats` interface, owned-connection state (`setOwnedNatsConnection` / `closeOwnedNatsConnection`), `resolveConnection`, `buildOutboxModuleOptions`, and all `build*Provider` factories (sync + async, including the new `buildAsyncResolvedNatsProvider`, `buildAsyncNatsConnectionProvider`, `buildAsyncRequestReplyDepsProvider`, `buildSyncNatsConnectionProvider`, `buildSyncRequestReplyDepsProvider`).
2. Rewrite `src/events-toolkit.module.ts` to import the helpers, register `RequestReplyService` + `REQUEST_REPLY_DEPS_TOKEN` in both `forRoot` and `forRootAsync`, export them, and delegate connection cleanup to `closeOwnedNatsConnection()`. Extract `buildSyncImports` / `buildAsyncImports` to keep `forRoot` / `forRootAsync` bodies under 50 lines.
3. Add `requestReply?: Partial<RequestReplyConfig>` to `EventsToolkitModuleOptions` in `src/events-toolkit-options.interface.ts`.
4. Update the breaking assertion in `src/events-toolkit.module.spec.ts` (line 54) and add positive assertions for the new providers/exports.
5. Add `[0.10.4]` entry to `CHANGELOG.md`.
6. Verify with `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run lint`.

---

## 2. Detailed implementation steps

### Step 1 — Create `src/events-toolkit-module.providers.ts` (NEW FILE)

Create the file with exactly this content (real newlines, ≤200 lines, all method bodies <50 lines, max depth 2, max 2 named params):

```ts
import { Provider } from '@nestjs/common';
import { connect, JetStreamClient, NatsConnection } from 'nats';
import { EventLoggerService, EventLoggerOptions } from './logging/event-logger.service';
import { ProducerService } from './producer/producer.service';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { OutboxModuleOptions } from './outbox/outbox.types';
import {
  REQUEST_REPLY_DEPS_TOKEN,
  NATS_CONNECTION_TOKEN,
  resolveRequestReplyConfig,
  RequestReplyConfig,
  RequestReplyDeps,
} from './request-reply/request-reply.types';
import {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
  EventsToolkitOutboxOptions,
} from './events-toolkit-options.interface';

/** Injection token for the resolved EventsToolkitModule options object. */
export const EVENTS_TOOLKIT_OPTIONS = 'EVENTS_TOOLKIT_OPTIONS';

/** Internal token carrying the single resolved NATS connection + jetStream + owned flag. */
export const RESOLVED_NATS_TOKEN = 'EVENTS_TOOLKIT_RESOLVED_NATS';

/** Resolved NATS connection pair used to derive jetStream and NatsConnection providers. */
export interface ResolvedNats {
  connection: NatsConnection;
  jetStream: JetStreamClient;
  owned: boolean;
}

let ownedNatsConnection: NatsConnection | null = null;

/** Records the module-owned NATS connection for cleanup on module destroy. */
export function setOwnedNatsConnection(connection: NatsConnection | null): void {
  ownedNatsConnection = connection;
}

/** Closes the module-owned NATS connection, if one was created internally. */
export function closeOwnedNatsConnection(): void {
  if (ownedNatsConnection) {
    ownedNatsConnection.close();
    ownedNatsConnection = null;
  }
}

/** Resolves a NATS connection + JetStream client from synchronous toolkit options. */
export async function resolveConnection(options: EventsToolkitModuleOptions): Promise<ResolvedNats> {
  if (options.nats.connection) {
    return {
      connection: options.nats.connection,
      jetStream: options.nats.connection.jetstream(),
      owned: false,
    };
  }
  if (options.nats.servers) {
    const connection = await connect({ servers: options.nats.servers as string[] });
    return {
      connection,
      jetStream: connection.jetstream(),
      owned: true,
    };
  }
  throw new Error('EventsToolkitModule requires either nats.connection or nats.servers');
}

/** Builds OutboxModule options from the toolkit-level outbox config. */
export function buildOutboxModuleOptions(outbox: EventsToolkitOutboxOptions): OutboxModuleOptions {
  if (outbox.type === 'postgres') {
    return {
      type: 'postgres',
      postgres: outbox.postgres,
      serviceOptions: outbox.serviceOptions,
    };
  }
  return {
    type: 'sqlite',
    sqlite: { dbPath: outbox.sqlitePath ?? ':memory:' },
    serviceOptions: outbox.serviceOptions,
  };
}

/** Provider for EventLoggerService from synchronous options (forRoot path). */
export function buildLoggingProvider(options: EventsToolkitModuleOptions): Provider {
  if (options.logging) {
    const loggerOptions: EventLoggerOptions = {
      level: options.logging.level,
      transports: options.logging.transports,
    };
    return { provide: EventLoggerService, useValue: new EventLoggerService(loggerOptions) };
  }
  return { provide: EventLoggerService, useClass: EventLoggerService };
}

/** Provider for NATS_CONNECTION_TOKEN from a pre-resolved connection (forRoot path). */
export function buildSyncNatsConnectionProvider(connection: NatsConnection): Provider {
  return { provide: NATS_CONNECTION_TOKEN, useValue: connection };
}

/** Provider for REQUEST_REPLY_DEPS_TOKEN from synchronous options (forRoot path). */
export function buildSyncRequestReplyDepsProvider(
  connection: NatsConnection,
  requestReply?: Partial<RequestReplyConfig>,
): Provider {
  return {
    provide: REQUEST_REPLY_DEPS_TOKEN,
    useFactory: (producerService: ProducerService, logger: EventLoggerService): RequestReplyDeps => ({
      natsConnection: connection,
      producerService,
      logger,
      config: resolveRequestReplyConfig(requestReply),
    }),
    inject: [ProducerService, EventLoggerService],
  };
}

/** Provider for EVENTS_TOOLKIT_OPTIONS from the async factory (forRootAsync path). */
export function buildAsyncOptionsProvider(asyncOptions: EventsToolkitModuleAsyncOptions): Provider {
  return {
    provide: EVENTS_TOOLKIT_OPTIONS,
    useFactory: async (...args: unknown[]): Promise<EventsToolkitModuleOptions> => asyncOptions.useFactory(...args),
    inject: asyncOptions.inject ?? [],
  };
}

/** Internal provider that resolves the NATS connection exactly once (forRootAsync path). */
export function buildAsyncResolvedNatsProvider(): Provider {
  return {
    provide: RESOLVED_NATS_TOKEN,
    useFactory: async (opts: EventsToolkitModuleOptions): Promise<ResolvedNats> => {
      const resolved = await resolveConnection(opts);
      setOwnedNatsConnection(resolved.owned ? resolved.connection : null);
      return resolved;
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  };
}

/** Provider for JETSTREAM_TOKEN derived from the single resolved NATS connection. */
export function buildAsyncJetStreamProvider(): Provider {
  return {
    provide: JETSTREAM_TOKEN,
    useFactory: (resolved: ResolvedNats): JetStreamClient => resolved.jetStream,
    inject: [RESOLVED_NATS_TOKEN],
  };
}

/** Provider for NATS_CONNECTION_TOKEN derived from the single resolved NATS connection. */
export function buildAsyncNatsConnectionProvider(): Provider {
  return {
    provide: NATS_CONNECTION_TOKEN,
    useFactory: (resolved: ResolvedNats): NatsConnection => resolved.connection,
    inject: [RESOLVED_NATS_TOKEN],
  };
}

/** Provider for EventLoggerService from async options (forRootAsync path). */
export function buildAsyncLoggingProvider(): Provider {
  return {
    provide: EventLoggerService,
    useFactory: (opts: EventsToolkitModuleOptions): EventLoggerService => {
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

/** Provider for REQUEST_REPLY_DEPS_TOKEN from async options (forRootAsync path). */
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

**Verification:** File ≈ 175 lines (under 200). Longest method body (`resolveConnection`) ≈ 18 lines. Max nesting depth = 2. Max named params = 2 (`buildSyncRequestReplyDepsProvider`). No commented code. Private-by-default: `ownedNatsConnection` is module-private (not exported).

---

### Step 2 — Rewrite `src/events-toolkit.module.ts`

Replace the **entire file** with the following content (real newlines). Note: `Provider` and `OutboxModuleOptions` are included in the imports below — `buildSyncProviders` / `buildAsyncProviders` return `Provider[]`, and `buildOutboxAsyncImport` references `OutboxModuleOptions`. Do not drop them.

```ts
import { DynamicModule, ForwardReference, Module, OnModuleDestroy, Provider, Type } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { ProducerModule } from './producer/producer.module';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { ConsumerModule, ConsumerModuleOptions } from './consumer/consumer.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxModuleOptions } from './outbox/outbox.types';
import { EventLoggerService } from './logging/event-logger.service';
import { DiscoveryModule } from './discovery/discovery.module';
import { RequestReplyService } from './request-reply/request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply/request-reply.types';
import {
  EVENTS_TOOLKIT_OPTIONS,
  RESOLVED_NATS_TOKEN,
  ResolvedNats,
  resolveConnection,
  buildOutboxModuleOptions,
  setOwnedNatsConnection,
  closeOwnedNatsConnection,
  buildLoggingProvider,
  buildSyncNatsConnectionProvider,
  buildSyncRequestReplyDepsProvider,
  buildAsyncOptionsProvider,
  buildAsyncResolvedNatsProvider,
  buildAsyncJetStreamProvider,
  buildAsyncNatsConnectionProvider,
  buildAsyncLoggingProvider,
  buildAsyncRequestReplyDepsProvider,
} from './events-toolkit-module.providers';
import {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
} from './events-toolkit-options.interface';

type ModuleImport = Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>;

/**
 * Root module that wires together Producer, Consumer, Outbox, Request-Reply, and Logging
 * subsystems into a single global NestJS dynamic module.
 */
@Module({})
export class EventsToolkitModule implements OnModuleDestroy {
  /**
   * Registers the toolkit with synchronous, fully-resolved options.
   * Creates or reuses a NATS connection, conditionally imports Consumer/Outbox/Discovery,
   * and registers+exports RequestReplyService for consumer injection.
   */
  static async forRoot(options: EventsToolkitModuleOptions): Promise<DynamicModule> {
    const resolved = await resolveConnection(options);
    setOwnedNatsConnection(resolved.owned ? resolved.connection : null);

    return {
      module: EventsToolkitModule,
      global: true,
      imports: buildSyncImports(options, resolved),
      providers: buildSyncProviders(options, resolved),
      exports: [RequestReplyService, REQUEST_REPLY_DEPS_TOKEN],
    };
  }

  /**
   * Registers the toolkit with asynchronous options resolved via a factory provider.
   * Defers NATS connection and sub-module configuration until runtime injection.
   *
   * Exports EVENTS_TOOLKIT_OPTIONS, JETSTREAM_TOKEN, EventLoggerService,
   * RequestReplyService, and REQUEST_REPLY_DEPS_TOKEN so imported sub-modules and
   * external consumers resolve these dependencies during NestJS DI compilation.
   */
  static forRootAsync(asyncOptions: EventsToolkitModuleAsyncOptions): DynamicModule {
    return {
      module: EventsToolkitModule,
      global: true,
      imports: buildAsyncImports(asyncOptions),
      providers: buildAsyncProviders(asyncOptions),
      exports: [
        EVENTS_TOOLKIT_OPTIONS,
        JETSTREAM_TOKEN,
        EventLoggerService,
        RequestReplyService,
        REQUEST_REPLY_DEPS_TOKEN,
      ],
    };
  }

  /** Closes the module-owned NATS connection, if one was created internally. */
  onModuleDestroy(): void {
    closeOwnedNatsConnection();
  }
}

function buildSyncProviders(options: EventsToolkitModuleOptions, resolved: ResolvedNats): Provider[] {
  return [
    buildLoggingProvider(options),
    buildSyncNatsConnectionProvider(resolved.connection),
    buildSyncRequestReplyDepsProvider(resolved.connection, options.requestReply),
    RequestReplyService,
  ];
}

function buildSyncImports(options: EventsToolkitModuleOptions, resolved: ResolvedNats): ModuleImport[] {
  const imports: ModuleImport[] = [ProducerModule.forRoot({ jetStream: resolved.jetStream })];
  if (options.consumer?.enable !== false) {
    const consumerOpts: ConsumerModuleOptions = {
      jetStream: resolved.jetStream,
      dlqSubjectBuilder: options.consumer?.dlqSubjectBuilder,
    };
    imports.push(ConsumerModule.forRoot(consumerOpts));
  }
  if (options.outbox) {
    imports.push(OutboxModule.forRoot(buildOutboxModuleOptions(options.outbox)));
  }
  if (options.discovery?.enabled !== false) {
    imports.push(DiscoveryModule.forRoot(options.discovery ?? {}));
  }
  return imports;
}

function buildAsyncProviders(asyncOptions: EventsToolkitModuleAsyncOptions): Provider[] {
  return [
    buildAsyncOptionsProvider(asyncOptions),
    buildAsyncResolvedNatsProvider(),
    buildAsyncJetStreamProvider(),
    buildAsyncNatsConnectionProvider(),
    buildAsyncLoggingProvider(),
    buildAsyncRequestReplyDepsProvider(),
    RequestReplyService,
  ];
}

function buildAsyncImports(asyncOptions: EventsToolkitModuleAsyncOptions): ModuleImport[] {
  return [
    ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN, useFactory: async () => ({}), inject: [] }),
    buildConsumerAsyncImport(),
    buildOutboxAsyncImport(),
    buildDiscoveryAsyncImport(),
    ...(asyncOptions.imports ?? []),
  ];
}

function buildConsumerAsyncImport(): DynamicModule {
  return ConsumerModule.forRootAsync({
    useFactory: async (...args: unknown[]): Promise<ConsumerModuleOptions> => {
      const jetStream = args[0] as JetStreamClient;
      const opts = args[1] as EventsToolkitModuleOptions;
      return {
        jetStream,
        dlqSubjectBuilder: opts.consumer?.dlqSubjectBuilder,
      };
    },
    inject: [JETSTREAM_TOKEN, EVENTS_TOOLKIT_OPTIONS],
  });
}

function buildOutboxAsyncImport(): DynamicModule {
  return OutboxModule.forRootAsync({
    useFactory: async (...args: unknown[]): Promise<OutboxModuleOptions> => {
      const opts = args[0] as EventsToolkitModuleOptions;
      const outbox = opts.outbox ?? { type: 'sqlite' as const, sqlitePath: ':memory:' };
      return buildOutboxModuleOptions(outbox);
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}

function buildDiscoveryAsyncImport(): DynamicModule {
  return DiscoveryModule.forRootAsync({
    useFactory: (...args: unknown[]) => {
      const opts = args[0] as EventsToolkitModuleOptions;
      return opts.discovery ?? {};
    },
    inject: [EVENTS_TOOLKIT_OPTIONS],
  });
}
```

**Verification:** File ≈ 167 lines (under 200). Longest method body (`buildSyncImports`) ≈ 18 lines (under 50). Max nesting depth = 2. Max named params = 2 (`buildSyncProviders`, `buildSyncImports`). Private-by-default: every helper function is module-private (not exported). `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN` are the only new public-exported symbols.

---

### Step 3 — Add `requestReply` option to `EventsToolkitModuleOptions`

File: `src/events-toolkit-options.interface.ts`

**Edit 1** — Add type-only import at top (after existing imports, before line 8 `/** NATS connection... */`):

```ts
import type { RequestReplyConfig } from './request-reply/request-reply.types';
```

Insert this import right after line 6 (`import { EventsToolkitDiscoveryOptions } from './discovery/discovery-service-options.interface';`).

**Edit 2** — Add the new field to `EventsToolkitModuleOptions` (after the `discovery?:` field, before the closing `}` on line 58):

Replace:
```ts
  /** Discovery subsystem toggle and options. */
  discovery?: EventsToolkitDiscoveryOptions;
}
```
With:
```ts
  /** Discovery subsystem toggle and options. */
  discovery?: EventsToolkitDiscoveryOptions;
  /** Request-reply subsystem defaults. Omit to use built-in defaults (defaultTimeoutMs: 5000). */
  requestReply?: Partial<RequestReplyConfig>;
}
```

**Verification:** Single new field, no runtime import (type-only). No circular import: `request-reply.types.ts` only imports types from `common` and `nats`, never from `events-toolkit-options.interface.ts`.

---

### Step 4 — Update breaking assertion in `src/events-toolkit.module.spec.ts`

The existing test at line 47–55 (`forRoot` "should expose sub-module services via global imports instead of exports") asserts:
```ts
expect(module.exports ?? []).toHaveLength(0);
```
This is now invalid because `forRoot` legitimately exports `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN`.

**Edit 1** — Add imports at top of the spec file. After line 5 (`import { EventLoggerService } from './logging/event-logger.service';`), add:

```ts
import { RequestReplyService } from './request-reply/request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply/request-reply.types';
```

**Edit 2** — Replace the assertion block in the `forRoot` describe block. Locate:

```ts
      expect(importNames).toContain('ProducerModule');
      expect(importNames).toContain('ConsumerModule');
      expect(importNames).toContain('DiscoveryModule');
      expect(module.exports ?? []).toHaveLength(0);
```

Replace with:

```ts
      expect(importNames).toContain('ProducerModule');
      expect(importNames).toContain('ConsumerModule');
      expect(importNames).toContain('DiscoveryModule');
      expect(module.exports ?? []).toContain(RequestReplyService);
      expect(module.exports ?? []).toContain(REQUEST_REPLY_DEPS_TOKEN);
```

**Edit 3 (recommended, additional coverage)** — In the `forRootAsync` describe block, after the existing `expect(module.exports).toContain(EventLoggerService);` (line 118), add:

```ts
      expect(module.exports).toContain(RequestReplyService);
      expect(module.exports).toContain(REQUEST_REPLY_DEPS_TOKEN);
```

And add a new test at the end of the `forRootAsync` describe block (before its closing `});` on line 172):

```ts
    it('should provide and export RequestReplyService and REQUEST_REPLY_DEPS_TOKEN', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      expect(findProvider(module.providers as Provider[] | undefined, REQUEST_REPLY_DEPS_TOKEN)).toBeDefined();
      expect(findProvider(module.providers as Provider[] | undefined, RequestReplyService)).toBeDefined();
    });
```

> Note: `findProvider` matches by `provide === token`. For a class token like `RequestReplyService`, the providers array contains `{ provide: RequestReplyService, ... }` (the class itself). The existing `findProvider` uses `p.provide === token` — passing the class works because the provider's `provide` is the same class reference.

---

### Step 5 — Add `[0.10.4]` entry to `CHANGELOG.md`

File: `CHANGELOG.md`. The current top section is `## [0.10.3] — unreleased`. Insert a new `## [0.10.4] — unreleased` section **above** it (right after the header lines 1–7):

```markdown
## [0.10.4] — unreleased

### Fixed

- **`RequestReplyService` never registered as a provider (Bug 3)**: `RequestReplyService` (and its dependency token `REQUEST_REPLY_DEPS_TOKEN`) had `@Injectable()` decoration but were never added to any module's `providers` or `exports` arrays. Consumers injecting `RequestReplyService` (e.g. `CrudHandlersModule`) failed at DI compilation with `Nest can't resolve dependencies of the RequestReplyService (RequestReplyService, ?)`. Both `EventsToolkitModule.forRoot` and `EventsToolkitModule.forRootAsync` now register and export `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN`.

### Changed

- **Single NATS connection in the async path**: introduced an internal `RESOLVED_NATS_TOKEN` that resolves the NATS connection exactly once. `JETSTREAM_TOKEN` and the new `NATS_CONNECTION_TOKEN` are now thin derived providers over the single resolved connection, preventing duplicate NATS connections when both JetStream and request-reply are active.
- Extracted all EventsToolkitModule provider factories into `src/events-toolkit-module.providers.ts` to keep `events-toolkit.module.ts` under the 200-line file limit and method bodies under 50 lines.

### Added

- Optional `requestReply?: Partial<RequestReplyConfig>` field on `EventsToolkitModuleOptions` to override `defaultTimeoutMs` (default: 5000ms).
```

---

### Step 6 — Verify no other test files reference the removed internals

The only consumer of the previously module-local `EVENTS_TOOLKIT_OPTIONS` constant / `resolveConnection` / `ownedConnection` was `events-toolkit.module.ts` itself and its spec files. No other source imports them. (Confirm with: `grep -rn "ownedConnection\|resolveConnection\|EVENTS_TOOLKIT_OPTIONS" src/` — should now only show the new providers file plus the spec at line 134 which references the string `'EVENTS_TOOLKIT_OPTIONS'`, which still matches because the constant value is unchanged.)

No changes needed to `src/index.ts`, `src/request-reply/index.ts`, `.agent/project-structure.md`, or any consumer module.

---

## 3. Terminal commands (verification)

Run each command separately from the project root (do NOT chain with `&&`):

1. `npm run typecheck` — must pass (tsc --noEmit). Verifies the new providers file compiles, types align, no circular type import issues.
2. `npm test` — runs Jest unit suite including `events-toolkit.module.spec.ts` and `events-toolkit.module.di.spec.ts`. All must pass. The existing `forRoot` test (line 54) now checks exports contain `RequestReplyService` / `REQUEST_REPLY_DEPS_TOKEN`.
3. `npm run test:e2e` — runs `events-toolkit.module.e2e-spec.ts`. Must still pass (the existing e2e does not instantiate `RequestReplyService`, so the mocked NATS without `request()` is fine).
4. `npm run build` — `tsc -p tsconfig.build.json`. Must produce `dist/events-toolkit-module.providers.js` and updated `dist/events-toolkit.module.js`.
5. `npm run lint` — ESLint must pass on the two new/modified source files.

If any command fails, fix and re-run before committing.

---

## 4. Git actions (for implementer in step 4.2)

- Stage only the intended files:
  - `src/events-toolkit-module.providers.ts` (new)
  - `src/events-toolkit.module.ts` (modified)
  - `src/events-toolkit-options.interface.ts` (modified)
  - `src/events-toolkit.module.spec.ts` (modified)
  - `CHANGELOG.md` (modified)
- Verify `.gitignore` compliance: run `git status`; ensure no `dist/`, `node_modules/`, or other ignored paths are staged.
- Commit message (matches repo style — concise, conventional):
  ```
  fix: register RequestReplyService and REQUEST_REPLY_DEPS_TOKEN in EventsToolkitModule

  Bug 3: RequestReplyService was @Injectable but never added to any
  module's providers/exports, causing DI failures in consumers like
  CrudHandlersModule. Register and export both the service and its
  deps token in forRoot and forRootAsync. Introduce RESOLVED_NATS_TOKEN
  to guarantee a single NATS connection in the async path; add optional
  requestReply config to EventsToolkitModuleOptions.
  ```
- Do NOT push (Step 5 of Critical Workflow handles the push to `origin` only, after the whole TODO completes).

---

## 5. Validation against the TODO task

Mapping back to `.agent/todos/20260713/20260713-todo-2.md` → "Fix RequestReplyService registration" section:

| TODO checkbox | Covered by |
|---|---|
| Add `RequestReplyService` to `EventsToolkitModule.forRootAsync` providers and exports | Step 2 (`forRootAsync`: providers includes `RequestReplyService`; exports includes it). |
| Add `REQUEST_REPLY_DEPS_TOKEN` provider to `EventsToolkitModule.forRootAsync` providers and exports | Step 2 (`buildAsyncRequestReplyDepsProvider` in providers; exported). |
| Ensure `REQUEST_REPLY_DEPS_TOKEN` factory can resolve `ProducerService`, `EventLoggerService`, and `NATS_CONNECTION` | Step 1 (`buildAsyncRequestReplyDepsProvider` injects `[NATS_CONNECTION_TOKEN, ProducerService, EventLoggerService, EVENTS_TOOLKIT_OPTIONS]`; `NATS_CONNECTION_TOKEN` derives from single `RESOLVED_NATS_TOKEN`). |
| Same fix needed for `forRoot` path if applicable | Step 2 (`forRoot`: `buildSyncNatsConnectionProvider` + `buildSyncRequestReplyDepsProvider` + `RequestReplyService`; exports them). |

Out of scope for Task 1 (handled by Task 2's own 4.1 cycle): the end-to-end integration test assertions for `RequestReplyService` / `RequestReplyConsumerService` in `events-toolkit.module.e2e-spec.ts`.

All checkboxes in scope are addressed. ✅

---

## 6. Ambiguities / risks

1. **Eager vs lazy provider instantiation in NestJS**: NestJS does NOT invoke `useFactory` for tokens that nothing injects. Therefore adding `RequestReplyService` / `REQUEST_REPLY_DEPS_TOKEN` / `NATS_CONNECTION_TOKEN` / `RESOLVED_NATS_TOKEN` providers does not force their factories to run in tests that don't inject them. Confirmed the existing `di.spec.ts` and `e2e-spec.ts` will still pass with the mocked NATS (no `request()` needed at construction time). Risk: LOW.
2. **`ownedConnection` state relocation**: previously a `let` in the module file; now lives in the providers file behind `setOwnedNatsConnection` / `closeOwnedNatsConnection`. The `onModuleDestroy` spec (lines 174–198 of `events-toolkit.module.spec.ts`) calls `instance.onModuleDestroy()` and expects `close()` to be invoked. Since `forRoot` now calls `setOwnedNatsConnection(...)` and `onModuleDestroy` calls `closeOwnedNatsConnection()`, the behavior is preserved. Risk: LOW — but the implementer MUST run `npm test` to confirm the `onModuleDestroy` spec still passes.
3. **`resolveRequestReplyConfig(undefined)`**: when `options.requestReply` is omitted, `resolveRequestReplyConfig(undefined)` returns `{ defaultTimeoutMs: 5000 }` (verified in `request-reply.types.ts:23-27`). No null-handling needed.
4. **Max-2-params rule for the 4-inject async factory**: resolved by using the `(...args: unknown[])` + tuple-cast pattern (zero named params). This matches the existing `buildConsumerAsyncImport` precedent. Risk: LOW.
5. **`EventsToolkitModuleOptions` import cycle**: `events-toolkit-options.interface.ts` now `import type { RequestReplyConfig }` from `request-reply/request-reply.types.ts`. `request-reply.types.ts` only type-imports from `common` and `nats` — no back-reference. Type-only imports are erased at runtime. No cycle. Risk: NONE.
6. **Public API surface**: `NATS_CONNECTION_TOKEN` and `RESOLVED_NATS_TOKEN` are NOT added to `events-toolkit.module.ts` `exports`. `NATS_CONNECTION_TOKEN` is already a public constant via the barrel (consumers *could* inject it from their own module if they re-provide it), but `EventsToolkitModule` keeps it internal to its own provider graph. This matches the TODO's literal requirement (export only `RequestReplyService` + `REQUEST_REPLY_DEPS_TOKEN`). If a future consumer needs the raw connection from the global module, that's a follow-up. Risk: LOW.
7. **`tsconfig.build.json` include paths**: the new file is under `src/`, picked up by `nest build` / `tsc -p tsconfig.build.json`. Run `npm run build` in Step 3 of the verification to confirm `dist/events-toolkit-module.providers.{js,d.ts}` is emitted.

---

## 7. Files touched summary

| File | Action |
|---|---|
| `src/events-toolkit-module.providers.ts` | NEW — all provider factories + connection state |
| `src/events-toolkit.module.ts` | REWRITE — slimmed; registers+exports RequestReplyService + REQUEST_REPLY_DEPS_TOKEN in both forRoot and forRootAsync |
| `src/events-toolkit-options.interface.ts` | ADD `requestReply?: Partial<RequestReplyConfig>` field + type-only import |
| `src/events-toolkit.module.spec.ts` | UPDATE line-54 assertion (no longer `toHaveLength(0)`); add RR export/provider assertions |
| `CHANGELOG.md` | ADD `[0.10.4]` section |

**No changes** to: `src/index.ts`, `src/request-reply/*`, `src/producer/*`, `src/consumer/*`, `src/events-toolkit.module.di.spec.ts`, `src/events-toolkit.module.e2e-spec.ts`, `.agent/project-structure.md`.