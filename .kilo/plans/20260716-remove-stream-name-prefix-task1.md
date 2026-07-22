# Task 1 Plan — Remove STREAM_NAME_PREFIX from buildStreamName

`[Project Info: Active]` — events-toolkit NestJS library. Scope: remove the `auto-` prefix from auto-generated JetStream stream names and update all affected tests. This is the detailed per-task plan for Task 1 (4.1) of TODO `.agent/todos/20260716/20260716-todo-0.md`.

## 1. Task Scope

TODO task: `### Remove prefix from buildStreamName and update tests` (sub-items 1 and 2 only).

What this task covers:
- Remove the `STREAM_NAME_PREFIX = 'auto-'` constant from `src/consumer/build-stream-name.util.ts`.
- Update `buildStreamName(subject)` to return the sanitized subject without the prefix.
- Update JSDoc in `src/consumer/build-stream-name.util.ts` to drop `auto-` from examples.
- Update all test expectations in `src/consumer/stream-auto-creator.spec.ts` that assert the prefixed name.

What this task does NOT cover (out of scope, handled separately):
- `CHANGELOG.md` update — handled by Task 2 per the global plan (`.kilo/plans/20260716-remove-stream-name-prefix.md`).
- Git feature-branch setup / version bump — handled by Critical Workflow Steps 2 and 3.
- Documentation section (4.4), verification (4.5), completion (4.6) — later steps of the workflow.

## 2. Pre-Analysis

### 2.1 Current State (verified)

`src/consumer/build-stream-name.util.ts` (21 lines):
- Line 1–2: exports `STREAM_NAME_PREFIX = 'auto-'` with a JSDoc comment.
- Line 18–21: `buildStreamName(subject)` computes `sanitized = subject.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()` then returns `` `${STREAM_NAME_PREFIX}${sanitized}` ``.
- Lines 10–17: JSDoc examples mention `auto-company-response-v1` and `auto-event-v2`.

`src/consumer/stream-auto-creator.ts` (161 lines):
- Line 3: imports `buildStreamName`, `NO_STREAM_MATCHES_FRAGMENT`, `STREAM_NAME_INUSE_FRAGMENT` from `./build-stream-name.util`. **Does NOT import `STREAM_NAME_PREFIX`.**
- Line 119: `name: buildStreamName(subject)` inside `buildStreamConfig`. This call site is unaffected by the prefix removal — it consumes the function's return value generically. No source-code change needed in this file.

Exports / public API:
- `src/consumer/index.ts` (41 lines) exports `StreamAutoCreator` and `StreamAutoCreatorDeps`, but does **NOT** re-export `STREAM_NAME_PREFIX` or `buildStreamName`.
- `src/index.ts` does not reference `STREAM_NAME_PREFIX` or `build-stream-name` (grep returned no matches).
- Therefore `STREAM_NAME_PREFIX` is an internal, non-public symbol. Removing it is a non-breaking, internal-only change.

Test expectations using the prefix (verified exhaustive via grep across whole `src/`): only in `src/consumer/stream-auto-creator.spec.ts`:
- Line 24: `expect(buildStreamName('company.*.response.v1')).toBe('auto-company-response-v1');`
- Line 28: `expect(buildStreamName('EVENT.v2')).toBe('auto-event-v2');`
- Line 32: `expect(buildStreamName('test.subject.123')).toBe('auto-test-subject-123');`
- Line 60: `name: 'auto-test-subject',` (inside the `add` assertion object, `ensureStreamExists` describe block).
- Line 125: `expect(sent.name).toBe('auto-test-subject');` (streamConfig overrides describe block).

No e2e or other spec files assert prefixed names (grep over `src/events-toolkit.runtime.e2e-spec.ts` and the jetstream/request-reply auto-create specs returned no `auto-*` stream-name matches).

### 2.2 Technical Decisions

- **Remove `STREAM_NAME_PREFIX` entirely.** It is internal-only and unused outside the util file. Keeping a deprecated alias is unnecessary per the TODO ("remove the constant").
- **`buildStreamName` becomes a pure sanitizer**: `subject.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()`. No prefix concatenation, no template literal.
- **Preserve the digit-handling / collapse-separators behavior.** The regex `/[^a-zA-Z0-9]+/g` stays unchanged — only the prefix concatenation is removed.
- **No parameter or signature change** for `buildStreamName(subject: string): string`. Call sites stay identical.
- **Update JSDoc examples** in the util to show unprefixed outputs (self-documenting-code rule).
- **Rule compliance checks**: after edits the util file stays well under 200 lines and method body well under 50 lines; depth ≤ 2; params = 1 (≤ 2). No commented code added.

### 2.3 Edge Cases to Preserve / Consider

