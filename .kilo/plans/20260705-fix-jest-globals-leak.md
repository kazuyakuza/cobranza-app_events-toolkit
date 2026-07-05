# Global Plan — Fix `@jest/globals` Leaked Into Main Entry

**TODO File:** `.agent/todos/20260704/20260704-todo-0.md`
**Date:** 2026-07-05

---

## Task Summary

The `@cobranza-apps/events-toolkit` package main entry point (`dist/index.js`) transitively imports `dist/testing/assertion.helpers.js`, which requires `@jest/globals`. This causes any consumer importing from the main entry outside a Jest test environment to crash.

**Root cause:** `src/index.ts` re-exports everything from `./testing`, pulling Jest-only assertion helpers into the main module graph.

**Fix:** Remove testing exports from `src/index.ts` and expose them exclusively via a `package.json` subpath export (`./testing`).

---

## Pre-Analysis

### Technical Decisions

- **Isolation strategy:** Remove `export * from './testing'` from `src/index.ts` and add `"exports"` map to `package.json` with `"./testing": "./dist/testing/index.js"`.
- **No internal imports from `testing/`:** Verified via grep — only `src/index.ts` imports from `./testing` inside `src/`. All other `@jest/globals` imports are confined to `src/testing/*.ts`.
- **Types for subpath:** Must also add `"./testing"` types entry (`dist/testing/index.d.ts`) in `exports`.
- **Verification:** Build the project, run a plain Node `require()` check, and add an automated test to prevent regression.

### Architecture Impact

- Minimal. The testing utilities are already conceptually isolated in `src/testing/`. This change only makes that isolation enforceable at the package boundary.
- Consumers currently using `import { MockProducerService } from '@cobranza-apps/events-toolkit'` will need to change to `import { MockProducerService } from '@cobranza-apps/events-toolkit/testing'`. This is a **breaking change** for test code, so the version bump should be **minor** (pre-1.0) or documented clearly.

---

## Execution Steps

### Step 2: Git Feature Branch Setup
- Ensure `main` is clean.
- Create and switch to branch `feat/fix-jest-globals-leak`.

### Step 3: Version Update
- Bump version in `package.json` from `0.9.0` → `0.10.0` (minor bump for breaking but correct isolation).
- Commit as `chore: bump version to 0.10.0`.

### Task 1: Fix `@jest/globals` Leak

#### 4.1 Analysis and Planning
- Architect confirms the module graph, designs the `exports` map shape, and writes the detailed per-task plan.

#### 4.2 Implementation
- Remove `export * from './testing';` from `src/index.ts`.
- Add `"exports"` field to `package.json`:
  ```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "default": "./dist/testing/index.js"
    }
  }
  ```
- Build project.
- Run plain Node verification: `node -e "require('./dist/index.js')"` must succeed.
- Add regression test: a standalone spec that asserts `require('@cobranza-apps/events-toolkit')` does not load `@jest/globals`.
- Commit with meaningful messages.

#### 4.3 Code Review
- Reviewer checks that no testing exports remain in the main barrel, that `exports` map is correct, and that the regression test is adequate.
- If fixes needed, generate fix plan and assign to implementer.

#### 4.4 Documentation
- Update `README.md` (or relevant docs) to document the `./testing` subpath import.
- Update any examples that import testing utilities from the main entry.

#### 4.5 Verification
- Architect verifies implementation plan adherence and confirms the plain Node `require` test passes.

#### 4.6 Task Completion
- Mark task as `[DONE]` in TODO file.
- Commit.

### Step 5: TODO File Completion
- Rename TODO file to `20260704-todo-0-DONE.md`.
- Merge feature branch into `main`.
- Push `main` to `origin`.

### Step 6: Continuation
- Propose next TODO file if any.

---

## Definition of Done (from TODO)

- `node -e "require('@cobranza-apps/events-toolkit')"` succeeds in a plain Node process.
- `node -e "require('@cobranza-apps/events-toolkit/testing')"` works inside a Jest test.
- `ms-db-gateway` can run `npm run test` without the `@jest/globals` error without needing a workaround.
- Library version bumped and published.
