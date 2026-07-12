# Per-Task Plan — Fix Circular Dependency (EmitEventInterceptor / ProducerService)

- **Task**: Fix the circular dependency in `@cobranza-apps/events-toolkit` that makes `ProducerService` `undefined` at decoration time, causing NestJS to fail resolving `EmitEventInterceptor (Reflector, ?)`.
- **Task source**: `.agent/todos/20260712/20260712-todo-0.md`
- **Global plan**: `.kilo/plans/20260712-fix-dependency-error.md`
- **Plan step**: 4.1 (Analysis & Planning) → output for 4.2 (Implementation)
- **Project Info**: Active — NestJS shared library; NestJS 11, ts-jest, Jest 30, ESM/nodenext compile, decorators + `emitDecoratorMetadata` enabled.

[Project Info: Active]

---

## 1. Root-Cause Confirmation (verified by reading source)

Circular import chain at runtime (CommonJS modules compiled from `src/` to `dist/`):

```
producer.module.ts
  └─ import { EmitEventInterceptor } from './decorators/emit-event-interceptor'   (line 5)
       └─ import { ProducerService } from '../producer.service'                    (line 6)
            └─ import { JETSTREAM_TOKEN } from './producer.module'                 (line 9)  ← back-edge
```

- `JETSTREAM_TOKEN` is declared at `src/producer/producer.module.ts:8` as `export const JETSTREAM_TOKEN = 'NATS_JETSTREAM';`.
- At runtime, `producer.service.ts` is `require()`-resolved while `producer.module.ts` has not yet reached line 8.
- `ProducerService` is decorated with `@Injectable()` and `@Inject(JETSTREAM_TOKEN)` at decoration time (`producer.service.ts:31`). With `JETSTREAM_TOKEN === undefined`, NestJS stamps `design:paramtypes[0]` inject metadata as `undefined`.
- `EmitEventInterceptor` (`emit-event-interceptor.ts:34-38`) constructor is `(Reflector, ProducerService)`. Depending on require order, `ProducerService` ends up `undefined` in the circular require window, so NestJS reports `(Reflector, ?)`.

### Files importing `JETSTREAM_TOKEN` from `./producer.module` (grep-confirmed)

| # | File | Import line | Role |
|---|------|-------------|------|
| 1 | `src/producer/producer.module.ts` | `:8` (defines it) | Definition |
| 2 | `src/producer/producer.service.ts` | `:9` | **Cycle back-edge — root cause** |
| 3 | `src/producer/index.ts` | `:7` (re-export) | Public barrel |
| 4 | `src/events-toolkit.module.ts` | `:3` | Uses `ProducerModule` + token |
| 5 | `src/events-toolkit.module.spec.ts` | `:4` | Test import |
| 6 | `src/producer/producer.service.spec.ts` | `:5` | Test import (also imports `ProducerModule`) |
| 7 | `src/producer/decorators/emit-event-interceptor.spec.ts` | `:7` | Test import |

The interfaces `ProducerModuleOptions` / `ProducerModuleAsyncOptions` are referenced only inside `producer.module.ts` and re-exported via `producer/index.ts` (grep-confirmed). No external file imports them directly from `producer.module`.

## 2. Fix Strategy (verified)

Extract `JETSTREAM_TOKEN`, `ProducerModuleOptions`, and `ProducerModuleAsyncOptions` out of `producer.module.ts` into a new leaf file `src/producer/producer.constants.ts` that imports nothing from the producer module graph.

After the move, the only import from `producer.module.ts` made by `producer.service.ts` disappears:

```
producer.module.ts
  └─ import { EmitEventInterceptor } from './decorators/emit-event-interceptor'
       └─ import { ProducerService } from '../producer.service'
            └─ import { JETSTREAM_TOKEN } from './producer.constants'   ← leaf, NO cycle
```

`producer.service.ts` → `producer.constants.ts` is a one-way edge to a leaf module, so `JETSTREAM_TOKEN` is always defined before `ProducerService` is decorated. The cycle is broken.

## 3. Review of Other Modules for Runtime-Dangerous Cycles (verified)

