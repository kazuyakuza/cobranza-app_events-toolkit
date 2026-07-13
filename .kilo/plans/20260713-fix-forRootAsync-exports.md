# Global Plan — Fix: @cobranza-apps/events-toolkit EventsToolkitModule.forRootAsync missing exports

**TODO Source:** `.agent/todos/20260713/20260713-todo-0.md`
**Date:** 2026-07-13
**Version Bump:** `0.10.1` → `0.10.2` (patch — bug fix)

---

## Global Pre-Analysis

- **Problem:** `EventsToolkitModule.forRootAsync` creates `optionsProvider`, `jetStreamProvider`, and `loggingProvider` in its own scope but omits `exports`. Because the module is `global: true`, only exported providers become globally resolvable. The imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`) need these tokens (`JETSTREAM_TOKEN`, `EVENTS_TOOLKIT_OPTIONS`, `EventLoggerService`) and fail with NestJS DI errors.
- **Root cause location:** `src/events-toolkit.module.ts`, `forRootAsync` return object.
- **Synchronous path (`forRoot`):** Unaffected because resolved values are passed directly into sub-modules, which create their own local providers.
- **Existing tests:** `src/events-toolkit.module.spec.ts` asserts `module.exports` length is `0` for both `forRoot` and `forRootAsync`. These assertions must be updated after the fix.
- **Required new test:** DI compilation regression test that bootstraps `EventsToolkitModule.forRootAsync` via `Test.createTestingModule` and resolves `ProducerService` (or another sub-module service) to prove the export wiring is correct.
- **Review scope:** Check other library modules for similar missing-export issues (e.g., `forRoot` export of `loggingProvider`, sub-modules' internal provider visibility).

---

## Execution Order

### Step 2 — Git Feature Branch Setup
- **Agent:** `implementer`
- Run `git status`, commit any unstaged files (follow `.kilo/rules/gitignore-compliance.md`).
- Switch to `main`, create branch `feat/fix-forRootAsync-exports`.

### Step 3 — Version Update
- **Agent:** `implementer`
- Bump `package.json` version from `0.10.1` to `0.10.2`.
- Commit: `chore: bump version to 0.10.2`.

### Task 1 — Fix library exports

#### 4.1 Analysis & Planning
- **Agent:** `architector`
- Research exact DI failure paths, confirm which sub-modules import which tokens.
- Verify `forRootAsync` sub-module wiring (`ProducerModule.forRootAsync` with `useExisting`, `ConsumerModule.forRootAsync`, `OutboxModule.forRootAsync`, `DiscoveryModule.forRootAsync`).
- Decide test file name/location (update `src/events-toolkit.module.spec.ts` vs. new file).
- Produce detailed implementation plan saved to `.kilo/plans/20260713-fix-forRootAsync-exports-task1.md`.

#### 4.2 Implementation
- **Agent:** `implementer`
- Apply the detailed plan from 4.1.
- Add `exports: [optionsProvider, jetStreamProvider, loggingProvider]` to `forRootAsync` return object in `src/events-toolkit.module.ts`.
- Update `src/events-toolkit.module.spec.ts` to assert correct exports instead of `toHaveLength(0)`.
- Add unit test that compiles `EventsToolkitModule.forRootAsync` and resolves `ProducerService`.
- Run `npm test` and `npm run typecheck`.
- Commit with meaningful messages.

#### 4.3 Code Review & Simplification
- **Agents:** `code-reviewer` + `code-simplifier` (concurrent)
- Review implementation for correctness, plan adherence, and code quality.
- Generate fix/simplification plans saved to `.kilo/plans/20260713-fix-forRootAsync-exports-task1-fix.md`.
- **Then:** Plan Agent reviews and assigns fix plan to `implementer`.

#### 4.4 Documentation
- **Agent:** `docs-specialist`
- Update `CHANGELOG.md` with fix entry under `[0.10.2]`.
- Add inline JSDoc/TSDoc if needed to clarify `exports` intent in `events-toolkit.module.ts`.

#### 4.5 Verification
- **Agent:** `architector`
- Compare final implementation against the 4.1 plan.
- Run full test suite (`npm test`, `npm run test:e2e` if applicable).
- Report any deviations.

#### 4.6 Task Completion
- **Agent:** `implementer`
- Mark task as done in TODO file (add `[DONE]` to `### Fix library exports` heading).
- Update any sub-item checkboxes.
- Commit changes.

### Step 5 — TODO File Completion
- **Agent:** `implementer`
- Rename TODO file to `20260713-todo-0-DONE.md`.
- Ensure all changes are committed in `feat/fix-forRootAsync-exports`.
- Switch to `main`, merge branch.
- On success: delete feature branch.
- Push `main` to `origin` only (per `.kilo/rules/git-remote-safety.md`).

---

## Approval Options

- **Approve Global and Tasks Plans:** Execute all steps including 4.1 per task, auto-approve the per-task implementation plan, and proceed directly to 4.2.
- **Approve Global Plan:** Execute 4.1 per task, then present the detailed per-task plan for your approval before 4.2.

Please select an option to proceed.
