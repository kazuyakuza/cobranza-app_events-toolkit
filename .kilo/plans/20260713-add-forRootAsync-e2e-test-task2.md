# Plan — Task 2: Add end-to-end integration test for `EventsToolkitModule.forRootAsync`

Date: 20260713
TODO: `.agent/todos/20260713/20260713-todo-1.md` (section: "Add end-to-end integration test")
Branch: `feat/fix-discovery-module-imports-and-e2e-test`
Plan file: `.kilo/plans/20260713-add-forRootAsync-e2e-test-task2.md`

## 1. Goal

Create a fast, hermetic end-to-end integration test that compiles `EventsToolkitModule.forRootAsync`
with all sub-systems enabled (producer, consumer, outbox, discovery) and asserts the full DI graph
resolves — **without** manually providing `DiscoveryService`, `Reflector`, or `MetadataScanner`
(relying on the Bug 2 fix: `DiscoveryModule` now imports `NestDiscoveryModule` from `@nestjs/core`).
Then wire the unit + e2e test suites into CI so regressions are caught before publish.

## 2. Pre-Analysis

### 2.1 Test infrastructure facts (verified)

- `jest.config.js` — `rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`.
  - The regex `.*\.spec\.ts$` does **NOT** match `*.e2e-spec.ts` because the suffix is `-spec.ts`
    (hyphen before `spec`), not `.spec.ts` (dot before `spec`). So the e2e file is **excluded
    from the default `npm run test` suite**. Confirmed.
- `jest.e2e.config.js` — `rootDir: '.'`, `testRegex: '\\.e2e-spec\\.ts$'`, ts-jest with
  `tsconfig.jest.json` (extends `tsconfig.json`, adds `isolatedModules: true`).
  - This config **will** match `src/events-toolkit.module.e2e-spec.ts`. Confirmed.
- `package.json` scripts already include `test: jest` and `test:e2e: jest --config jest.e2e.config.js`.
- NO existing `*.e2e-spec.ts` files (confirmed via glob).
- `.gitignore` excludes `dist/`, `node_modules/`, `.events-toolkit/` (schema-gen output dir).

### 2.2 CRITICAL build gap (must fix)

`tsconfig.json` `exclude` only lists `**/*.spec.ts` and `**/*.test.ts`. A `*.e2e-spec.ts` file is
**not** excluded → `tsc -p tsconfig.build.json` (`npm run build`) would compile it into `dist/` and
ship the test in the published NPM package.

Fix: add `**/*.e2e-spec.ts` to the `exclude` arrays of **both** `tsconfig.json` and
`tsconfig.build.json`.

Note: excluding the e2e file from `tsconfig.json` does **not** prevent ts-jest from transpiling it
on the fly (the same mechanism already lets `.spec.ts` files run under jest despite being excluded
from tsconfig). Confirmed by the existing `*.spec.ts` behavior.

### 2.3 Mocking strategy (mirrors validated `events-toolkit.module.di.spec.ts`)

The existing `src/events-toolkit.module.di.spec.ts` already compiles `forRootAsync` and resolves
`ProducerService`/`ConsumerService`/`OutboxService` using exactly these two mocks:

- `jest.mock('nats')` → `connect` resolves a fake `NatsConnection` whose `jetstream()` returns a mock
  JetStream client (`publish`, `subscribe`). No real NATS server needed.
- `jest.mock('./outbox/sqlite-outbox.repository')` → `SqliteOutboxRepository` constructor returns a
  mock repository. Avoids native `better-sqlite3` + filesystem side effects.

These patterns are proven (the di.spec passes). The e2e test reuses them verbatim.

### 2.4 What the e2e test adds over the di.spec

The di.spec globally mocks `DiscoveryService`, `Reflector`, and `MetadataScanner` via a hand-rolled
`GlobalCoreModule`, so it does **not** exercise the real `DiscoveryModule` import path.

The e2e test imports ONLY `EventsToolkitModule.forRootAsync(...)` — no `GlobalCoreModule`. This forces
`DiscoveryModule.forRootAsync` to resolve `ManifestServiceDepsProvider`'s dependencies
(`MetadataScanner` via constructor; `DiscoveryService` + `Reflector` via property `@Inject`) from the
`NestDiscoveryModule` imported in `src/discovery/discovery.module.ts` (Bug 2 fix, lines 92 and 142).

### 2.5 Hermetic discovery options (design decision)

`DiscoveryService.onModuleInit` runs `SchemaGenerator.generateSchemasForManifest` (which persists
schema files to `.events-toolkit/schemas`) and emits an init log when `enabled && registerOnStartup`.
`onApplicationBootstrap` publishes a registration event when `enabled && registerOnStartup`.

