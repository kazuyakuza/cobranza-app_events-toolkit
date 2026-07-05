# Task 1 Fix Plan — Post-Implementation Code Review

**TODO File:** `.agent/todos/20260704/20260704-todo-0.md`
**Global Plan:** `.kilo/plans/20260705-fix-jest-globals-leak.md`
**Per-Task Plan:** `.kilo/plans/20260705-fix-jest-globals-leak-task1.md`
**Branch:** `feat/fix-jest-globals-leak`
**Date:** 2026-07-05

---

## Review Outcome

The implementation correctly isolates `@jest/globals` from the main entry and adds the `./testing` subpath export. Three small issues were found that need fixing before Task 1 can be considered complete.

---

## Issues Found

### Issue 1 — README.md note is inside the code block

**File:** `README.md` (lines 840–869)

**Problem:** The one-line subpath-import note was inserted inside the TypeScript example block instead of immediately after it. This breaks the example's syntax highlighting and renders the note as invalid TypeScript.

**Current (incorrect):**

```markdown
```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockProducerService,
  expectEventPublished,
} from '@cobranza-apps/events-toolkit/testing';

> Testing utilities (mocks + assertion helpers) must be imported from the `@cobranza-apps/events-toolkit/testing` subpath — they depend on `@jest/globals` and are not exported from the main entry.

describe('PaymentService', () => {
  ...
});
```
```

**Expected:**

```markdown
```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockProducerService,
  expectEventPublished,
} from '@cobranza-apps/events-toolkit/testing';
```

> Testing utilities (mocks + assertion helpers) must be imported from the `@cobranza-apps/events-toolkit/testing` subpath — they depend on `@jest/globals` and are not exported from the main entry.

```typescript
describe('PaymentService', () => {
  ...
});
```
```

**Fix instruction:** Close the first TypeScript code block after the import, place the note as a markdown blockquote, then open a second TypeScript code block for the `describe(...)` body.

---

### Issue 2 — `docs/testing-utilities.md` still says "Import from `@cobranza-apps/events-toolkit`"

**File:** `docs/testing-utilities.md` (line 154)

**Problem:** The heading above the assertion-helper import example still references the old main-entry path, even though the code snippet directly below it correctly uses `@cobranza-apps/events-toolkit/testing`.

**Current (incorrect):**

```markdown
## Assertion Helpers

Import from `@cobranza-apps/events-toolkit`:

```typescript
import {
  expectEventPublished,
  expectNoEventsPublished,
  expectEventWithMatch,
  expectEnvelope,
} from '@cobranza-apps/events-toolkit/testing';
```
```

**Expected:**

```markdown
## Assertion Helpers

Import from `@cobranza-apps/events-toolkit/testing`:

```typescript
import {
  expectEventPublished,
  expectNoEventsPublished,
  expectEventWithMatch,
  expectEnvelope,
} from '@cobranza-apps/events-toolkit/testing';
```
```

**Fix instruction:** Change the introductory sentence from "Import from `@cobranza-apps/events-toolkit`:" to "Import from `@cobranza-apps/events-toolkit/testing`:".

---

### Issue 3 — Regression test violates single-section boolean condition rule

**File:** `src/entry-point-isolation.spec.ts` (lines 34–36)

**Problem:** The `find` callback contains a compound boolean condition (`||`), which violates `.kilo/rules/single-section-boolean-conditions.md`.

**Current (incorrect):**

```ts
const testingCacheKey = Object.keys(require.cache).find(
  (key) => key.includes(testingKeySep) || key.includes(testingKeyWin),
);
```

**Expected:**

```ts
const isTestingCacheKey = (key: string): boolean =>
  key.includes(testingKeySep) || key.includes(testingKeyWin);

const testingCacheKey = Object.keys(require.cache).find(isTestingCacheKey);
```

**Fix instruction:** Extract the compound condition into a named helper function `isTestingCacheKey` at the top level of the `describe` block or immediately before its use, then pass the function reference to `.find()`.

---

## Verification After Fixes

1. Run `npm run typecheck` — must pass.
2. Run `npm run lint` — must pass.
3. Run `npm test` — all tests, including `src/entry-point-isolation.spec.ts`, must pass.
4. Visually inspect `README.md` and `docs/testing-utilities.md` to confirm the markdown renders correctly and all testing-utility import paths reference `@cobranza-apps/events-toolkit/testing`.

---

## No Other Issues Found

- `src/index.ts` no longer re-exports `./testing`.
- `package.json` `exports` map is syntactically correct and complete for `.` and `./testing` with both `types` and `default` conditions.
- The regression test correctly asserts main-entry isolation and `./testing` accessibility.
- `CHANGELOG.md`, `docs/ai-agent-guidelines.md`, `.agent/project-info/architecture.md`, and `.agent/project-info/context.md` updates are accurate.
