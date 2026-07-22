# Task 1 Review — Remove STREAM_NAME_PREFIX from buildStreamName

## Review Status

**Issues found:** Yes — `npm run lint` fails on the modified test file.

## Review Checklist

| # | Check | Result | Notes |
| - | - | - | - |
| 1 | `STREAM_NAME_PREFIX` fully removed from exports and usages | Pass | No matches across `src/` for `STREAM_NAME_PREFIX`. |
| 2 | `NO_STREAM_MATCHES_FRAGMENT` and `STREAM_NAME_INUSE_FRAGMENT` preserved | Pass | Both constants remain in `src/consumer/build-stream-name.util.ts`. |
| 3 | `buildStreamName` signature unchanged | Pass | `(subject: string): string` preserved; single return; 1 parameter; depth ≤ 1; file 19 lines. |
| 4 | Test expectations updated correctly | Pass | All 5 expectations in `src/consumer/stream-auto-creator.spec.ts` updated to unprefixed names. |
| 5 | No remaining `auto-` stream-name references | Pass | Grep for `auto-(company\|event\|test)` returns 0 matches; only false positives (`auto-creation`, `auto-created`, `auto-creator`, etc.). |
| 6 | `stream-auto-creator.ts` unchanged | Pass | No source edits required; call site uses `buildStreamName(subject)` generically. |
| 7 | Project rules (max lines, max depth, self-documenting) | Pass | Util file and spec file are under line limits; logic is simple; JSDoc examples updated. |
| 8 | Build and test verification | Pass | `npm run build` ✅, `npm test -- src/consumer/stream-auto-creator.spec.ts` ✅ (13 tests), `npm test` ✅ (599 tests). |
| 9 | Lint | **Fail** | `npm run lint` reports 6 prettier/prettier errors in `src/consumer/stream-auto-creator.spec.ts` (lines 14, 123, 146, 147, 175, 176). |

## Lint Failure Details

```text
C:\projects\cobranza-app\events-toolkit\src\consumer\stream-auto-creator.spec.ts
   14:69  error  Replace `; };` with ` }`  prettier/prettier
  123:84  error  Delete `;`                prettier/prettier
  146:40  error  Delete `;`                prettier/prettier
  147:52  error  Replace `; };` with ` }`  prettier/prettier
  175:40  error  Delete `;`                prettier/prettier
  176:38  error  Delete `;`                prettier/prettier

✖ 6 problems (6 errors, 0 warnings)
  ✖ 6 errors and 0 warnings potentially fixable with the `--fix` option.
```

### Root cause

The test file contains inline type annotations with semicolons inside object type literals:

- `jetStreamManagerMock: { streams: { find: jest.Mock; add: jest.Mock; }; };` → Prettier expects `jetStreamManagerMock: { streams: { find: jest.Mock; add: jest.Mock } }`
- `as { max_bytes: number; }` → expects `as { max_bytes: number }`
- `as { subject: string; }` → expects `as { subject: string }`
- `as { config: { max_bytes: number; }; }` → expects `as { config: { max_bytes: number } }`
- `as { error: string; }` → expects `as { error: string }`

These formatting issues are pre-existing in the file but were not addressed by the Task 1 implementation. The per-task plan (`.kilo/plans/20260716-remove-stream-name-prefix-task1.md`) listed **Lint: clean** as an expected verification outcome, so the implementation deviated by not ensuring lint passes.

## Fix Plan

### Scope

Only `src/consumer/stream-auto-creator.spec.ts` formatting fixes. No production logic changes.

### Steps

1. Run `npx prettier --write src/consumer/stream-auto-creator.spec.ts` (or `npm run lint -- --fix`) to auto-fix the 6 prettier errors.
2. Re-run `npm run lint` to confirm the file is clean.
3. Re-run `npm test -- src/consumer/stream-auto-creator.spec.ts` to ensure the formatting changes did not break tests.
4. Commit the formatting fix with message:
   ```text
   style(consumer): fix prettier formatting in stream-auto-creator.spec.ts
   ```
   Stage only `src/consumer/stream-auto-creator.spec.ts`.

### Verification

- `npm run lint` returns no errors.
- `npm test` remains green (599 tests pass).
- `npm run build` remains green.

## Out of Scope

- `CHANGELOG.md` update is handled by Task 2 per the global plan.
- No additional edge-case tests for `buildStreamName` (the TODO did not request them).
- No changes to `stream-auto-creator.ts` or other consumer files.