| Module | Cycle? | Runtime-dangerous? | Reason |
|--------|--------|--------------------|--------|
| **Consumer** | `consumer.module.ts` ↔ `consumer-module.providers.ts` | **No** | `consumer-module.providers.ts` reads `CONSUMER_MODULE_OPTIONS`, `DISCOVERY_REFLECTOR_PAIR`, `RESOLVED_CONNECTION_TOKEN`, `CONSUMER_SERVICES_PAIR` **only inside factory functions** that run at `forRoot`/`forRootAsync` call time. By then `consumer.module.ts` has finished evaluating and the module-object bindings are live. No `@Inject(...)` decoration-time use of those tokens exists (consumer services inject `JETSTREAM_CONSUMER_DEPS_TOKEN`, `ON_EVENT_EXPLORER_DEPS_TOKEN`, etc., which live in independent interface files). |
| **Discovery** | `discovery.service.ts`, `discovery-event-publisher.service.ts` → `discovery.module.ts` | **No** | They import only `DiscoveryModuleOptions`, an **interface**. TypeScript elides type-only imports (no `verbatimModuleSyntax` in `tsconfig.json`), so the compiled JS has **no runtime `require()` back to `discovery.module.ts`**. Verified: both files use the symbol only as a type annotation. |
| **Outbox** | none | **No** | `outbox.module.ts` imports `outbox.types`, `outbox.service`, repos, `producer/producer.service`, logging — none import back into `outbox.module.ts`. |
| **EventsToolkitModule** | none | **No** | Imports sub-modules by their public entry only; no back-edges. |

**Conclusion:** No other runtime-dangerous circular dependencies. Only the producer module needs fixing.

## 4. Files to Create / Modify (exact list)

### NEW
- `src/producer/producer.constants.ts` — leaf file: `JETSTREAM_TOKEN` + the two option interfaces.
- `src/producer/producer.module.di.spec.ts` — DI-compile regression for `ProducerModule`.
- `src/module-compilation.spec.ts` — smoke DI-compile for `ConsumerModule`, `OutboxModule`, `DiscoveryModule`.

### MODIFY (import-path updates only; no behavioural change)
- `src/producer/producer.module.ts`
- `src/producer/producer.service.ts`
- `src/producer/index.ts`
- `src/events-toolkit.module.ts`
- `src/events-toolkit.module.spec.ts`
- `src/producer/producer.service.spec.ts`
- `src/producer/decorators/emit-event-interceptor.spec.ts`

> Note: bumping `package.json` version `0.10.0 → 0.10.1` and the feature branch are handled by global workflow steps 2 & 3, not by this task plan.

---

## 5. Step-by-Step Implementation (for step 4.2)

Every step below is atomic and verifiable. Implementer MUST commit with a meaningful message after each cohesive group (the plan groups commits logically). Follow `.agent/RULES.md`: max 200 lines/file, max 50 lines/method, max 2 depth, max 2 params, prefer private members, self-documenting names, no commented code, single-section boolean conditions.

### Step 5.1 — Create `src/producer/producer.constants.ts`

New leaf file. Imports only third-party `nats` types and `@nestjs/common` `Type` (for async options). No imports from any producer module file.

Exact content:

```ts
import { Type } from '@nestjs/common';
import { JetStreamClient } from 'nats';

/** NestJS injection token for the JetStream client used by {@link ProducerService}. */
export const JETSTREAM_TOKEN = 'NATS_JETSTREAM';

/** Synchronous options for {@link ProducerModule.forRoot}. */
export interface ProducerModuleOptions {
  /** An existing NATS connection — JetStream is obtained via `connection.jetstream()`. */
  connection?: import('nats').NatsConnection;
  /** A pre-obtained JetStream client instance — takes precedence over `connection`. */
  jetStream?: JetStreamClient;
}

/** Asynchronous options for {@link ProducerModule.forRootAsync}. */
export interface ProducerModuleAsyncOptions {
  /** Existing token that provides a JetStreamClient; skips JETSTREAM_TOKEN provider creation. */
  useExisting?: string | symbol | Type<unknown>;
  /** Factory that resolves module options, optionally injecting dependencies. */
  useFactory: (...args: unknown[]) => Promise<ProducerModuleOptions> | ProducerModuleOptions;
  /** Optional dependencies to inject into the factory. */
  inject?: Array<string | symbol | Type<unknown>>;
}
```