To keep the test fast (<5s), hermetic (no filesystem writes, no network publishes), while still
exercising the **full discovery DI graph** (instantiation of `ManifestServiceDepsProvider`,
`DiscoveryService`, `ManifestService`, `SchemaGenerator`, `DiscoveryEventPublisher`), set:

```ts
discovery: { enabled: true, registerOnStartup: false }
```

`registerOnStartup: false` causes `DiscoveryService.onModuleInit` and `onApplicationBootstrap` to
early-return (no schema writes, no registration events), but every provider is still instantiated
during `compile()` — which is exactly the DI regression under guard. This still satisfies the
acceptance criterion "Enable all options (discovery, consumer, outbox)".

### 2.6 DI resolution confidence

- `ProducerService` ← `JETSTREAM_TOKEN` (async provider, exported by `forRootAsync` — Bug 1 fix).
- `ConsumerService` ← `ConsumerModule.forRootAsync` injecting `[JETSTREAM_TOKEN, EVENTS_TOOLKIT_OPTIONS]`.
- `OutboxService` ← mocked `SqliteOutboxRepository` + `ProducerService` + `EventLoggerService`.
- `DiscoveryService` ← `DiscoveryEventPublisher` + `DISCOVERY_MODULE_OPTIONS` + `ManifestService` +
  `SchemaGenerator`; `ManifestServiceDepsProvider` ← `MetadataScanner`/`DiscoveryService`/`Reflector`
  from `NestDiscoveryModule`.
- All four are `global: true` and exported, so `moduleRef.get(...)` resolves them at the root injector
  (same approach as the passing di.spec).

## 3. High-Level Approach

1. Create `src/events-toolkit.module.e2e-spec.ts` with the two `jest.mock` calls, a `forRootAsync`
   options factory enabling all sub-systems (discovery with `registerOnStartup: false`), a small
   `compileToolkitModule` helper, and four `it` blocks asserting compilation + resolution of
   `ProducerService`, `ConsumerService`, `OutboxService`, `DiscoveryService`.
2. Exclude `**/*.e2e-spec.ts` from `tsconfig.json` and `tsconfig.build.json` so the test is not
   compiled into/shipped in `dist/`.
3. Add `npm run test` and `npm run test:e2e` steps to `.github/workflows/npm-publish.yml` before the
   publish step, so CI blocks regressions.
4. Commit in two logical commits (test+tsconfig, then CI).
5. Verify locally: lint, typecheck, unit tests do not pick up the e2e file, e2e passes <5s, and
   `dist/` contains no e2e artifact.

## 4. Detailed Steps

### Step 4.1 — Create the e2e test file

Create file: `src/events-toolkit.module.e2e-spec.ts`

Exact content:

```ts
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsToolkitModule } from './events-toolkit.module';
import { EventsToolkitModuleAsyncOptions } from './events-toolkit-options.interface';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import { DiscoveryService } from './discovery/discovery.service';

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    close: jest.fn(),
  }),
}));

jest.mock('./outbox/sqlite-outbox.repository', () => ({
  SqliteOutboxRepository: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markAsSent: jest.fn(),
    markAsFailed: jest.fn(),
  })),
}));

function buildForRootAsyncOptions(): EventsToolkitModuleAsyncOptions {
  return {
    useFactory: async () => ({
      nats: { servers: ['nats://localhost:4222'] },
      consumer: { enable: true },
      outbox: { type: 'sqlite' as const },
      discovery: { enabled: true, registerOnStartup: false },
    }),
  };
}

async function compileToolkitModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [EventsToolkitModule.forRootAsync(buildForRootAsyncOptions())],
  }).compile();
}

describe('EventsToolkitModule.forRootAsync e2e DI compilation', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('compiles the full toolkit graph without external core providers', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef).toBeDefined();
  });

  it('resolves ProducerService from the compiled module', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(ProducerService)).toBeInstanceOf(ProducerService);
  });

  it('resolves ConsumerService from the compiled module', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(ConsumerService)).toBeInstanceOf(ConsumerService);
  });

  it('resolves OutboxService from the compiled module', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
  });

  it('resolves DiscoveryService via the fixed NestDiscoveryModule import', async () => {
    moduleRef = await compileToolkitModule();

    expect(moduleRef.get(DiscoveryService)).toBeInstanceOf(DiscoveryService);
  });
});
```

Rules compliance:
- File length ~78 lines (< 200).
- Each `it` body ≤ 3 lines (< 50). Helpers ≤ 8 lines.
- Max nesting depth = 1 in `it` blocks, 1 in `afterEach`.
- No function exceeds 2 params.
- No commented code; explicit names; self-documenting.
- Private members N/A (no classes).

### Step 4.2 — Exclude e2e-spec from the build (tsconfig)

`tsconfig.json` — replace the `exclude` array (lines 32-37):

From:
```json
  "exclude": [
    "node_modules",
    "dist",
    "**/*.spec.ts",
    "**/*.test.ts"
  ]
```

