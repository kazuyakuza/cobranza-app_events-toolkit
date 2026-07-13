# Implementation Plan — Fix `EventsToolkitModule.forRootAsync` missing exports (Task 1)

- **TODO file:** `.agent/todos/20260713/20260713-todo-0.md`
- **Task (Section heading):** `### Fix library exports`
- **Plan step:** Critical Workflow 4.1 (Analysis & Planning)
- **Sub-agent:** architector
- **Branch assumed by caller (Step 2):** `feat/fix-forroot-async-exports` (created in Step 2 before this plan runs)
- **Date:** 2026-07-13

---

## 1. Pre-Analysis

### 1.1 Problem statement

`EventsToolkitModule.forRootAsync` (in `src/events-toolkit.module.ts`, lines 112–131) returns a `global: true` dynamic module that declares three providers but does not export them:

```ts
return {
  module: EventsToolkitModule,
  global: true,
  imports,
  providers: [optionsProvider, jetStreamProvider, loggingProvider],
};
```

The tokens behind those providers are:

| Provider builder             | Token                       | Provided by   |
|------------------------------|-----------------------------|---------------|
| `buildAsyncOptionsProvider`  | `EVENTS_TOOLKIT_OPTIONS` (`'EVENTS_TOOLKIT_OPTIONS'`, module-local const at line 16) | factory |
| `buildAsyncJetStreamProvider`| `JETSTREAM_TOKEN` (`'NATS_JETSTREAM'`, from `./producer/producer.constants`) | factory |
| `buildAsyncLoggingProvider`  | `EventLoggerService` (class) | factory |