Rules check: < 30 lines; no methods; no nested blocks; max-2 params on `useFactory` is a type signature (exempt: interface member). Compliant.

### Step 5.2 — Edit `src/producer/producer.module.ts`

**Remove** lines 7-26 (the `JETSTREAM_TOKEN` const and the two interfaces) and the `Type` usage if it becomes unused. **Add** an import line for the three symbols from `./producer.constants`.

Replace the import header (lines 1-5) so it becomes:

```ts
import { DynamicModule, Provider } from '@nestjs/common';
import { JetStreamClient } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { ProducerService } from './producer.service';
import { EmitEventInterceptor } from './decorators/emit-event-interceptor';
import { JETSTREAM_TOKEN, ProducerModuleOptions, ProducerModuleAsyncOptions } from './producer.constants';
```

Notes:
- Remove `NatsConnection` from the `nats` import (it was only used by the moved `ProducerModuleOptions.connection` field and the removed interfaces). After the move, `NatsConnection` is no longer referenced in `producer.module.ts`, so drop it to satisfy `noUnusedLocals`.
- Remove `Type` from the `@nestjs/common` import (it was only used by the moved `ProducerModuleAsyncOptions.useExisting` field). Verify no other usage remains; if `Provider` is still used (yes, in `forRootAsync` `jetStreamProvider: Provider`), keep `Provider`.
- Keep `resolveJetStream`, `ProducerModule.forRoot`, `ProducerModule.forRootAsync` bodies unchanged. They already reference `JETSTREAM_TOKEN`, `ProducerModuleOptions`, `ProducerModuleAsyncOptions` — now resolved via the new import.

After edits, `producer.module.ts` should be ~70 lines (was 93). Still imports `producer.service.ts` and `emit-event-interceptor.ts`, but neither now imports back into `producer.module.ts`, so the runtime cycle is broken.

### Step 5.3 — Edit `src/producer/producer.service.ts`

Change line 9:

```ts
// OLD
import { JETSTREAM_TOKEN } from './producer.module';
```
→
```ts
// NEW
import { JETSTREAM_TOKEN } from './producer.constants';
```

No other changes. `producer.service.ts` no longer has any edge back to `producer.module.ts`.

### Step 5.4 — Edit `src/producer/index.ts`

Update line 7 so the three symbols are re-exported from `./producer.constants`, and `ProducerModule` stays from `./producer.module`.

```ts
export { ProducerService, EmitOptions } from './producer.service';
export { ProducerModule } from './producer.module';
export { JETSTREAM_TOKEN, ProducerModuleOptions, ProducerModuleAsyncOptions } from './producer.constants';
export { EmitEvent, EMIT_EVENT_METADATA, EmitEventOptions, EmitEventMetadata } from './decorators/emit-event.decorator';
export { EmitEventInterceptor } from './decorators/emit-event-interceptor';
```

Public API surface is unchanged (same exported symbols).

### Step 5.5 — Edit `src/events-toolkit.module.ts`

Split the import on line 3:

```ts
// OLD
import { ProducerModule, JETSTREAM_TOKEN } from './producer/producer.module';
```
→
```ts
// NEW
import { ProducerModule } from './producer/producer.module';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
```

No other changes (usages at `:117`, `:162`, `:198` remain identical).

### Step 5.6 — Edit `src/events-toolkit.module.spec.ts`

Change line 4:

```ts
// OLD
import { JETSTREAM_TOKEN } from './producer/producer.module';
```
→
```ts
// NEW
import { JETSTREAM_TOKEN } from './producer/producer.constants';
```

### Step 5.7 — Edit `src/producer/producer.service.spec.ts`

Change line 5:

```ts
// OLD
import { JETSTREAM_TOKEN, ProducerModule } from './producer.module';
```
→
```ts
// NEW
import { ProducerModule } from './producer.module';
import { JETSTREAM_TOKEN } from './producer.constants';
```

### Step 5.8 — Edit `src/producer/decorators/emit-event-interceptor.spec.ts`

