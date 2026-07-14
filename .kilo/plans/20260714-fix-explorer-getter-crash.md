# Global Plan — Fix OnEventExplorer getter property crash

- **TODO file:** `.agent/todos/20260714/20260714-todo-1.md`
- **Date:** 2026-07-14
- **Plan agent:** plan

## Overview

Version `0.10.6` added a `typeof methodRef !== 'function'` guard in `OnEventExplorer` and `OnRequestReplyExplorer` to skip accessor properties, but the fix is incomplete. The expression `target.prototype[methodName]` **invokes the getter** before the guard can execute. When the getter references instance state that is `undefined` on the prototype (e.g., `HttpAdapterHost.prototype.listen$` → `this._listen$.asObservable()`), it throws a `TypeError` that the guard cannot catch.

The correct fix is to use `Object.getOwnPropertyDescriptor` to inspect properties without invoking getters, then check `descriptor.value` (present only for data properties) with `typeof ... === 'function'`.

**Confirmed affected consumer:** `ms-db-gateway`.

---

## Step 2: Git Feature Branch Setup

- **Sub-agent:** implementer
- **Actions:**
  1. Run `git status`. Commit any unstaged files with meaningful messages.
  2. Switch to `main` branch (already there).
  3. Create and switch to branch: `fix/explorer-getter-crash`

---

## Step 3: Version Update

- **Sub-agent:** implementer
- **Actions:**
  1. Read `package.json` (current version: `0.10.6`).
  2. Bump patch version to `0.10.7`.
  3. Commit: `chore: bump version to 0.10.7`

---

## Task 1: Fix OnEventExplorer property access

### 4.1 Analysis and Planning

- **Sub-agent:** architector
- **Context for architector:**
  - The root cause is already well-documented in the TODO file.
  - The v0.10.6 guard (`typeof methodRef !== 'function'`) is present in both explorers at lines 69 and 63 respectively.
  - The new approach: replace direct property access with `Object.getOwnPropertyDescriptor(target.prototype, methodName)`.
  - `descriptor.value` is only present for data properties (not accessors). For accessors, `descriptor.get`/`descriptor.set` exist and `descriptor.value` is `undefined`.
  - Same pattern applies to both `OnEventExplorer` and `OnRequestReplyExplorer`.
  - Unit tests already have `GetterSetterConsumer` classes that test non-throwing getters. Need to add a **throwing getter** that simulates `HttpAdapterHost.prototype.listen$`.
  - The e2e test (`src/events-toolkit.runtime.e2e-spec.ts`) currently uses `limitDiscoveryToHandlerProvider` to avoid scanning internal NestJS providers. This workaround should be removed once the root cause is fixed.
- **Deliverable:** Save per-task plan to `.kilo/plans/20260714-fix-explorer-getter-crash-task1.md`.

### 4.2 Implementation

- **Sub-agent:** implementer
- **Files to modify:**

  **1. `src/consumer/decorators/on-event.explorer.ts`**
  - In `tryRegisterHandler`, replace:
    ```typescript
    const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    // Accessor properties (getters/setters) appear in getOwnPropertyNames but are not callable; skip them.
    if (typeof methodRef !== 'function') return;
    ```
  - With:
    ```typescript
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
    if (!descriptor || typeof descriptor.value !== 'function') return;
    const methodRef = descriptor.value;
    ```

  **2. `src/consumer/decorators/on-request-reply.explorer.ts`**
  - Apply the identical change in `tryRegisterHandler`.

  **3. `src/consumer/decorators/on-event.explorer.spec.ts`**
  - Add a throwing getter to `GetterSetterConsumer` (or create a new test class) that throws when accessed on the prototype, simulating `HttpAdapterHost.prototype.listen$`.
  - Add or update a test case asserting `not.toThrow()` and correct `handlerCount`.

  **4. `src/consumer/decorators/on-request-reply.explorer.spec.ts`**
  - Apply identical throwing-getter test coverage.

  **5. `src/events-toolkit.runtime.e2e-spec.ts`**
  - Remove the `limitDiscoveryToHandlerProvider` workaround (or modify it so internal NestJS providers are also scanned).
  - The test should still pass because the explorers now safely skip all accessor properties without invoking them.

  **6. `CHANGELOG.md`**
  - Add a new `[0.10.7]` section (or unreleased section) documenting the fix.

- **Verification commands (run one at a time, no chaining):**
  1. `npm run build`
  2. `npx jest src/consumer/decorators/on-event.explorer.spec.ts src/consumer/decorators/on-request-reply.explorer.spec.ts`
  3. `npm test`
  4. `npm run lint`

