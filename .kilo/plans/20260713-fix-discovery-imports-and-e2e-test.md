# Global Plan — Fix @cobranza-apps/events-toolkit DI Resolution Audit

## Source

TODO file: `.agent/todos/20260713/20260713-todo-1.md`

## Objective

Fix the remaining DI resolution bug in `DiscoveryModule` (Bug 2) and add an end-to-end integration test that compiles `EventsToolkitModule.forRootAsync` with all sub-modules enabled to prevent regressions.

## Pre-Analysis

### Current State
- Version: `0.10.2`
- Branch: `main`
- Bug 1 (missing exports in `EventsToolkitModule.forRootAsync`) is already fixed in 0.10.2.
- Bug 2 (DiscoveryModule missing `@nestjs/core` DiscoveryModule import) is **still broken**.
- There are **no** `.e2e-spec.ts` files in the project yet.
- CI workflow (`.github/workflows/npm-publish.yml`) currently only runs `npm run build` — it does **not** run tests.

### Bug 2 Root Cause
`DiscoveryModule.forRoot` and `DiscoveryModule.forRootAsync` provide `ManifestServiceDepsProvider`, which injects:
- `MetadataScanner` (constructor parameter)
- `DiscoveryService` (`@Inject(DiscoveryService)`)
- `Reflector` (`@Inject(Reflector)`)

All three are provided by `@nestjs/core`'s `DiscoveryModule`, but the library's `DiscoveryModule` never imports it. This causes:

```
Nest can't resolve dependencies of the ManifestServiceDepsProvider (?).
Please make sure that the argument MetadataScanner at index [0] is available in the DiscoveryModule module.
```

### Existing Test Patterns
- `src/events-toolkit.module.di.spec.ts` — Tests `forRootAsync` compilation but mocks `DiscoveryService`, `Reflector`, and `MetadataScanner` via a `GlobalCoreModule`, so it **does not** exercise the `DiscoveryModule` import path.
- `src/module-compilation.spec.ts` — Tests `forRoot` compilation with `DiscoveryModule.forRoot({ enabled: false })` but also mocks the core services globally, bypassing the missing import.
- `jest.config.js` — Runs `*.spec.ts` in `src/`.
- `jest.e2e.config.js` — Runs `*.e2e-spec.ts` from root, but no such files exist.

### Technical Decisions
- Import `DiscoveryModule as NestDiscoveryModule` from `@nestjs/core` into `DiscoveryModule.forRoot` and `DiscoveryModule.forRootAsync`.
- The new e2e test will live at `src/events-toolkit.module.e2e-spec.ts` (or root-level `test/events-toolkit.module.e2e-spec.ts`). Since `jest.e2e.config.js` uses `rootDir: '.'` and `testRegex: '\\.e2e-spec\\.ts$'`, placing it at `src/events-toolkit.module.e2e-spec.ts` is acceptable (it will match the regex and ts-jest will compile it from root).
- The e2e test must mock `NATS_CONNECTION` (or let `connect` resolve via jest.mock) but exercise the full DI graph including `DiscoveryModule` without manually providing `DiscoveryService`, `Reflector`, `MetadataScanner`.
- The e2e test must be fast (no real NATS server required) — mock `nats.connect` to return a mock connection with `jetstream()`.
- CI must run `npm run test` before publish to ensure tests pass.

## Global Execution Flow

- Step 2: Git Feature Branch Setup => implementer
- Step 3: Version Update => implementer (bump to 0.10.3, patch-level fix)
- Task 1 — Fix DiscoveryModule imports:
  - 4.1 Analysis & Planning => architector
  - 4.2 Implementation => implementer
  - 4.3 Code Review & Simplification => code-reviewer + code-simplifier; 4.3-fix => implementer
  - 4.4 Documentation => docs-specialist
  - 4.5 Verification => architector
  - 4.6 Task Completion => implementer
- Task 2 — Add end-to-end integration test:
  - 4.1 Analysis & Planning => architector
  - 4.2 Implementation => implementer
  - 4.3 Code Review & Simplification => code-reviewer + code-simplifier; 4.3-fix => implementer
  - 4.4 Documentation => docs-specialist
  - 4.5 Verification => architector
  - 4.6 Task Completion => implementer
- Step 5: TODO File Completion => implementer

## Task 1 — Fix DiscoveryModule imports

### 4.1 Plan

Plan path: `.kilo/plans/20260713-fix-discovery-module-imports-task1.md`

1. **Analyze** `src/discovery/discovery.module.ts` to confirm exactly where `NestDiscoveryModule` import must be added.
2. **Confirm** there are no naming collisions — alias `DiscoveryModule` from `@nestjs/core` as `NestDiscoveryModule`.
3. **Plan edits**:
   - Add `import { DiscoveryModule as NestDiscoveryModule } from '@nestjs/core';` at top of `src/discovery/discovery.module.ts`.
   - In `forRoot`: add `imports: [NestDiscoveryModule]` to the returned `DynamicModule`.
   - In `forRootAsync`: add `imports: [NestDiscoveryModule, ...(asyncOptions.imports ?? [])]` to the returned `DynamicModule`.