Because the module is `global: true` but does NOT export these tokens, NestJS does NOT register them in the global DI registry. The imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`) — which inject `JETSTREAM_TOKEN` / `EVENTS_TOOLKIT_OPTIONS` / `EventLoggerService` via `inject: [...]` in their `forRootAsync` factories — cannot resolve these dependencies, causing DI compilation errors in `ms-db-gateway` (the consumer that uses `forRootAsync`).

### 1.2 Why `forRoot` is unaffected

`forRoot` (lines 72–106) passes **already-resolved values** directly into each sub-module, e.g. `ProducerModule.forRoot({ jetStream: resolved.jetStream })` creates its OWN internal `JETSTREAM_TOKEN` provider (see `src/producer/producer.module.ts` line 42). The sub-modules are self-contained and do NOT rely on `EventsToolkitModule` exporting anything. Hence `forRoot` keeps `exports` empty and works. This is intentional and must remain unchanged.

### 1.3 Historical context (relevant to the “we had this before” sub-item)

`CHANGELOG.md` entry **0.7.4 (2026-06-27)** records a previous `exports` problem where `EventsToolkitModule` exported tokens (`ProducerService`, `ConsumerService`, `OutboxService`, `DiscoveryService`, `EventLoggerService`) that were NOT declared in its own `providers` — rejected by NestJS 11’s stricter `Module.validateExportedProvider`.

That previous fix correctly REMOVED the invalid exports because the sub-modules are `global: true` and self-export their own services.

The current bug is the **inverse** problem: the toolkit-level tokens that the toolkit OWNS (in `providers`) and that the sub-modules DEPEND on via `inject` are NOT exported. Exporting tokens that ARE declared in the module’s own `providers` is valid in NestJS 11, so this fix does not regress 0.7.4.

### 1.4 Token dependency audit (which sub-module needs which token under `forRootAsync`)

| Sub-module (import source)                                  | External token(s) injected by its `forRootAsync` factory | Resolves from `EventsToolkitModule` export? |
|-------------------------------------------------------------|----------------------------------------------------------|---------------------------------------------|
| `ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN, ... })` (line 118) | `JETSTREAM_TOKEN` (via `useExisting`, no own provider) | YES → requires `JETSTREAM_TOKEN` export |
| `ConsumerModule.forRootAsync(...)` via `buildConsumerAsyncImport` (lines 189–201) | `JETSTREAM_TOKEN`, `EVENTS_TOOLKIT_OPTIONS` (factory `inject`, line 199) | YES → requires both exports |
| `OutboxModule.forRootAsync(...)` via `buildOutboxAsyncImport` (lines 203–212)    | `EVENTS_TOOLKIT_OPTIONS` (line 210); `ProducerService` + `EventLoggerService` via `baseDepsPairProvider` inject (lines 130–137 of `outbox.module.ts`) | `EVENTS_TOOLKIT_OPTIONS` + `EventLoggerService` from toolkit; `ProducerService` is global from `ProducerModule` |
| `DiscoveryModule.forRootAsync(...)` via `buildDiscoveryAsyncImport` (lines 214–222) | `EVENTS_TOOLKIT_OPTIONS` (line 220) | YES → requires `EVENTS_TOOLKIT_OPTIONS` export |

Conclusion: `forRootAsync` must export **all three** toolkit-owned tokens: `EVENTS_TOOLKIT_OPTIONS`, `JETSTREAM_TOKEN`, `EventLoggerService`.

### 1.5 Confirmation that exporting `EventLoggerService` does not collide with `ProducerModule`

`ProducerModule` (lines 8, 10 of `producer.module.ts`):
- `COMMON_PROVIDERS = [EventLoggerService, ProducerService, EmitEventInterceptor]` ⇒ declares its own `EventLoggerService`.
- `COMMON_EXPORTS = [ProducerService, EmitEventInterceptor]` ⇒ does **NOT** export `EventLoggerService`.

Because `ProducerModule` does NOT export `EventLoggerService`, its local instance never enters the global registry. Therefore exporting `EventLoggerService` from `EventsToolkitModule` is safe — no duplicate-token conflict. Inside `ProducerModule`, the local (non-exported) `EventLoggerService` wins by scope precedence; outside, the toolkit’s exported/global one is used by `ConsumerModule`/`OutboxModule`/`DiscoveryService` (`@Optional`).

### 1.6 Review of the rest of the library for similar export problems (sub-item 4)

Audited every public module’s `forRoot`/`forRootAsync`:

| Module file                              | Owns tokens the children need? | Exports them correctly? | Issue? |
|------------------------------------------|-------------------------------|-------------------------|--------|
| `src/producer/producer.module.ts`        | `JETSTREAM_TOKEN` (only when NOT `useExisting`) | Exports `ProducerService`, `EmitEventInterceptor` (its public API). By design, `useExisting` callers provide `JETSTREAM_TOKEN`. | None |
| `src/consumer/consumer.module.ts`        | `CONSUMER_MODULE_OPTIONS`, `RESOLVED_CONNECTION_TOKEN` (internal) | Exports `ConsumerService`, `JetStreamConsumerService`, explorers, `RequestReplyConsumerService`. Internal tokens are self-resolved. | None |
| `src/outbox/outbox.module.ts`            | `OUTBOX_REPOSITORY_TOKEN`, `OUTBOX_MODULE_OPTIONS_TOKEN` | Exports `OUTBOX_REPOSITORY_TOKEN`, `OutboxService`. External deps (`ProducerService`, `EventLoggerService`) come from global scope. | None |
| `src/discovery/discovery.module.ts`      | `DISCOVERY_MODULE_OPTIONS` (internal) | Exports `DiscoveryService`, `ManifestService`, `SchemaGenerator`, `DiscoveryEventPublisher`. External deps (`@nestjs/core` `DiscoveryService`, `Reflector`, `MetadataScanner`) come from `ConsumerModule` importing `@nestjs/core DiscoveryModule`; `EventLoggerService` is `@Optional`. | None |
| `src/testing/events-toolkit-test.module.ts` | Mock + real tokens | Exports both mock and real tokens (`buildExports`). | None |

**Finding: the ONLY missing-exports bug is in `EventsToolkitModule.forRootAsync`.** No other module needs changes. Documented here to satisfy the audit sub-item.

### 1.7 Existing tests that will break / need updating

`src/events-toolkit.module.spec.ts` line 116:
```ts
expect(module.exports ?? []).toHaveLength(0);
```
This assertion (inside the `forRootAsync` describe block, test “should expose sub-module services via global imports instead of exports”) explicitly asserts NO exports for the async path. After the fix it will fail. It must be replaced with positive assertions.

The `forRoot` block (line 54) asserts `toHaveLength(0)` for the sync path — that one STAYS unchanged because `forRoot` keeps no exports.

### 1.8 Existing DI compilation coverage gap

- `src/module-compilation.spec.ts` compiles sub-modules INDIVIDUALLY (with global mock providers) — it does NOT compile the root `EventsToolkitModule` at all (despite the 0.10.1 CHANGELOG claim, the current file only covers `ConsumerModule`/`OutboxModule`/`DiscoveryModule` standalone).
- `src/producer/producer.module.di.spec.ts` compiles `ProducerModule` in isolation with a `GlobalJetStreamModule` providing `JETSTREAM_TOKEN`.

There is NO test that compiles `EventsToolkitModule.forRootAsync` as a whole, which is exactly why this bug shipped. The new regression test must compile the full async root and resolve `ProducerService` (the direct consumer of the un-exported `JETSTREAM_TOKEN`).

---

## 2. High-Level Approach

1. **Code fix** — add an `exports` array to the dynamic module returned by `EventsToolkitModule.forRootAsync`, referencing the three tokens it owns. Export by **token** (not by the provider objects) to match the codebase convention (`producer.module.ts` exports classes/tokens) and to make the spec assertions (`toContain(JETSTREAM_TOKEN)`) work with reference/string equality.
2. **Spec update** — replace the `toHaveLength(0)` assertion for `forRootAsync` with three positive `toContain` assertions. Leave the `forRoot` block’s `toHaveLength(0)` untouched. Rename the affected test for accuracy.
3. **New regression spec** — create `src/events-toolkit.module.di.spec.ts` that compiles `EventsToolkitModule.forRootAsync` through `Test.createTestingModule` and resolves the sub-module services (`ProducerService`, `ConsumerService`, `OutboxService`). This is the sub-item “Verify `forRootAsync` path boots end-to-end in a test consumer”.
4. **Build + test** — run `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`.
5. **Documentation** — add a `CHANGELOG.md` entry under a new `[Unreleased]` / next-patch section (implementation step 4.4 will finalize docs; but the plan records the entry text).
6. **Context file update** — append a dated entry to `.agent/project-info/context.md` (owner: docs-specialist in 4.4; architector notes it here).

---

## 3. Detailed Steps

### Step 3.1 — Fix `forRootAsync` exports

**File:** `src/events-toolkit.module.ts`
**Location:** `forRootAsync` return statement, lines 125–130.

Replace:

```ts
    return {
      module: EventsToolkitModule,
      global: true,
      imports,
      providers: [optionsProvider, jetStreamProvider, loggingProvider],
    };
