# Plan: Fix EventsToolkitModule Export Bug (Task 1)

## 1. Problem

`EventsToolkitModule.forRoot()` and `forRootAsync()` set `exports: [ProducerService, ConsumerService, OutboxService, EventLoggerService, DiscoveryService]` but only `EventLoggerService` is declared in the module's own `providers`. The other four tokens are provided by imported sub-modules. NestJS 11's `Module.validateExportedProvider` throws `RuntimeModule ... exports a provider ... which is neither declared ...`.

All four sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`) are declared with `global: true`, and `EventsToolkitModule` itself is `global: true`. Therefore every provider from those modules (and the locally-provided `EventLoggerService`) is already application-wide — the `exports` array is both invalid and redundant.

## 2. Options Analysis

| Option | Pros | Cons |
|---|---|---|
| **A — Remove `exports` entirely** | Cleanest, minimal diff, no conditional logic, idiomatic for global modules | None — services remain injectable app-wide via globals |
| **B — Re-export module refs** | Explicit composition | Requires conditional exports mirroring conditional imports (Consumer/Outbox/Discovery conditional); redundant for `global: true` modules; more bug surface |
| **C — Local `useExisting` aliases** | Keeps `exports` array | Hacky circular `useExisting: ProducerService` aliases; needs conditional providers; boilerplate; non-idiomatic |

### Recommendation: **Option A**

Rationale:
- All sub-modules are `global: true` → their providers are app-wide without re-export.
- `EventsToolkitModule` is `global: true` → locally-provided `EventLoggerService` is app-wide without being exported.
- No conditional exports needed (Consumer/Outbox/Discovery are conditionally imported — exporting modules you didn't import is itself invalid).
- No consumer breakage: consumers inject these services via the DI registry; nothing depends on importing them through `EventsToolkitModule`'s exports.
- No impact on `EventsToolkitTestModule`: it has its own `providers`/`exports` with `useExisting` aliases to the same tokens, and does **not** import `EventsToolkitModule`.

## 3. Files to Modify

### 3.1 `src/events-toolkit.module.ts`

**Change 1 — `forRoot` return object (lines 103–109):** remove `exports` line.

```ts
return {
  module: EventsToolkitModule,
  global: true,
  imports,
  providers: [loggingProvider],
};
```

**Change 2 — `forRootAsync` return object (lines 129–135):** remove `exports` line.

```ts
return {
  module: EventsToolkitModule,
  global: true,
  imports,
  providers: [optionsProvider, jetStreamProvider, loggingProvider],
};
```

**Change 3 — Remove now-unused imports (lines 8–11):** `ProducerService`, `ConsumerService`, `OutboxService`, `DiscoveryService` are referenced only by the removed `exports`. Remove to avoid unused-import lint.

```diff
- import { ProducerService } from './producer/producer.service';
- import { ConsumerService } from './consumer/consumer.service';
- import { OutboxService } from './outbox/outbox.service';
- import { DiscoveryService } from './discovery/discovery.service';
```

Keep `EventLoggerService` import (line 7) — used in `buildLoggingProvider` / `buildAsyncLoggingProvider`.

### 3.2 `src/events-toolkit.module.spec.ts`

**Change 1 — Remove unused imports (lines 5–8):**

```diff
- import { ProducerService } from './producer/producer.service';
- import { ConsumerService } from './consumer/consumer.service';
- import { OutboxService } from './outbox/outbox.service';
```

Keep `EventLoggerService` import (line 8) — still asserted in logger tests.

**Change 2 — Replace `forRoot` exports assertion (lines 39–47):**

```ts
it('should expose sub-module services via global imports instead of exports', async () => {
  const module = await EventsToolkitModule.forRoot({
    nats: { connection: { jetstream: () => mockJetStream } as unknown as NatsConnection },
  });
  const importNames = (module.imports ?? []).map((m) => (m as { module?: { name?: string } }).module?.name);
  expect(importNames.some(n => n === 'ProducerModule')).toBe(true);
  expect(importNames.some(n => n === 'ConsumerModule')).toBe(true);
  expect(importNames.some(n => n === 'DiscoveryModule')).toBe(true);
  expect(module.exports ?? []).toHaveLength(0);
});
```

With this variant, drop service imports (lines 5–8) entirely. Keep `EventLoggerService` for the logger tests.

**Change 3 — Replace `forRootAsync` exports assertion (lines 114–124):**

```ts
it('should expose sub-module services via global imports instead of exports', () => {
  const module = EventsToolkitModule.forRootAsync({
    useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
  });
  const importNames = (module.imports ?? []).map((m) => (m as { module?: { name?: string } }).module?.name);
  expect(importNames.some(n => n === 'ProducerModule')).toBe(true);
  expect(importNames.some(n => n === 'ConsumerModule')).toBe(true);
  expect(importNames.some(n => n === 'OutboxModule')).toBe(true);
  expect(module.exports ?? []).toHaveLength(0);
});
```

All other existing tests remain valid (global flag, conditional imports, logger providers, JETSTREAM_TOKEN, user imports, onModuleDestroy).

## 4. Edge Cases Considered

1. **Conditional sub-modules**: Option A naturally handles `consumer?.enable === false`, absent `outbox`, and `discovery?.enabled === false` — no exports to keep in sync with the conditional `imports`.
2. **`EventLoggerService` duplicate registration**: `ProducerModule`, `ConsumerModule`, `OutboxModule` independently provide `EventLoggerService` as global tokens. This is a pre-existing concern **orthogonal** to the export bug and out of scope for Task 1. Flag as potential follow-up.
3. **Consumer composition breakage**: Consumers inject `ProducerService`, etc., via the global DI registry regardless of `EventsToolkitModule.exports`. No breakage.
4. **`EventsToolkitTestModule`**: Provides its own mocks with `useExisting` aliases to the same tokens; does not import `EventsToolkitModule`. Untouched by this change.
5. **Lint**: Removing unused `ProducerService`/`ConsumerService`/`OutboxService`/`DiscoveryService` imports from `events-toolkit.module.ts` prevents unused-import errors; verify after edit.

## 5. Verification Steps

1. `npm run build` (TypeScript compile) — ensure no unused-import / type errors.
2. `npm test src/events-toolkit.module.spec.ts` — updated tests green.
3. `npm test src/testing/events-toolkit-test.module.spec.ts` — confirm test module unaffected.
4. `npm test` — full suite green.
5. `npm run lint` (if configured) — clean.

## 6. Out of Scope

- No code implementation (handled in Step 4.2).
- No git operations, no remote push.
- No `EventLoggerService` duplicate-provider consolidation (follow-up, not this task).
