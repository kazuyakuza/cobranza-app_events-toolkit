# Plan: Task 4 — Utilities (uuid, date, constants)

**Date**: 2026-06-12
**Branch**: `feat/initialize-project-core`
**TODO Task**: `src/common/utils/uuid.utils.ts`, `src/common/utils/date.utils.ts`, `src/common/constants.ts`

---

## Pre-Analysis

### Context Summary

- Project is a NestJS library (`@cobranza-app/events-toolkit`) for standardized NATS+JetStream event handling.
- Existing files in `src/common/`: `envelope/` (EventEnvelope, ActorType, EventBase), `dto/build-subject.dto.ts`, `utils/subject.builder.ts` + spec, `errors/.gitkeep`.
- `src/index.ts` is currently empty (`export {};`).
- `package.json` has `uuid: ^9.0.0` as a dependency. Installed version is `9.0.1`.
- Event convention: Event ID is UUIDv7 with `evt_` prefix. `produced_at` is ISO 8601 UTC with milliseconds.
- The `EventEnvelope` class already validates `id` with `/^evt_/` regex and `produced_at` with `@IsISO8601({ strict: true })`.

### Key Finding: UUIDv7 Not Available in uuid v9

**uuid v9.0.1 only exports v1, v3, v4, v5** — UUIDv7 support was added in uuid v10. The tech doc (`tech.md`) incorrectly states uuid 9.x supports UUIDv7. Two resolution paths:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A (Recommended)** | Upgrade to `uuid@^10` | Native v7, maintained, simple API | Version bump in `package.json` |
| B | Manual UUIDv7 per RFC 9562 | No dependency change | Custom crypto code, more maintenance |

**This plan uses Option A**: upgrade uuid to v10. `npm install uuid@^10.0.0` is the only prerequisite change.

### Coding Rules Compliance Checklist

- [x] Max 200 lines per file — each utility file will be < 50 lines
- [x] Max 50 lines per method — each function is 3–25 lines
- [x] Max depth 2 — no nested blocks deeper than 2 levels
- [x] Max 2 params — all functions use 0 params
- [x] Prefer private members — not applicable (pure function exports)
- [x] Self-documenting code — clear, descriptive names
- [x] No commented-out code
- [x] Single-section boolean conditions — N/A (no complex conditions)

---

## High-Level Approach

Create three minimal utility files, each with a single well-named export:

1. **`uuid.utils.ts`**: Two exports — `generateUuidV7()` (raw UUIDv7) and `generateEventId()` (UUIDv7 with `evt_` prefix).
2. **`date.utils.ts`**: One export — `nowIso()` returning UTC ISO 8601 with milliseconds.
3. **`constants.ts`**: Three named exports — `EVENT_ID_PREFIX`, `LIBRARY_VERSION`, `DEFAULT_SUBJECT_VERSION`.

No NestJS dependencies, no class-validator — pure functions using platform APIs.

---

## Implementation Steps

### Step 0: Git Pre-check

Verify clean working state on branch `feat/initialize-project-core`.

```powershell
git status
```

If dirty, commit or stash. Verify branch:

```powershell
git branch --show-current
```

Expected: `feat/initialize-project-core`

---

### Step 1: Upgrade uuid Dependency to v10

**Rationale**: uuid v9 does not support UUIDv7. Install latest version for native `v7()` export.

```powershell
npm install uuid@latest
```

Verification:

```powershell
npm ls uuid
```

Expected: uuid version >= 10.0.0.

---

### Step 2: Create `src/common/utils/uuid.utils.ts`

**File**: `src/common/utils/uuid.utils.ts` (new)

**Content**:

```typescript
import { v7 as uuidv7 } from 'uuid';

const EVENT_ID_PREFIX = 'evt_';

/**
 * Generates a raw UUIDv7 (RFC 9562).
 *
 * UUIDv7 is timestamp-ordered, making it ideal for database indexing
 * and chronological event ordering in JetStream streams.
 *
 * @returns A UUIDv7 string in standard 8-4-4-4-12 hex format.
 */
export function generateUuidV7(): string {
  return uuidv7();
}

/**
 * Generates a UUIDv7 event identifier with the standard `evt_` prefix.
 *
 * Format: `evt_` + UUIDv7 (e.g., `evt_018f4a3e-...`).
 * Used as the `id` field in every {@link EventEnvelope}.
 *
 * @returns Event ID string with `evt_` prefix.
 */
export function generateEventId(): string {
  return `${EVENT_ID_PREFIX}${uuidv7()}`;
}
```

**Line count**: ~22 lines (excl. imports/blank lines). Well under 200-line limit.

**Coding rules check**:

- Depth 0 — flat module with function exports, no nesting.
- 0 params per function, single-section logic.
- Self-documenting names: `generateUuidV7`, `generateEventId`.

---

### Step 3: Create `src/common/utils/date.utils.ts`

**File**: `src/common/utils/date.utils.ts` (new)

**Content**:

```typescript
/**
 * Returns the current UTC time as an ISO 8601 string with milliseconds.
 *
 * Format: `YYYY-MM-DDTHH:mm:ss.sssZ` (e.g., `2026-06-12T23:45:12.345Z`).
 * Used for the `produced_at` field in every {@link EventEnvelope}.
 *
 * @returns ISO 8601 UTC timestamp with millisecond precision.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
```

**Line count**: ~10 lines. Under limits.