```

With:

```ts
    return {
      module: EventsToolkitModule,
      global: true,
      imports,
      providers: [optionsProvider, jetStreamProvider, loggingProvider],
      exports: [EVENTS_TOOLKIT_OPTIONS, JETSTREAM_TOKEN, EventLoggerService],
    };
```

Notes:
- `EVENTS_TOOLKIT_OPTIONS` const is already defined at line 16.
- `JETSTREAM_TOKEN` is already imported at line 4 (`import { JETSTREAM_TOKEN } from './producer/producer.constants'`).
- `EventLoggerService` is already imported at line 8 (`import { EventLoggerService, EventLoggerOptions } from './logging/event-logger.service'`).
- No new imports required.
- This file is already 222 lines (a pre-existing over-200 situation). Adding one line (the `exports` entry) does not introduce new violations warranting scope expansion; do NOT refactor this file as part of this task.
- Validation: the exported tokens are ALL declared in the module’s own `providers` array, so NestJS 11’s `Module.validateExportedProvider` accepts them (no regression of the 0.7.4 fix).

**Verification command (after edit):**
```
npm run typecheck
```

### Step 3.2 — Update the existing module spec assertions

**File:** `src/events-toolkit.module.spec.ts`
**Location:** `forRootAsync` describe block, lines 110–117.

Replace the test:

```ts
    it('should expose sub-module services via global imports instead of exports', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const importNames = (module.imports ?? []).map(getModuleName);
      expect(importNames).toContain('ProducerModule');
      expect(importNames).toContain('ConsumerModule');
      expect(importNames).toContain('OutboxModule');
      expect(module.exports ?? []).toHaveLength(0);
    });