- **Acceptance criteria:**
  - `npm run build` succeeds.
  - All unit tests pass, including new throwing-getter tests.
  - E2E test passes without `limitDiscoveryToHandlerProvider` workaround.
  - `npm test` is green.
  - `npm run lint` reports no new errors.

### 4.3 Code Review & Simplification

- **Sub-agents:** code-reviewer + code-simplifier (concurrent)
- **Code-reviewer:** Check that:
  - Both explorers use `Object.getOwnPropertyDescriptor` correctly.
  - The guard `!descriptor || typeof descriptor.value !== 'function'` is placed before any metadata reflection.
  - No direct property access (`prototype[methodName]`) remains in `tryRegisterHandler`.
  - Throwing-getter tests actually throw when accessed directly.
  - E2E test workaround is properly removed.
  - CHANGELOG entry is accurate.
  - Rule compliance: max lines, max depth, max params, single-section boolean conditions, no commented-out code.
- **Code-simplifier:** Look for any redundant code or opportunities to extract shared logic between the two explorers.
- **Deliverable:** If fixes needed, save plan to `.kilo/plans/20260714-fix-explorer-getter-crash-task1-review.md` and `.kilo/plans/20260714-fix-explorer-getter-crash-task1-simplify.md`, then assign to implementer.

### 4.4 Documentation

- **Sub-agent:** docs-specialist
- **Actions:**
  - Update `CHANGELOG.md` with a `[0.10.7]` section describing the fix.
  - Entry should mention: `OnEventExplorer` and `OnRequestReplyExplorer` now use `Object.getOwnPropertyDescriptor` to avoid invoking getter accessors during prototype scanning, fixing crashes with NestJS internal providers like `HttpAdapterHost`.
  - No README or other docs updates needed (internal bug fix).

### 4.5 Verification

- **Sub-agent:** architector
- **Actions:**
  - Confirm `on-event.explorer.ts` and `on-request-reply.explorer.ts` use `Object.getOwnPropertyDescriptor` and no longer access `prototype[methodName]` directly in `tryRegisterHandler`.
  - Confirm both spec files have throwing-getter test coverage.
  - Confirm e2e test no longer limits discovery to workaround the bug.
  - Confirm `npm test` passes.
  - Report any deviations from the implementation plan.

### 4.6 Task Completion

- **Sub-agent:** implementer
- **Actions:**
  - Mark task as `[DONE]` in `.agent/todos/20260714/20260714-todo-1.md`:
    - Append `[DONE]` to the `### Fix OnEventExplorer property access` heading.
    - Mark all sub-items (`- [ ]`) as completed (`- [x]`).
  - Commit changes with meaningful message: `fix: use Object.getOwnPropertyDescriptor in explorers to avoid getter invocation`

---

## Step 5: TODO File Completion

- **Sub-agent:** implementer
- **Actions:**
  1. Ensure all files are committed in `fix/explorer-getter-crash`.
  2. Rename TODO file: `.agent/todos/20260714/20260714-todo-1.md` → `.agent/todos/20260714/20260714-todo-1-DONE.md`
  3. Switch to `main`.
  4. Merge `fix/explorer-getter-crash` into `main`.
  5. On success, delete feature branch.
  6. Push `main` to `origin` only.
  7. Notify user if push fails.

---

## Pre-Analysis

### Technical Decisions
- **Why `Object.getOwnPropertyDescriptor` instead of `typeof` guard:** Direct property access `prototype[methodName]` invokes getters. The `typeof` guard executes after the access, so it cannot catch getter-thrown errors. `Object.getOwnPropertyDescriptor` returns the descriptor without invoking accessors, allowing safe inspection of `descriptor.value`.
- **Why remove e2e workaround:** `limitDiscoveryToHandlerProvider` was added specifically to avoid the getter crash. Once the root cause is fixed, the test should exercise real DiscoveryService behavior (scanning all providers including internal NestJS ones) to prevent regression.

### Architecture Impact
- No public API changes. The explorers are internal components consumed by `ConsumerModule`.
- The behavior change is purely defensive: accessor properties were already skipped semantically (they never carry event metadata), but now they are skipped safely without invocation.

### Risk Assessment
- **Low risk.** The change is localized to two private methods in two explorers. Existing unit and e2e tests provide strong regression coverage.
- **Risk mitigated:** Adding throwing-getter tests and removing the e2e workaround ensures the fix is verified against the exact production failure mode.