**Coding rules check**:

- Depth 0.
- 0 params.
- Single expression body — no branches.

**Why `new Date().toISOString()` is sufficient**:

- `Date.prototype.toISOString()` always returns UTC.
- Includes milliseconds (always 3 decimal digits in the `.sssZ` suffix).
- Matches the `@IsISO8601({ strict: true })` validation on `EventEnvelope.produced_at`.

---

### Step 4: Create `src/common/constants.ts`

**File**: `src/common/constants.ts` (new)

**Content**:

```typescript
/** Standard prefix for all event IDs. */
export const EVENT_ID_PREFIX = 'evt_';

/** Current version of the events-toolkit library. */
export const LIBRARY_VERSION = '0.1.0';

/** Default major version for NATS subject strings (appended as `v1`). */
export const DEFAULT_SUBJECT_VERSION = '1';
```

**Line count**: ~6 lines. Under limits.

**Design notes**:

- `EVENT_ID_PREFIX` — referenced by `generateEventId()` and `EventEnvelope.id` validator; a single source of truth.
- `LIBRARY_VERSION` — matches `package.json` version; available for runtime introspection.
- `DEFAULT_SUBJECT_VERSION` — default for `BuildSubjectDto.version`; can be referenced by `SubjectBuilder`.

---

### Step 5: Verify TypeScript Compilation

```powershell
npm run typecheck
```

Expected: zero errors. Fix any type issues.

---

### Step 6: Verify Linting

```powershell
npm run lint
```

If fixable issues, run:

```powershell
npm run lint:fix
```

---

### Step 7: Verify Full Build

```powershell
npm run build
```

Expected: `dist/` output includes `common/utils/uuid.utils.js`, `common/utils/date.utils.js`, `common/constants.js` with declaration maps.

---

### Step 8: Write Unit Tests (if Jest is configured)

If `jest.config.js` or `jest` is fully set up:

#### `src/common/utils/uuid.utils.spec.ts`

```typescript
import { generateUuidV7, generateEventId } from './uuid.utils';

describe('uuid.utils', () => {
  describe('generateUuidV7', () => {
    it('returns a string matching UUID format', () => {
      const id = generateUuidV7();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('generates unique values on successive calls', () => {
      const ids = Array.from({ length: 100 }, () => generateUuidV7());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });

    it('generates monotonically increasing UUIDs by timestamp', () => {
      const id1 = generateUuidV7();
      const id2 = generateUuidV7();
      // UUIDv7 timestamp is in the first 12 chars
      expect(id1.substring(0, 12) <= id2.substring(0, 12)).toBe(true);
    });
  });

  describe('generateEventId', () => {
    it('returns a string starting with evt_', () => {
      const id = generateEventId();
      expect(id.startsWith('evt_')).toBe(true);
    });

    it('contains a valid UUIDv7 after the prefix', () => {
      const id = generateEventId();
      const uuidPart = id.slice(4); // remove 'evt_'
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidPart).toMatch(uuidRegex);
    });

    it('generates unique values on successive calls', () => {
      const ids = Array.from({ length: 100 }, () => generateEventId());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });
  });
});
```

#### `src/common/utils/date.utils.spec.ts`

```typescript
import { nowIso } from './date.utils';

describe('date.utils', () => {
  describe('nowIso', () => {
    it('returns an ISO 8601 string in UTC', () => {
      const iso = nowIso();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns a time close to current time', () => {
      const before = Date.now();
      const iso = nowIso();
      const parsed = new Date(iso).getTime();
      const after = Date.now();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });

    it('always includes milliseconds', () => {
      const iso = nowIso();
      expect(iso).toContain('.');
      expect(iso.endsWith('Z')).toBe(true);
      const msPart = iso.split('.')[1].replace('Z', '');
      expect(msPart).toHaveLength(3);
    });
  });
});
```

No spec needed for `constants.ts` (pure constants — tested by consumer files that import them).

Run:

```powershell
npm test
```

Expected: all tests pass.

---

### Step 9: Git Commit

```powershell
git add package.json package-lock.json src/common/constants.ts src/common/utils/uuid.utils.ts src/common/utils/date.utils.ts
```

If specs written:

```powershell
git add src/common/utils/uuid.utils.spec.ts src/common/utils/date.utils.spec.ts
```

```powershell
git commit -m "feat: add uuid v7, date, and constants utilities

- Upgrade uuid to v10 for native UUIDv7 support
- Add generateUuidV7() and generateEventId() with evt_ prefix
- Add nowIso() for ISO 8601 UTC timestamps with milliseconds
- Add common constants: EVENT_ID_PREFIX, LIBRARY_VERSION, DEFAULT_SUBJECT_VERSION
- Unit tests for uuid and date utilities"
```

---

## What Was NOT Done (boundary)

- No changes to `src/index.ts` (barrel exports) — that is a separate task.
- No changes to `EventEnvelope`, `SubjectBuilder`, or other existing files.
- No CI/CD configuration changes.
- No documentation updates (README, JSDoc beyond function docs).

---

## Verification Checklist (for Step 4.5)

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (if test files exist)
- [ ] UUIDv7 format validated: version nibble = 7, variant bits = 10xx
- [ ] `generateEventId()` prefix is `evt_` exactly
- [ ] `nowIso()` returns ISO 8601 with `.sssZ` suffix
- [ ] All three files exist at correct paths