```

With:

```ts
    it('should import sub-modules globally and export toolkit-level tokens', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const importNames = (module.imports ?? []).map(getModuleName);
      expect(importNames).toContain('ProducerModule');
      expect(importNames).toContain('ConsumerModule');
      expect(importNames).toContain('OutboxModule');
      expect(module.exports).toContain('EVENTS_TOOLKIT_OPTIONS');
      expect(module.exports).toContain(JETSTREAM_TOKEN);
      expect(module.exports).toContain(EventLoggerService);
    });
```

Notes:
- `JETSTREAM_TOKEN` is already imported at the top of the spec (line 4). `EventLoggerService` is already imported (line 5). `'EVENTS_TOOLKIT_OPTIONS'` literal is already used as a string at line 132. No new imports needed.
- Do NOT change the `forRoot` test at line 54 (`expect(module.exports ?? []).toHaveLength(0)`) — the sync path intentionally has no exports.

**Verification command:**
```
npm test -- --testPathPattern=events-toolkit.module.spec
```

### Step 3.3 — Add a new DI compilation regression spec

**New file:** `src/events-toolkit.module.di.spec.ts`

Rationale for a dedicated `*.di.spec.ts` file:
- Mirrors the proven `src/producer/producer.module.di.spec.ts` naming pattern.
- Keeps the pure structural-assertion spec (`events-toolkit.module.spec.ts`) separate from the heavier DI-compile spec.
- `jest.config.js` `testRegex: '.*\\.spec\\.ts$'` with `rootDir: 'src'` auto-discovers it.

Full file content:

```ts
import 'reflect-metadata';
import { Module, Global } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, Reflector, MetadataScanner } from '@nestjs/core';
import { EventsToolkitModule } from './events-toolkit.module';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import { EventLoggerService } from './logging/event-logger.service';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    close: jest.fn(),
  }),
}));

jest.mock('./outbox/sqlite-outbox.repository', () => {
  const mockRepo = {
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  };
  return {
    SqliteOutboxRepository: jest.fn().mockImplementation(() => mockRepo),
  };
});

@Global()
@Module({
  providers: [
    {
      provide: DiscoveryService,
      useValue: {
        getProviders: jest.fn().mockReturnValue([]),
        getControllers: jest.fn().mockReturnValue([]),
      } as unknown as DiscoveryService,
    },
    { provide: Reflector, useValue: new Reflector() },
    { provide: MetadataScanner, useValue: { scanFromPrototype: jest.fn() } },
  ],
  exports: [DiscoveryService, Reflector, MetadataScanner],
})
class GlobalCoreModule {}

const forRootAsyncOptions = {
  useFactory: async () => ({
    nats: { servers: ['nats://localhost:4222'] },
  }),
};

async function compileToolkit(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [GlobalCoreModule, EventsToolkitModule.forRootAsync(forRootAsyncOptions)],
  }).compile();
}

