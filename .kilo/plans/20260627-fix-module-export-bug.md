# Global Plan — Fix `@cobranza-apps/events-toolkit` Module Export Bug

**Date:** 2026-06-27
**TODO:** `.agent/todos/20260627/20260627-todo-0.md`
**Branch:** `feat/fix-module-export-bug`
**Version Bump:** `0.7.3` → `0.7.4` (patch)

---

## Pre-Analysis

### Problem Summary
`EventsToolkitModule.forRoot()` and `EventsToolkitModule.forRootAsync()` export service tokens (`ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, `DiscoveryService`) that are not present in the module's own `providers` array. These services belong to imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`), all declared with `global: true`. NestJS 11's `Module.validateExportedProvider` rejects exporting a token that is neither in the module's own providers nor directly re-exported from an `imports` entry.

### Root Cause
`src/events-toolkit.module.ts` lines 108 and 134 contain `exports` arrays referencing services provided by sub-modules.

### Tasks from TODO File
The TODO file contains **4 tasks**:
1. Fix `forRoot` and `forRootAsync` exports
2. Verify the fix (write/update compilation tests)
3. Update `EventsToolkitTestModule` if needed
4. Changelog and Documentation

### Task Merging Decision
**Tasks 1, 2, and 3 are merged into a single implementation cycle** because they are tightly coupled (code fix + test verification + test module validation). They will be treated as **Task 1: Fix and Verify Module Exports**.

**Task 4 remains separate** as **Task 2: Documentation and Changelog**.

---

## Execution Steps

### Step 2: Git Feature Branch Setup
**Agent:** `implementer`
- Commit untracked `.agent/todos/20260627/` (if required by gitignore compliance).
- Create and switch to branch `feat/fix-module-export-bug`.

### Step 3: Version Update
**Agent:** `implementer`
- Bump `package.json` version from `0.7.3` to `0.7.4`.
- Commit: `chore: bump version to 0.7.4`.

### Task 1: Fix and Verify Module Exports

#### 4.1 Analysis & Planning
**Agent:** `architect`
- Analyze the three fix options (A: remove exports, B: re-export modules, C: add `useExisting` providers).
- Decide the best approach considering:
  - All sub-modules are `global: true`
  - NestJS 11 validation rules
  - Backward compatibility for consumers
  - Impact on `EventsToolkitTestModule`
- Produce detailed implementation plan with exact file paths, line numbers, and code snippets.
- Save plan to `.kilo/plans/20260627-fix-module-export-bug-task1.md`.
- Return plan path.

#### 4.2 Implementation
**Agent:** `implementer`
- Follow the approved plan from 4.1.
- Apply the chosen fix to `src/events-toolkit.module.ts`.
- Update `src/events-toolkit.module.spec.ts` to:
  - Remove obsolete `exports` assertions.
  - Add NestJS compilation tests for both `forRoot` and `forRootAsync`.
- Verify `EventsToolkitTestModule` behavior and update if necessary.
- Commit with meaningful messages.

#### 4.3 Code Review
**Agent:** `code-reviewer`
- Review all changed files for correctness, plan adherence, and rule compliance.
- If issues found, generate fix plan and assign to implementer (max 3 cycles).

#### 4.4 Documentation
**Agent:** `docs-specialist`
- Update any inline code comments or JSDoc if the fix changes public API behavior.

#### 4.5 Verification
**Agent:** `architect`
- Run `npm test` to ensure all tests pass.
- Run `npm run typecheck` to ensure no TypeScript errors.
- Run `npm run lint` to ensure no lint errors.
- Commit any unstaged changes.

#### 4.6 Task Completion
**Agent:** `implementer`
- Mark Task 1 as `[DONE]` in `.agent/todos/20260627/20260627-todo-0.md`.
- Commit: `chore: mark task 1 as done in TODO file`.

### Task 2: Documentation and Changelog

#### 4.1 Analysis & Planning
**Agent:** `architect`
- Determine what docs need updating (README, usage guides, etc.).
- Define CHANGELOG format and initial structure.
- Save plan to `.kilo/plans/20260627-fix-module-export-bug-task2.md`.
- Return plan path.

#### 4.2 Implementation
**Agent:** `implementer`
- Create `CHANGELOG.md` with the fix details for `0.7.4`.
- Update relevant documentation if needed.
- Commit: `docs: add changelog and update documentation`.

#### 4.3 Code Review
**Agent:** `code-reviewer`
- Review CHANGELOG and docs for accuracy and clarity.

#### 4.4 Documentation
**Agent:** `docs-specialist`
- Final polish on docs and CHANGELOG.

#### 4.5 Verification
**Agent:** `architect`
- Confirm docs are accurate and links work.
- Commit any unstaged changes.

#### 4.6 Task Completion
**Agent:** `implementer`
- Mark Task 2 as `[DONE]` in `.agent/todos/20260627/20260627-todo-0.md`.
- Commit: `chore: mark task 2 as done in TODO file`.

### Step 5: TODO File Completion
**Agent:** `implementer`
- Rename `.agent/todos/20260627/20260627-todo-0.md` to `.agent/todos/20260627/20260627-todo-0-DONE.md`.
- Switch to `main`, merge `feat/fix-module-export-bug`.
- On success, delete feature branch.
- Push `main` to `origin` only.

---

## Constraints
- All changes must comply with `.agent/RULES.md` (max 200 lines/file, max 50 lines/method, max 2 depth, max 2 params, prefer private members, self-documenting code, no commented code).
- Follow Gitignore Compliance Rule.
- Do NOT push to remotes other than `origin`.
