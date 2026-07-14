# Plan: Task 1 — Fix DiscoveryModule imports

Single TODO file: `.agent/todos/20260713/20260713-todo-1.md`
Task scope: Section `### Fix DiscoveryModule imports` under `## Tasks`.
Branch: `feat/fix-discovery-module-imports-and-e2e-test` (already checked out — no git actions required for this plan step).

## Problem Analysis

### Root Cause

`src/discovery/discovery.module.ts` `DiscoveryModule.forRoot` (lines 104–110) and `DiscoveryModule.forRootAsync` (lines 129–136) return a `DynamicModule` with no `imports` (forRoot) or only user-supplied `imports` (forRootAsync).

`ManifestServiceDepsProvider` (`src/discovery/manifest-deps.provider.ts`) declares:
- Constructor param `MetadataScanner` (positional, index 0)
- Property `@Inject(DiscoveryService) discovery`
- Property `@Inject(Reflector) reflector`

All three tokens are exported by `@nestjs/core`'s `DiscoveryModule` (`MetadataScanner`, `DiscoveryService`, `Reflector`). Without importing `@nestjs/core`'s `DiscoveryModule`, Nest cannot resolve `MetadataScanner` inside the library's `DiscoveryModule` context.

### Reference Pattern (correct)

`src/consumer/consumer.module.ts` uses the correct pattern:
- `import { DiscoveryModule } from '@nestjs/core';` (line 2)
- `forRoot` returns `imports: [DiscoveryModule]` (line 89)
- `forRootAsync` returns `imports: [DiscoveryModule, ...(asyncOptions.imports ?? [])]` (line 128)

The library's `DiscoveryModule` must follow the same pattern, importing `@nestjs/core`'s `DiscoveryModule` re-aliased as `NestDiscoveryModule` to avoid name collision with the local class.

### Other Modules — Audit Result

Checked for the same missing-import pattern in other library modules that depend on `@nestjs/core` discovery primitives:

- `src/consumer/consumer.module.ts`: imports `DiscoveryModule` from `@nestjs/core` in both `forRoot` and `forRootAsync` — CORRECT. No fix needed.
- `src/discovery/discovery.module.ts`: BROKEN. This is the only module with the missing-import bug for the current task scope.

No other module requires changes within Task 1 scope. (Task 2 — e2e test — is a separate task and not part of this plan.)

## High-Level Approach

1. Import `DiscoveryModule as NestDiscoveryModule` from `@nestjs/core` in `src/discovery/discovery.module.ts`.
2. Add `imports: [NestDiscoveryModule]` to the `forRoot` return.
3. Add `NestDiscoveryModule` to the `imports` array in the `forRootAsync` return (prepended before user-supplied imports).
4. Run the library test suite to confirm no regressions.
5. Document the `npm run dev` verification in `ms-db-gateway` as a manual end-consumer boot check (out of library scope; not executable from this repository).

## Detailed Steps

### Step 1 — Add `@nestjs/core` import alias

File: `src/discovery/discovery.module.ts`
Location: Below existing import block (after line 11, before the `export interface DiscoveryModuleOptions` on line 14).

Add:
```typescript
import { DiscoveryModule as NestDiscoveryModule } from '@nestjs/core';
import { DynamicModule, Module, Type } from '@nestjs/common';
```

Note: `@nestjs/common` is already imported on line 1. The `@nestjs/core` import line must be inserted as a new line. Place it directly above or below line 1 preserving existing imports. Recommended placement (immediately after line 1):

```typescript
import { DynamicModule, Module, Type } from '@nestjs/common';
import { DiscoveryModule as NestDiscoveryModule } from '@nestjs/core';
```

The alias `NestDiscoveryModule` prevents collision with the local class `DiscoveryModule` declared on line 90.

### Step 2 — Update `forRoot` return

File: `src/discovery/discovery.module.ts`, method `forRoot`, lines 104–110.

Current:
```typescript
    return {
      module: DiscoveryModule,
      global: true,
      providers,
      exports: exported,
      controllers: [DiscoveryController],
    };
```