Change line 7:

```ts
// OLD
import { JETSTREAM_TOKEN } from '../producer.module';
```
→
```ts
// NEW
import { JETSTREAM_TOKEN } from '../producer.constants';
```

> After steps 5.1–5.8, run a quick sanity build (Step 5.12). Commit message: `fix(producer): break circular import by extracting JETSTREAM_TOKEN to producer.constants`.

### Step 5.9 — NEW `src/producer/producer.module.di.spec.ts` (regression test)

This is the regression test that would have caught the bug: it compiles `ProducerModule` through NestJS DI and resolves `EmitEventInterceptor` (whose second constructor param is `ProducerService`). Before the fix this throws `Nest can't resolve dependencies of the EmitEventInterceptor (Reflector, ?)`.

Use the implicit-globals style already used in `producer.service.spec.ts` (no `@jest/globals` import). File under `src/` so Jest picks it up (matches `testRegex: .*\.spec\.ts$`, `rootDir: src`).

Exact content:

```ts
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { JetStreamClient } from 'nats';
import { ProducerModule } from './producer.module';
import { ProducerService } from './producer.service';
import { EmitEventInterceptor } from './decorators/emit-event-interceptor';
import { EventLoggerService } from '../logging/event-logger.service';

describe('ProducerModule DI compilation', () => {
  let moduleRef: TestingModule;
  const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('forRoot', () => {
    it('compiles and resolves ProducerService via DI', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ProducerModule.forRoot({ jetStream: mockJetStream })],
      }).compile();

      expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
    });

    it('compiles and resolves EmitEventInterceptor with ProducerService injected', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ProducerModule.forRoot({ jetStream: mockJetStream })],
      }).compile();

      const interceptor = moduleRef.get(EmitEventInterceptor);
      expect(interceptor).toBeInstanceOf(EmitEventInterceptor);
    });

    it('provides EventLoggerService globally from the module', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ProducerModule.forRoot({ jetStream: mockJetStream })],
      }).compile();

      expect(moduleRef.get(EventLoggerService)).toBeInstanceOf(EventLoggerService);
    });
  });

  describe('forRootAsync', () => {
    it('compiles and resolves ProducerService when JETSTREAM_TOKEN is supplied externally', async () => {
      const { JETSTREAM_TOKEN } = await import('./producer.constants');
      moduleRef = await Test.createTestingModule({
        providers: [{ provide: JETSTREAM_TOKEN, useValue: mockJetStream }],
        imports: [
          ProducerModule.forRootAsync({
            useExisting: JETSTREAM_TOKEN,
            useFactory: async () => ({}),
            inject: [],
          }),
        ],
      }).compile();

      expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
      expect(moduleRef.get(EmitEventInterceptor)).toBeInstanceOf(EmitEventInterceptor);
    });
  });
});
```

Rules check: file ~50 lines, each `it` body ≤ 6 lines, depth ≤ 2, max 2 params (none), no commented code. Compliant. The dynamic `await import('./producer.constants')` keeps `isolatedModules` (jest tsconfig) happy by importing the token at runtime rather than relying on a type-only elision of a value symbol (it is a value, so a static `import { JETSTREAM_TOKEN } from './producer.constants'` would also work; the dynamic import is used only to keep the async block self-contained — implementer may switch to a static import at top of file if preferred, but a static `import { JETSTREAM_TOKEN } from './producer.constants'` at the top is simpler and equally valid).

> Implementer note: prefer a **static** top-level `import { JETSTREAM_TOKEN } from './producer.constants';` added to the existing import block, then use it directly in the `forRootAsync` test. Keep the file simple.

### Step 5.10 — NEW `src/module-compilation.spec.ts` (smoke DI-compile for other modules)

Smoke test that compiles `ConsumerModule`, `OutboxModule`, and `DiscoveryModule` through NestJS DI and resolves a key provider from each. Catches future circular/undefined-dependency regressions in those modules without requiring a running NATS server.