describe('EventsToolkitModule.forRootAsync DI compilation (exports regression)', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('compiles and resolves ProducerService (depends on exported JETSTREAM_TOKEN)', async () => {
    moduleRef = await compileToolkit();

    expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
  });

  it('compiles and resolves ConsumerService and OutboxService (depend on exported token chain)', async () => {
    moduleRef = await compileToolkit();

    expect(moduleRef.get(ConsumerService)).toBeInstanceOf(ConsumerService);
    expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
  });

  it('exposes the toolkit-level EventLoggerService globally for consumer/outbox injection', async () => {
    moduleRef = await compileToolkit();

    expect(moduleRef.get(EventLoggerService)).toBeInstanceOf(EventLoggerService);
  });
});
```

Key design decisions documented for the implementer:
1. **`GlobalCoreModule`** provides `@nestjs/core`’s `DiscoveryService` (mock), `Reflector`, and `MetadataScanner`. These are consumed by `ManifestServiceDepsProvider` (`src/discovery/manifest-deps.provider.ts`) which is instantiated by `DiscoveryModule` (always imported by `forRootAsync`). This mirrors the proven pattern in `src/module-compilation.spec.ts` (`GlobalCoreModule`). Providing a mock `DiscoveryService` alongside the real `@nestjs/core DiscoveryService` from `ConsumerModule`’s `imports: [DiscoveryModule]` is safe — it is identical to the existing passing test in `module-compilation.spec.ts`.
2. **`jest.mock('nats', ...)`** prevents a real NATS connection from `buildAsyncJetStreamProvider` → `resolveConnection` → `connect()`. Without it the factory would attempt a real network call.
3. **`jest.mock('./outbox/sqlite-outbox.repository', ...)`** prevents `better-sqlite3` from opening a real `:memory:` DB during the outbox provider instantiation, keeping the test hermetic and fast.
4. **Resolving `ProducerService`** is the primary regression gate: `ProducerService` (`src/producer/producer.service.ts` lines 30–33) injects `JETSTREAM_TOKEN` and `EventLoggerService`. `ProducerModule.forRootAsync({ useExisting: JETSTREAM_TOKEN, ... })` does NOT create its own `JETSTREAM_TOKEN`, so resolution depends entirely on `EventsToolkitModule` exporting `JETSTREAM_TOKEN`. Without the fix, this `.compile()` throws `Nest cannot resolve dependencies of the ProducerService (?)`.
5. The imports block and the three `it` blocks above are the final, canonical content — no further edits needed. Do NOT import unused type symbols (`JetStreamClient`, `NatsConnection`, adapter aliases); they would trip strict TS `noUnusedLocals`.

**Verification command:**
```
npm test -- --testPathPattern=events-toolkit.module.di.spec
```

### Step 3.4 — Run the full test + build + lint suite

Run each as a single command (not chained), per the tool-selection rule:

```
npm run build
```
```
npm test
```
```
npm run lint
```
```
npm run typecheck
```

Expected outcomes after implementation:
- `npm run build`: succeeds (the `exports` array is type-valid `Provider`/token list).
- `npm test`: all existing specs pass; the updated `events-toolkit.module.spec.ts` forRootAsync test passes; the new `events-toolkit.module.di.spec.ts` (3 tests) passes. Without the 3.1 fix, the new DI specs would throw DI resolution errors (regression gate).
- `npm run lint`: no new lint errors (unused imports must be removed; the file stays well under method/line limits).
- `npm run typecheck`: no TS errors (verify no unused imports).

If any test fails, the implementer must investigate before proceeding (do NOT skip or `.skip` the new regression tests).

### Step 3.5 — Commit (handled by implementer in Step 4.2)

The implementer (Step 4.2) commits with a meaningful message, e.g.:

```
fix(events-toolkit): export toolkit tokens from forRootAsync

forRootAsync declared JETSTREAM_TOKEN, EVENTS_TOOLKIT_OPTIONS, and
EventLoggerService as providers but never exported them, so imported
sub-modules (ProducerModule via useExisting, ConsumerModule, OutboxModule,
DiscoveryModule) could not resolve these tokens at DI compile time.

Add exports array referencing the three toolkit-owned tokens. forRoot is
unaffected because it passes resolved values into each sub-module.

Update events-toolkit.module.spec.ts to assert the exports, and add
events-toolkit.module.di.spec.ts to compile forRootAsync via
Test.createTestingModule and resolve ProducerService/ConsumerService/
OutboxService as a DI regression gate.

Refs: .agent/todos/20260713/20260713-todo-0.md
```

Only `src/events-toolkit.module.ts`, `src/events-toolkit.module.spec.ts`, and the new `src/events-toolkit.module.di.spec.ts` should be staged. Run `git status` and `git diff` before committing (follow `.kilo/rules/gitignore-compliance.md`).

### Step 3.6 — Documentation (executed by docs-specialist in Step 4.4; recorded here)

Prepend a new CHANGELOG section above `[0.10.1]`:

```markdown
## [Unreleased]

### Fixed