Replace with:
```typescript
    return {
      module: DiscoveryModule,
      global: true,
      imports: [NestDiscoveryModule],
      providers,
      exports: exported,
      controllers: [DiscoveryController],
    };
```

### Step 3 — Update `forRootAsync` return

File: `src/discovery/discovery.module.ts`, method `forRootAsync`, lines 129–136.

Current:
```typescript
    return {
      module: DiscoveryModule,
      global: true,
      providers,
      exports: exported,
      imports: asyncOptions.imports ?? [],
      controllers: [DiscoveryController],
    };
```

Replace with:
```typescript
    return {
      module: DiscoveryModule,
      global: true,
      providers,
      exports: exported,
      imports: [NestDiscoveryModule, ...(asyncOptions.imports ?? [])],
      controllers: [DiscoveryController],
    };
```

`NestDiscoveryModule` is prepended so its providers (`MetadataScanner`, `DiscoveryService`, `Reflector`) are always available, regardless of whether the caller supplies `asyncOptions.imports`.

### Step 4 — Run library test suite

Command (from repository root `C:\projects\cobranza-app\events-toolkit`):
```bash
npm test
```

Expected: All existing tests pass. No new test is added in Task 1 (e2e test belongs to Task 2).

### Step 5 — Commit the fix

The Critical Workflow step 4.2 (Implementation) owns the commit. This plan only specifies the message for that step:
```text
fix(discovery): import @nestjs/core DiscoveryModule to resolve MetadataScanner DI
```

### Step 6 — Manual end-consumer verification (out of library scope)

The TODO acceptance item "Verify `npm run dev` boots end-to-end in `ms-db-gateway`" targets a separate repository, not this library. Actions:

1. Open the `ms-db-gateway` repository.
2. Ensure it depends on a build of this library containing the fix (local link or published patch version per Bug 1 note: 0.10.2 → bump to 0.10.3 as part of Step 3 Version Update in the global Critical Workflow).
3. Run `npm run dev` in `ms-db-gateway`.
4. Confirm no `Nest can't resolve dependencies of the ManifestServiceDepsProvider` error.

This verification cannot be executed from the `events-toolkit` repository. It is recorded here as the required manual acceptance step; the implementer must surface it to the caller.

## Compliance Checks Against Project Rules

- `max-lines-per-file`: Target file grows by 2 lines → ~140 lines total, under 200. OK.
- `max-lines-per-method`: `forRoot` and `forRootAsync` bodies unchanged in length materially; both well under 50 body lines. OK.
- `max-depth`: No new nesting introduced. OK.
- `max-2-params`: Method signatures unchanged. OK.
- `single-section-boolean-conditions`: No new boolean conditions. OK.
- `prefer-private-members`: `NestDiscoveryModule` is an import alias, not a member. OK.
- `no-commented-code`: No commented code introduced. OK.
- `self-documenting-code`: Alias `NestDiscoveryModule` clearly distinguishes `@nestjs/core` module from local class. No comment required. OK.

## Out of Scope (do NOT do in Task 1)

- Creating `events-toolkit.module.e2e-spec.ts` (Task 2).
- Mocking `NATS_CONNECTION` (Task 2).
- Version bump in `package.json` (Critical Workflow Step 3, separate assignment).
- Updating `.agent/project-structure.md` (no new folders).

## Verification of Plan vs. Original Task

TODO Task 1 items:
- `[ ] Update DiscoveryModule.forRoot to import NestDiscoveryModule from @nestjs/core` → Step 2. ✓
- `[ ] Update DiscoveryModule.forRootAsync to import NestDiscoveryModule from @nestjs/core` → Step 3. ✓
- `[ ] Verify npm run dev boots end-to-end in ms-db-gateway` → Step 6 (manual, out-of-lib). ✓

Plan matches original task scope. No scope creep into Task 2.

## Plan File

`C:\projects\cobranza-app\events-toolkit\.kilo\plans\20260713-fix-discovery-module-imports-task1.md`