Design notes (verified against source):
- **ConsumerModule** (`forRoot`): imports NestJS core `DiscoveryModule`. Its providers reference `EventLoggerService` via factory inject arrays; `EventLoggerService` is NOT provided by `ConsumerModule`, so it must be supplied by the host testing module. No heavy lifecycle work fires on `compile()` (explorers hook `OnApplicationBootstrap`, which runs on app bootstrap, not compile).
- **OutboxModule** (`forRoot`): provides `OUTBOX_REPOSITORY_TOKEN`, `OutboxService`, and pair/deps providers, but injects `ProducerService` + `EventLoggerService` (external). Mock `SqliteOutboxRepository` via `jest.mock` to avoid the native `better-sqlite3` binding (same pattern as `events-toolkit.module.spec.ts`). `OutboxService` implements `OnModuleDestroy`; `moduleRef.close()` in `afterEach` cleans up.
- **DiscoveryModule** (`forRoot`): `DiscoveryService.onModuleInit` only does manifest work when `enabled && registerOnStartup`; pass `{ enabled: false }` so `onModuleInit` returns early. `EventLoggerService` is `@Optional()` in `DiscoveryService`, so no external logger is required.

Exact content:

```ts
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { JetStreamClient } from 'nats';
import { ConsumerModule } from './consumer/consumer.module';
import { ConsumerService } from './consumer/consumer.service';
import { JetStreamConsumerService } from './consumer/jetstream-consumer.service';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxService } from './outbox/outbox.service';
import { DiscoveryModule } from './discovery/discovery.module';
import { DiscoveryService } from './discovery/discovery.service';
import { ProducerService } from './producer/producer.service';
import { EventLoggerService } from './logging/event-logger.service';
import { JETSTREAM_TOKEN } from './producer/producer.constants';

jest.mock('./outbox/sqlite-outbox.repository', () => {
  const mockRepo = {
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  };
  return { SqliteOutboxRepository: jest.fn().mockImplementation(() => mockRepo) };
});

describe('Module DI compilation (circular-dependency regression smoke)', () => {
  let moduleRef: TestingModule;
  const mockJetStream = { publish: jest.fn(), subscribe: jest.fn() } as unknown as JetStreamClient;
  const mockLogger = {
    logEventEmitted: jest.fn(),
    logEventError: jest.fn(),
    logEventConsumed: jest.fn(),
    logEventDlq: jest.fn(),
    logDiscoveryManifest: jest.fn(),
  } as unknown as EventLoggerService;
  const mockProducer = { publish: jest.fn().mockResolvedValue(undefined), emit: jest.fn().mockResolvedValue(undefined) } as unknown as ProducerService;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('ConsumerModule', () => {
    it('compiles forRoot and resolves ConsumerService', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ConsumerModule.forRoot({ jetStream: mockJetStream })],
        providers: [{ provide: EventLoggerService, useValue: mockLogger }],
      }).compile();

      expect(moduleRef.get(ConsumerService)).toBeInstanceOf(ConsumerService);
    });

    it('resolves JetStreamConsumerService via DI', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ConsumerModule.forRoot({ jetStream: mockJetStream })],
        providers: [{ provide: EventLoggerService, useValue: mockLogger }],
      }).compile();

      expect(moduleRef.get(JetStreamConsumerService)).toBeInstanceOf(JetStreamConsumerService);
    });
  });

  describe('OutboxModule', () => {
    it('compiles forRoot and resolves OutboxService', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [OutboxModule.forRoot({ type: 'sqlite', sqlite: { dbPath: ':memory:' } })],
        providers: [
          { provide: EventLoggerService, useValue: mockLogger },
          { provide: ProducerService, useValue: mockProducer },
        ],
      }).compile();

      expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
    });
  });

  describe('DiscoveryModule', () => {
    it('compiles forRoot and resolves DiscoveryService', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [DiscoveryModule.forRoot({ enabled: false })],
      }).compile();

      expect(moduleRef.get(DiscoveryService)).toBeInstanceOf(DiscoveryService);
    });
  });
});
```

Rules check: file ~75 lines, each test body ≤ 8 lines, depth ≤ 2, no commented code. `getPending` mock returns `[]` so any background processor loop finds nothing. `JETSTREAM_TOKEN` static import is a value, surviving `isolatedModules`. Compliant.