The regex behavior is unchanged; documented here so implementer verifies expectations:
- Wildcards / dots / asterisks: `company.*.response.v1` → `company-response-v1` (consecutive non-alphanumeric collapsed to one hyphen, lowercased).
- Uppercase + digits: `EVENT.v2` → `event-v2`.
- Multiple separators: `test.subject.123` → `test-subject-123`.
- Empty string `''` → `''` (the regex produces `''`; result empty string). Starting-of-string separator: `.foo` → `-foo` (leading hyphen). Trailing separator: `foo.` → `foo-` (trailing hyphen). These are existing behaviors, unchanged by prefix removal (the prefix previously masked the leading-hyphen case visually because it was `auto--foo`; now it would be `-foo`). **No test asserts the empty / leading / trailing separator case today, and the TODO does not request new tests, so the implementer must NOT add new edge-case tests beyond updating existing expectations.**
- UTF-8 / special chars: any char outside `[a-zA-Z0-9]` becomes a hyphen (existing behavior, unchanged).

## 3. Implementation Steps (atomic, verifiable)

### Step 1 — Edit `src/consumer/build-stream-name.util.ts`

Replace the entire file content with the prefix-free version. Use `vscode-mcp-server_create_file_code` (overwrite=true) or `vscode-mcp-server_replace_lines_code`. The implementer MUST verify current content with `vscode-mcp-server_read_file_code` before editing.

Before (current, 21 lines):
```ts
/** Prefix prepended to auto-generated JetStream stream names. */
export const STREAM_NAME_PREFIX = 'auto-';

/** Error fragment indicating no stream matches the given subject. */
export const NO_STREAM_MATCHES_FRAGMENT = 'no stream matches subject';

/** Error fragment indicating a stream name is already in use. */
export const STREAM_NAME_INUSE_FRAGMENT = 'stream name already in use';

/**
 * Builds a valid JetStream stream name from a NATS subject.
 *
 * Consecutive non-alphanumeric characters are collapsed into a single hyphen
 * and the result is lowercased. For example:
 * - `company.*.response.v1` → `auto-company-response-v1`
 * - `EVENT.v2` → `auto-event-v2`
 */
export function buildStreamName(subject: string): string {
  const sanitized = subject.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return `${STREAM_NAME_PREFIX}${sanitized}`;
}
```

After (target):
```ts
/** Error fragment indicating no stream matches the given subject. */
export const NO_STREAM_MATCHES_FRAGMENT = 'no stream matches subject';

/** Error fragment indicating a stream name is already in use. */
export const STREAM_NAME_INUSE_FRAGMENT = 'stream name already in use';

/**
 * Builds a valid JetStream stream name from a NATS subject.
 *
 * Consecutive non-alphanumeric characters are collapsed into a single hyphen
 * and the result is lowercased. The subject is returned verbatim (sanitized)
 * with no added prefix, keeping auto-created stream names consistent with the
 * discovery manifest. For example:
 * - `company.*.response.v1` → `company-response-v1`
 * - `EVENT.v2` → `event-v2`
 */
export function buildStreamName(subject: string): string {
  return subject.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}
```

Verification of Step 1:
- File no longer contains the literal `STREAM_NAME_PREFIX` or `'auto-'`.
- `NO_STREAM_MATCHES_FRAGMENT` and `STREAM_NAME_INUSE_FRAGMENT` constants remain unchanged (consumed by `stream-auto-creator.ts`).
- `buildStreamName` body is a single return statement (line count drops; stays far under method/file limits).
- Grep `src/consumer/build-stream-name.util.ts` for `auto-` returns no matches.

### Step 2 — Edit `src/consumer/stream-auto-creator.spec.ts` expectations

Five expectation updates. Use `vscode-mcp-server_replace_lines_code` per line, or `edit` with unique surrounding context. The implementer MUST verify current lines via `vscode-mcp-server_read_file_code` (path `src/consumer/stream-auto-creator.spec.ts`) before each replace.

Update 2.1 — Line 24 (`buildStreamName` describe, wildcard collapsing):
```ts
// Before
expect(buildStreamName('company.*.response.v1')).toBe('auto-company-response-v1');
// After
expect(buildStreamName('company.*.response.v1')).toBe('company-response-v1');
```

Update 2.2 — Line 28 (`buildStreamName` describe, digits + lowercase):
```ts
// Before
expect(buildStreamName('EVENT.v2')).toBe('auto-event-v2');
// After
expect(buildStreamName('EVENT.v2')).toBe('event-v2');
```

Update 2.3 — Line 32 (`buildStreamName` describe, multiple separators):
```ts
// Before
expect(buildStreamName('test.subject.123')).toBe('auto-test-subject-123');
// After
expect(buildStreamName('test.subject.123')).toBe('test-subject-123');
```

Update 2.4 — Line 60 (object literal inside `add` call assertion, `ensureStreamExists` describe block). The surrounding object literal makes this match unique:
```ts
// Before
      expect(jetStreamManagerMock.add).toHaveBeenCalledWith({
        name: 'auto-test-subject',
        subjects: ['test.subject'],
// After
      expect(jetStreamManagerMock.add).toHaveBeenCalledWith({
        name: 'test-subject',
        subjects: ['test.subject'],
```

Update 2.5 — Line 125 (streamConfig overrides describe block):
```ts
// Before
      expect(sent.name).toBe('auto-test-subject');
// After
      expect(sent.name).toBe('test-subject');
```