- **`EventsToolkitModule.forRootAsync` missing exports.** The async registration path declared `JETSTREAM_TOKEN`, `EVENTS_TOOLKIT_OPTIONS`, and `EventLoggerService` as providers but never exported them. Because the module is `global: true`, only exported providers reach the global DI registry, so the imported sub-modules (`ProducerModule` via `useExisting`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`) could not resolve these tokens at compile time, causing `Nest can't resolve dependencies` startup failures in consumers using `forRootAsync` (e.g. `ms-db-gateway`). Added `exports: [EVENTS_TOOLKIT_OPTIONS, JETSTREAM_TOKEN, EventLoggerService]`. The synchronous `forRoot` path is unaffected.

### Added

- `src/events-toolkit.module.di.spec.ts` — DI compilation regression test that compiles `EventsToolkitModule.forRootAsync` through `Test.createTestingModule` and resolves `ProducerService`, `ConsumerService`, and `OutboxService`, preventing this class of export regression from recurring.
```

Also update `.agent/project-info/context.md` “Recent Changes” with a dated 2026-07-13 entry summarizing the fix (owner: docs-specialist in 4.4; architector only records the planned text here).

---

## 4. Files Touched

| File                                         | Action   | Purpose |
|----------------------------------------------|----------|---------|
| `src/events-toolkit.module.ts`               | Edit     | Add `exports` to `forRootAsync` return (Step 3.1) |
| `src/events-toolkit.module.spec.ts`          | Edit     | Replace `toHaveLength(0)` with `toContain` assertions; rename test (Step 3.2) |
| `src/events-toolkit.module.di.spec.ts`       | Create   | New DI compilation regression spec (Step 3.3) |
| `CHANGELOG.md`                               | Edit     | New `[Unreleased]` Fixed/Added section (Step 4.4) |
| `.agent/project-info/context.md`            | Edit     | Recent changes entry (Step 4.4) |

No other source files require changes (per the audit in §1.6).

---

## 5. Verification Checklist (for Step 4.5 — architector)

- [ ] `src/events-toolkit.module.ts` `forRootAsync` return object contains `exports: [EVENTS_TOOLKIT_OPTIONS, JETSTREAM_TOKEN, EventLoggerService]`.
- [ ] `forRoot` return object still has NO `exports` array (unchanged).
- [ ] `src/events-toolkit.module.spec.ts` forRootAsync test asserts all three tokens via `toContain`; forRoot test still asserts `toHaveLength(0)`.
- [ ] `src/events-toolkit.module.di.spec.ts` exists with 3 tests, all passing.
- [ ] `npm run build`, `npm test`, `npm run lint`, `npm run typecheck` all pass.
- [ ] No other module files modified (audit confirmed no other export issues).
- [ ] `CHANGELOG.md` has a new entry describing the fix and the new regression test.
- [ ] `.agent/project-info/context.md` updated with a 2026-07-13 dated entry.

---

## 6. Plan vs. Original TODO Task Comparison

TODO sub-items (under `### Fix library exports`):

1. “Update `EventsToolkitModule.forRootAsync` to add `exports: [optionsProvider, jetStreamProvider, loggingProvider]`” → Covered by Step 3.1. (Plan exports tokens rather than provider objects; both are NestJS-valid; tokens preferred for testability + codebase consistency. Functionally identical to the TODO’s described fix.)
2. “Verify `forRootAsync` path boots end-to-end in a test consumer” → Covered by Step 3.3 (compiles the full async root via `Test.createTestingModule` and resolves `ProducerService` + `ConsumerService` + `OutboxService`).
3. “Add unit test that compiles `EventsToolkitModule.forRootAsync` and resolves `ProducerService` (catches this DI regression)” → Covered by Step 3.3 (primary assertion is `ProducerService` resolution, which directly depends on the exported `JETSTREAM_TOKEN`).
4. “We had this type of problems before (check changelog). Review the library to confirm there is not other similar problems.” → Covered by §1.3 (0.7.4 analysis) and §1.6 (full module audit). Findings: only `EventsToolkitModule.forRootAsync` is affected; no other changes needed.

The plan fully satisfies the TODO task. No ambiguities remain; no assumptions were invented.