To:
```json
  "exclude": [
    "node_modules",
    "dist",
    "**/*.spec.ts",
    "**/*.test.ts",
    "**/*.e2e-spec.ts"
  ]
```

`tsconfig.build.json` — replace the `exclude` array (line 7):

From:
```json
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "**/__mocks__/**"]
```

To:
```json
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "**/*.e2e-spec.ts", "**/__mocks__/**"]
```

### Step 4.3 — Add test steps to CI

`.github/workflows/npm-publish.yml` — insert two new steps immediately after the `Build` step
(line 36) and before the `Check published version` step (line 37).

From:
```yaml
      - name: Build
        run: npm run build
      - name: Check published version
```

To:
```yaml
      - name: Build
        run: npm run build
      - name: Run unit tests
        run: npm run test
      - name: Run e2e tests
        run: npm run test:e2e
      - name: Check published version
```

Effect: both test suites run on every push to `main`; a failing test aborts the job before publish.
(`npm run test` triggers the `pretest` script (`npm run build`) which re-cleans/rebuilds `dist/`
idempotently — acceptable and harmless.)

### Step 4.4 — Git actions (implementer, step 4.2)

Before committing, run `git status` and confirm only intended files are staged (Gitignore
Compliance Rule). Expected changed/added files:
- `src/events-toolkit.module.e2e-spec.ts` (new)
- `tsconfig.json` (modified)
- `tsconfig.build.json` (modified)
- `.github/workflows/npm-publish.yml` (modified)

Two commits suggested:

1. `test: add forRootAsync e2e test and exclude e2e-spec from build`
   - Stage: `src/events-toolkit.module.e2e-spec.ts`, `tsconfig.json`, `tsconfig.build.json`.
2. `ci: run unit and e2e tests before npm publish`
   - Stage: `.github/workflows/npm-publish.yml`.

Do NOT push, do NOT merge to `main`, do NOT mark the TODO `[DONE]` (those are later workflow steps).

### Step 4.5 — Local verification commands (implementer)

Run each as a single bash command (no chaining):

- `npm run lint` — must pass (lint covers `src/**/*.ts`, including the new e2e file).
- `npm run typecheck` — must pass (e2e file is now excluded from tsconfig; typecheck will not
  include it, but ts-jest will type-check it during the e2e run).
- `npm run test` — unit suite; confirm the e2e file is **not** executed (no e2e `describe` in
  output).
- `npm run test:e2e` — must pass; the 5 e2e `it` blocks must succeed; total runtime < 5s.
- `npm run build` — must succeed.
- Verify no e2e artifact shipped in dist:
  `Get-ChildItem dist -Recurse -Filter "*e2e-spec*"` — expected output: none.

### Step 4.6 — Acceptance criteria checklist (verification, step 4.5)

- [ ] `events-toolkit.module.e2e-spec.ts` created; compiles `EventsToolkitModule.forRootAsync`.
- [ ] `NATS_CONNECTION`/`nats.connect` mocked (no real server).
- [ ] All options enabled: discovery, consumer, outbox.
- [ ] Asserts `.compile()` and `moduleRef.get` for `ProducerService`, `DiscoveryService`,
      `ConsumerService`, `OutboxService`.
- [ ] Does NOT manually provide `DiscoveryService`, `Reflector`, or `MetadataScanner`.
- [ ] CI runs `npm run test` and `npm run test:e2e` before publish.
- [ ] Test < 5s, hermetic (no FS writes, no network).
- [ ] `dist/` contains no e2e-spec file.
- [ ] All existing library tests still pass.

## 5. Files Touched (summary)

| File | Action |
| --- | --- |
| `src/events-toolkit.module.e2e-spec.ts` | create |
| `tsconfig.json` | edit `exclude` |
| `tsconfig.build.json` | edit `exclude` |
| `.github/workflows/npm-publish.yml` | add 2 test steps |

## 6. Out of Scope (NOT done in this step)

- No implementation code edits (only plan).
- No git commits / branch operations (deferred to implementer step 4.2).
- No TODO `[DONE]` marking (deferred to step 4.6).
- No merge to `main` or push (deferred to step 5).
- No changes to `jest.e2e.config.js`, `jest.config.js`, `package.json`, or `tsconfig.jest.json`
  (already correct).

## 7. Risks & Mitigations

- Risk: compile() triggers `onModuleInit` → schema file writes. Mitigation: `registerOnStartup:
  false` early-returns; `.gitignore` also ignores `.events-toolkit/`.
- Risk: e2e file accidentally runs under unit suite. Mitigation: verified regex mismatch of
  `.*\.spec\.ts$` vs `*.e2e-spec.ts`; confirm in step 4.5.
- Risk: e2e file compiled into published package. Mitigation: tsconfig exclude added; verify
  `dist/` in step 4.5.