Verification of Step 2:
- Grep `src/consumer/stream-auto-creator.spec.ts` for `auto-` returns no matches (the log message `'Stream auto-creation with custom config overrides'` at line 145 contains the word `auto-creation`, not the `auto-` prefix token — implementer must confirm grep for `'auto-` token or `auto-test`/`auto-company`/`auto-event` returns no matches).
- No other lines in the spec change. The mock helpers (`createMockLogger`, `createMockConnection`), the `StreamAutoCreator` instantiation, and the `should not ERROR-log race-condition` test remain untouched.

### Step 3 — No change needed in `src/consumer/stream-auto-creator.ts`

Confirmed: `stream-auto-creator.ts` imports only `buildStreamName, NO_STREAM_MATCHES_FRAGMENT, STREAM_NAME_INUSE_FRAGMENT` (line 3) and uses `buildStreamName(subject)` at line 119 generically. Removing the prefix changes the resulting stream name at runtime but requires no source edit. The implementer must NOT modify this file. Add a note in the implementation summary that this file was intentionally left unchanged.

## 4. Build & Test Commands

After the edits, run (single commands, not chained; per tool-selection-priority rule):

1. Typecheck/build:
   - `npm run build` (or `npm run typecheck` if defined) — verifies no dangling references to the removed `STREAM_NAME_PREFIX`.
2. Unit tests (scoped for speed, then full):
   - `npm test -- src/consumer/stream-auto-creator.spec.ts` — verifies the 3 `buildStreamName` tests + the `StreamAutoCreator` tests pass with the new names.
   - `npm test` — full unit suite to confirm no other spec referenced the removed constant or prefixed names.
3. Lint:
   - `npm run lint` — confirms ESLint/Prettier pass on the edited files.

Expected outcomes:
- Build: success (no references to `STREAM_NAME_PREFIX` remain anywhere in `src/`).
- Tests: all tests in `stream-auto-creator.spec.ts` green. Full suite green.
- Lint: clean.

On failure: do NOT modify production code beyond this plan. Return the failure to the caller (Plan Agent) for review.

## 5. Git Actions (within 4.2 Implementation step)

The implementer commits with a meaningful message. Per gitignore-compliance rule: before commit, read `.gitignore` and run `git status`; ensure no `dist/`, `node_modules/`, `.eslintcache`, `.events-toolkit/`, or `.kilo/agent-manager.json` is staged.

Suggested commit message:
```
refactor(consumer): remove auto- prefix from buildStreamName

Drop the STREAM_NAME_PREFIX constant and stop prepending 'auto-' to
auto-generated JetStream stream names so they match the auto-generated
discovery manifest. Update stream-auto-creator.spec expectations.
```

Stage only:
- `src/consumer/build-stream-name.util.ts`
- `src/consumer/stream-auto-creator.spec.ts`

Do NOT stage `CHANGELOG.md` (handled by Task 2), docs, or any unrelated files.

## 6. Code Review / Rules Checklist (for 4.3 reviewer reference)

- [ ] `STREAM_NAME_PREFIX` fully removed; no leftover references in `src/`.
- [ ] `NO_STREAM_MATCHES_FRAGMENT` and `STREAM_NAME_INUSE_FRAGMENT` preserved.
- [ ] `buildStreamName` signature unchanged (`(subject: string): string`); single return; ≤ 2 params; depth ≤ 1; method body ≤ 50 lines; file ≤ 200 lines.
- [ ] No commented-out code introduced; no magic strings added (`'auto-'` removal is the cleanup itself).
- [ ] No new public exports; internal symbol removal only; non-breaking.
- [ ] JSDoc examples updated to unprefixed outputs and remain accurate.
- [ ] All 5 spec expectation updates applied; no extra tests added; no existing tests deleted.
- [ ] `stream-auto-creator.ts` intentionally unchanged.

## 7. Edge Cases Re-evaluated Against New Outputs

After the change, `buildStreamName` returns the bare sanitized subject. Recorded for reviewer awareness (no test additions required by TODO):
- `buildStreamName('company.*.response.v1')` → `'company-response-v1'` (was `'auto-company-response-v1'`).
- `buildStreamName('EVENT.v2')` → `'event-v2'` (was `'auto-event-v2'`).
- `buildStreamName('test.subject.123')` → `'test-subject-123'` (was `'auto-test-subject-123'`).
- `buildStreamName('test.subject')` (used by `StreamAutoCreator` tests) → `'test-subject'` (was `'auto-test-subject'`).

## 8. Verification of Plan vs. Original Task

TODO sub-items for this task:
1. "Modify `src/consumer/build-stream-name.util.ts` to remove the `STREAM_NAME_PREFIX` constant and update `buildStreamName()` to no longer prepend the prefix." → Covered by Step 1.
2. "Update `src/consumer/stream-auto-creator.spec.ts` test expectations to match the new stream names without the `auto-` prefix." → Covered by Step 2.
3. "Update `CHANGELOG.md` to document this change." → Out of scope for Task 1; handled by Task 2 per global plan.

The caller's deliverable (exact file paths, before/after snippets, test expectation changes, edge cases) is fully satisfied by sections 2.1, 3, 4, and 7.

Plan path: `.kilo/plans/20260716-remove-stream-name-prefix-task1.md`