4. **Verify** `module-compilation.spec.ts` and `events-toolkit.module.di.spec.ts` still pass after the change (they may need to remove manual `GlobalCoreModule` mocks if they were compensating, but per the TODO the test changes are in Task 2).

### 4.2 Implementation Steps

1. Edit `src/discovery/discovery.module.ts`:
   - Add import line.
   - Update `forRoot` return object.
   - Update `forRootAsync` return object.
2. Commit with message: `fix: import NestDiscoveryModule in DiscoveryModule.forRoot and forRootAsync`
3. Run `npm run typecheck`.
4. Run `npm run test` (all existing tests should still pass because the existing tests mock the missing services globally).

### 4.3 Code Review & Simplification

- Check for duplicate imports, unused symbols, or any side effects.
- Ensure no other module has the same missing-import pattern.

### 4.4 Documentation

- Add inline JSDoc to `DiscoveryModule` explaining the `@nestjs/core` import.
- Update `CHANGELOG.md` with the fix entry.

### 4.5 Verification

- Run full test suite.
- Confirm `npm run typecheck` is clean.

### 4.6 Task Completion

- Mark Task 1 as `[DONE]` in TODO file.
- Commit.

## Task 2 — Add end-to-end integration test

### 4.1 Plan

Plan path: `.kilo/plans/20260713-add-forRootAsync-e2e-test-task2.md`

1. **Analyze** existing test patterns:
   - `events-toolkit.module.di.spec.ts` mocks `nats.connect` globally.
   - `module-compilation.spec.ts` uses `GlobalCoreModule` to mock core services.
   - The new e2e test must **NOT** mock `DiscoveryService`, `Reflector`, or `MetadataScanner` — it must rely on the fixed `DiscoveryModule` import to provide them.
2. **Decide** test file location: `src/events-toolkit.module.e2e-spec.ts` (matches `jest.e2e.config.js` regex).
3. **Plan test contents**:
   - Mock `nats.connect` to return a connection with `jetstream()` returning a mock JetStream client.
   - Use `Test.createTestingModule` importing `EventsToolkitModule.forRootAsync` with options enabling all subsystems:
     - `nats: { servers: ['nats://localhost:4222'] }`
     - `consumer: { enable: true }`
     - `outbox: { type: 'sqlite' }`
     - `discovery: { enabled: true }`
   - Call `.compile()`.
   - Assert key services resolve:
     - `ProducerService`
     - `ConsumerService`
     - `OutboxService`
     - `DiscoveryService` (from `src/discovery/discovery.service.ts`, alias `AppDiscoveryService` in existing tests)
4. **Plan CI update**:
   - Modify `.github/workflows/npm-publish.yml` to add a `test` step before `build` (or after build) that runs `npm run test`.
   - Ensure `npm run test` runs unit tests (the new e2e file will be picked up by `jest.e2e.config.js` if run separately, but we can add it to the regular jest config or create a dedicated `test:ci` script).
   - Decision: add `npm run test` to CI after `npm run build`. The new test file should use `.e2e-spec.ts` extension and be run via `npm run test:e2e`. Update CI to also run `npm run test:e2e`.

### 4.2 Implementation Steps

1. Create `src/events-toolkit.module.e2e-spec.ts`.
2. Write the test following the pattern above.
3. Update `package.json` scripts if needed (e.g., ensure `test:e2e` exists and works).
4. Update `.github/workflows/npm-publish.yml`:
   - Add `npm run test` step after build.
   - Add `npm run test:e2e` step after unit tests.
5. Run `npm run test:e2e` to verify the new test passes.
6. Run `npm run test` to verify no regressions.
7. Commit with message: `test: add end-to-end forRootAsync DI compilation test`
8. Commit CI update with message: `ci: run tests before publishing`.

### 4.3 Code Review & Simplification

- Review test for flakiness, unnecessary async/await, or overly broad assertions.
- Simplify where possible.

### 4.4 Documentation

- Add JSDoc to the test file describing its purpose.
- Update `CHANGELOG.md` with the new test entry.
- Update `docs/testing-utilities.md` if there is guidance on e2e testing patterns.

### 4.5 Verification

- Run full test suite (`npm run test` + `npm run test:e2e`).
- Confirm CI workflow syntax is valid.

### 4.6 Task Completion

- Mark Task 2 as `[DONE]` in TODO file.
- Commit.

## Constraints & Rules

- Follow `.agent/RULES.md` and `.kilo/rules/*`:
  - Max 200 lines per file in `src/`.
  - Max 50 lines per method body.
  - Max 2 levels of indentation.
  - Max 2 parameters per method/function.
  - Prefer private members.
  - Self-documenting code.
  - No commented-out code.
  - Single-section boolean conditions.
- Follow `tool-selection-priority.md`: prefer semantic MCP tools for code changes.
- Git remote safety: push only to `origin`.
- Gitignore compliance: check before commits.

## Risk Mitigation

- The existing tests mock core NestJS services globally, so the missing import was masked. The new e2e test is designed to expose this directly.
- If adding `NestDiscoveryModule` import causes any existing test to fail (because it now provides real `DiscoveryService` instead of mocked), the test may need to be adjusted to not import `GlobalCoreModule` when testing DiscoveryModule specifically. This is expected and part of the fix validation.
