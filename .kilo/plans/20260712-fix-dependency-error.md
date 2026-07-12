# Global Plan — Fix Dependency Error (Circular Import)

## Task Source
`.agent/todos/20260712/20260712-todo-0.md`

## Pre-analysis

### Bug Description
In `ms-db-gateway` (consumer of this library), starting the NestJS app fails with:
`Nest can't resolve dependencies of the EmitEventInterceptor (Reflector, ?).`

### Root Cause
A circular import exists in the `producer` module:
- `src/producer/decorators/emit-event-interceptor.ts` imports `ProducerService` from `../producer.service`
- `src/producer/producer.service.ts` imports `JETSTREAM_TOKEN` from `./producer.module`
- `src/producer/producer.module.ts` imports `EmitEventInterceptor` from `./decorators/emit-event-interceptor`

At runtime, when `producer.module.ts` is evaluated, it requires `emit-event-interceptor.ts`, which requires `producer.service.ts`. Since `producer.service.ts` is still executing its own imports (it hasn't reached the `export class ProducerService` line yet), `ProducerService` is `undefined` in the circular require. NestJS stamps `design:paramtypes[1]` as `undefined`, causing the dependency resolution failure.

### Fix Strategy
Extract `JETSTREAM_TOKEN` (and `ProducerModuleOptions`, `ProducerModuleAsyncOptions` for consistency) from `producer.module.ts` into a new `src/producer/producer.constants.ts` file. Update all imports. This breaks the cycle because `producer.service.ts` will no longer import from `producer.module.ts`.

### Review of Other Modules
- **Consumer**: `consumer-module.providers.ts` imports from `consumer.module.ts`, but only string constants and interfaces (erased at runtime). Safe.
- **Discovery**: `discovery.service.ts` and `discovery-event-publisher.service.ts` import `DiscoveryModuleOptions` (interface, erased) from `discovery.module.ts`. Safe.
- **Outbox**: No cycles detected.
- **EventsToolkitModule**: No cycles detected.
- **Conclusion**: No other runtime dangerous circular dependencies.

### Test Strategy
Existing unit tests for `EmitEventInterceptor` manually instantiate the class, bypassing NestJS DI. `producer.service.spec.ts` only checks static exports. We will add DI compilation tests that use `Test.createTestingModule` to compile each module and resolve key providers. These tests would have caught the undefined dependency.

## Steps

### Step 2: Git Feature Branch Setup
- `git status`: verify clean working tree.
- Create and switch to branch `feat/fix-dependency-error`.

### Step 3: Version Update
- Bump `package.json` version `0.10.0` → `0.10.1`.
- Commit: `chore: bump version to 0.10.1`.

### Task Execution (4.1 – 4.6)

#### 4.1 Analysis & Planning
- Architector confirms fix strategy and test approach.
- Save per-task plan to `.kilo/plans/20260712-fix-dependency-error-task.md`.

#### 4.2 Implementation
- Create `src/producer/producer.constants.ts` exporting `JETSTREAM_TOKEN`, `ProducerModuleOptions`, `ProducerModuleAsyncOptions`.
- Update `src/producer/producer.module.ts`: import symbols from `./producer.constants`, remove local definitions.
- Update `src/producer/producer.service.ts`: import `JETSTREAM_TOKEN` from `./producer.constants`.
- Update `src/producer/index.ts`: export `JETSTREAM_TOKEN` from `./producer.constants`.
- Update `src/events-toolkit.module.ts`: import `JETSTREAM_TOKEN` from `./producer/producer.constants`.
- Update `src/events-toolkit.module.spec.ts`: import `JETSTREAM_TOKEN` from `./producer/producer.constants`.
- Update `src/producer/producer.service.spec.ts`: import `JETSTREAM_TOKEN` from `./producer.constants`.
- Update `src/producer/decorators/emit-event-interceptor.spec.ts`: import `JETSTREAM_TOKEN` from `../producer.constants`.
- Add `src/producer/producer.module.di.spec.ts` that compiles `ProducerModule` with `Test.createTestingModule` and resolves `EmitEventInterceptor` via DI.
- Add `src/module-compilation.spec.ts` that compiles `ConsumerModule`, `OutboxModule`, `DiscoveryModule` and resolves key providers as a smoke test.
- Run `npm run build` and `npm test` to verify.
- Commit.

#### 4.3 Code Review & Simplification
- Code-reviewer checks for import path errors and missing updates.
- Code-simplifier reviews for any unnecessary complexity.
- If issues found, implementer applies fixes.

#### 4.4 Documentation
- Update `CHANGELOG.md` with fix entry (v0.10.1).
- Add JSDoc to `src/producer/producer.constants.ts`.

#### 4.5 Verification
- Architector re-runs `npm run build` and `npm test`.
- Confirms no other circular dependencies exist.

#### 4.6 Task Completion
- Append `[DONE]` to task in TODO file.
- Commit.

### Step 5: TODO File Completion
- Rename TODO file to `20260712-todo-0-DONE.md`.
- Merge `feat/fix-dependency-error` into `main`.
- Push `main` to `origin`.
- Delete feature branch.

### Step 6: Continuation
- Prompt user for next TODO.