> Implementer note: before finalizing, run `npx jest src/module-compilation.spec.ts` once. If `DiscoveryService` still errors, double-check that `DiscoveryModule.forRoot({ enabled: false })` is accepted (it should — `enabled` is optional with default `true`). Do NOT substitute real NATS/SQLite; keep mocks to keep the test hermetic.

### Step 5.11 — Run lint/format

Terminal commands (run individually, not chained):

```
npm run format
npm run lint
```

Fix any reported issues (most likely unused-import removal after the import-path splits, already addressed in steps 5.2/5.5).

### Step 5.12 — Build + test verification

Terminal commands (run individually, not chained):

```
npm run build
npm test
```

Expected outcomes:
- `npm run build` (`tsc -p tsconfig.build.json`) succeeds with no `TS2xxx` errors (no unused locals, no missing exports, no circular re-export type errors).
- `npm test` runs all `*.spec.ts`; the two new specs pass; all existing specs remain green.
  - `producer.module.di.spec.ts`: the `forRoot` tests MUST pass after the fix; they would have FAILED before the fix with the exact error from the TODO.
  - `module-compilation.spec.ts`: Consumer/Outbox/Discovery compile and resolve without "undefined dependency" errors.

If any test fails with an "undefined dependency" error, that signals either an incomplete import-path update or a new cycle — re-check steps 5.1–5.8. Do NOT add `forwardRef` as a workaround; the cycle must be broken structurally.

### Step 5.13 — Commit (test additions)

```
git add src/producer/producer.module.di.spec.ts src/module-compilation.spec.ts
git commit -m "test(producer): add DI-compile regression specs for circular-import detection"
```

---

## 6. Verification Criteria (for step 4.5)

1. `grep -rn "from './producer.module'" src/producer/producer.service.ts` → **no matches** (the back-edge is gone).
2. `grep -rn "JETSTREAM_TOKEN" src/ | grep "producer.module"` → only matches where `producer.module.ts` *uses* the token, not where it imports it from a chain that loops back. Concretely, the only file still importing a producer symbol from `producer.module.ts` is `producer/index.ts` (for `ProducerModule`) and `events-toolkit.module.ts` (for `ProducerModule`) — neither creates a runtime back-edge into `producer.service.ts`.
3. `npm run build` succeeds.
4. `npm test` is fully green, including the two new spec files.
5. No `forwardRef` introduced anywhere.

## 7. Rules-Compliance Summary

- New `producer.constants.ts`: ~30 lines (< 200), no methods, depth 0.
- `producer.module.di.spec.ts`: ~50 lines, each test body ≤ 8 lines (≤ 50), depth ≤ 2.
- `module-compilation.spec.ts`: ~75 lines (< 200), each test body ≤ 8 lines (≤ 50), depth ≤ 2.
- No method exceeds 2 params; `useFactory` is an interface member signature, exempt.
- No commented-out code in any modified/additional file.
- Self-documenting names; JSDoc preserved/moved for public symbols.
- Boolean conditions in tests are single-section (none are compound).
- Private members default maintained (no new public members introduced).

## 8. Out of Scope

- Version bump (`0.10.0 → 0.10.1`) — global workflow step 3.
- Feature branch creation (`feat/fix-dependency-error`) — global workflow step 2.
- CHANGELOG + JSDoc docs polish — step 4.4 (Documentation).
- TODO completion mark + merge to `main` + push — steps 4.6 & 5.
- Modifying `package.json`, `tsconfig*.json`, or any `docs/*.md`.

## 9. Plan vs. Task Cross-Check

| TODO requirement | Covered by |
|------------------|------------|
| Fix the circular dependency that makes `EmitEventInterceptor (Reflector, ?)` fail | Steps 5.1–5.8 (extract `JETSTREAM_TOKEN` to leaf file) |
| Review all other services/modules for the same error | Section 3 (Consumer/Discovery/Outbox/EventsToolkit reviewed: none dangerous) |
| Implement tests to catch circular/undefined dependency errors | Steps 5.9–5.10 (`producer.module.di.spec.ts` + `module-compilation.spec.ts`) |

Plan is complete and consistent with the original task.