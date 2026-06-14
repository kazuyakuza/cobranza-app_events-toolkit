# Fix Plan — Task 1: Outbox Module Code Review

**Plan file**: `.kilo/plans/20260613-task1-outbox-module-fix.md`
**Date**: 2026-06-13
**Reviewed branch**: `feat/outbox-logging-polish-finalization`

---

## Review Outcome

Functional implementation matches the outbox module plan and all outbox unit tests pass. However, two categories of issues must be addressed before task completion:

1. **Prettier formatting violations** — 12 lint errors across all new outbox files.
2. **Postgres repository correctness** — `markAsSent` and `markAsFailed` do not ensure the outbox table exists before executing `UPDATE` statements.

---

## Required Fix 1: Prettier Formatting

**Command to auto-fix**: `npm run format -- "src/outbox/**/*.ts"`

The following files have `prettier/prettier` violations reported by `npm run lint`:

### `src/outbox/index.ts`
- **Line 12:73** — Missing trailing newline at end of file.

### `src/outbox/outbox.types.ts`
- **Line 52:2** — Missing trailing newline at end of file.

### `src/outbox/outbox.module.ts`
- **Line 16:23** — Error message string is split across multiple lines; keep on one line.
- **Line 45:78** — Unnecessary line break in `useFactory` return type annotation.
- **Line 52:76** — Unnecessary line break in `useFactory` return type annotation.
- **Line 65:2** — Missing trailing newline at end of file.

### `src/outbox/sqlite-outbox.repository.ts`
- **Line 89:2** — Missing trailing newline at end of file.

### `src/outbox/postgres-outbox.repository.ts`
- **Line 89:2** — Missing trailing newline at end of file.

### `src/outbox/outbox.module.spec.ts`
- **Line 75:52** — `as const` should be outside the closing parenthesis: `({ type: 'sqlite' }) as const`.
- **Line 113:4** — Missing trailing newline at end of file.

### `src/outbox/sqlite-outbox.repository.spec.ts`
- **Line 149:61** — `expect.objectContaining({ id: 'evt_020' })` should remain on one line.
- **Line 165:4** — Missing trailing newline at end of file.

**Verification after fix**: `npm run lint` must report zero errors.

---

## Required Fix 2: Postgres Repository Table Creation

**File**: `src/outbox/postgres-outbox.repository.ts`

`ensureTable()` is currently called only in `save()` and `getPending()`. `markAsSent()` and `markAsFailed()` will fail with a missing-table error if invoked before any record has been saved or queried. All public mutation/query methods should guarantee table existence.

### Change for `markAsSent`

**Current** (lines 68–70):

```typescript
async markAsSent(id: string): Promise<void> {
  await this.entityManager.query(UPDATE_SENT_SQL, [id, nowIso()]);
}
```

**Fixed**:

```typescript
async markAsSent(id: string): Promise<void> {
  await this.ensureTable();
  await this.entityManager.query(UPDATE_SENT_SQL, [id, nowIso()]);
}
```

### Change for `markAsFailed`

**Current** (lines 72–74):

```typescript
async markAsFailed(id: string, error: string): Promise<void> {
  await this.entityManager.query(UPDATE_FAILED_SQL, [id, error, nowIso()]);
}
```

**Fixed**:

```typescript
async markAsFailed(id: string, error: string): Promise<void> {
  await this.ensureTable();
  await this.entityManager.query(UPDATE_FAILED_SQL, [id, error, nowIso()]);
}
```

**Verification after fix**: Re-run `npm run test -- src/outbox/ --no-coverage` and `npm run typecheck`.

---

## Recommendation (Non-Blocking)

**File to add**: `src/outbox/postgres-outbox.repository.spec.ts`

The implementation plan did not include unit tests for the Postgres repository. Adding a small test file that mocks `EntityManagerLike` would close the coverage gap and guard against regressions in `ensureTable`, `save`, `getPending`, `markAsSent`, and `markAsFailed`. This is recommended but not required to satisfy the current plan.

---

## Verification Checklist

- [ ] `npm run format -- "src/outbox/**/*.ts"` executed.
- [ ] `npm run lint` returns zero errors.
- [ ] `markAsSent` and `markAsFailed` in `postgres-outbox.repository.ts` call `await this.ensureTable()`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test -- src/outbox/ --no-coverage` passes.
