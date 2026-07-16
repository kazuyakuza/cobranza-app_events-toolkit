# Plan — Fix `deliverTo` for push consumers: Task 4 (Update Documentation)

- **TODO**: `.agent/todos/20260716/20260716-todo-0.md` — Task 4: "Update changelog and related documentation"
- **Workflow step**: 4.1 Analysis & Planning (Critical Workflow)
- **Agent role**: Architector (plan only; implementation delegated to implementer / docs-specialist in 4.2/4.4)
- **Version context**: `package.json` already bumped to `0.11.4` (Step 3, commit `884ddba`). Most recent CHANGELOG entry is `## [0.11.3] — 2026-07-16`.

## 1. Pre-Analysis

### 1.1 What changed in Tasks 1–3 (source of truth for the docs)

`src/consumer/subscribe-options.interface.ts`:

- `createDefaultConsumerOpts()` now chains `.deliverTo(createInbox())`, producing `consumerOpts().manualAck().ackExplicit().deliverTo(createInbox())`. This sets a unique inbox as `deliver_subject` so push consumers satisfy NATS 2.29.3's `jetStream.subscribe()` validation (`push consumer requires deliver_subject`).
- `resolveConsumerSubscribeOpts(opts?)`:
  - `undefined` → returns `createDefaultConsumerOpts()` (deliver_subject now set).
  - `ConsumerOptsBuilder` → returned as-is (caller responsible for `deliverTo`).
  - `Partial<ConsumerOpts>` → new `ensureValidConsumerConfig()` defaults both `config.ack_policy` (to `AckPolicy.Explicit`) AND `config.deliver_subject` (to a unique `createInbox()`) via nullish coalescing, preserving caller-supplied values verbatim and not mutating the input object.

`src/consumer/subscribe-options.interface.spec.ts` (new unit tests, 96 lines):

- `createDefaultConsumerOpts`: sets unique non-empty `deliver_subject`; enables manual ack + explicit ack policy.
- `resolveConsumerSubscribeOpts`: `undefined` → builder with deliver_subject; builder with caller `deliverTo` preserved (same instance); plain `ConsumerOpts` preserves caller `deliver_subject`/`ack_policy` without mutating input; plain config without defaults gets both fields filled.
- `isConsumerOptsBuilder`: type-guard for builders vs plain objects / undefined / null.

### 1.2 Root cause / consumer impact

After upgrading `@cobranza-apps/events-toolkit` to `0.11.3`, `ms-db-gateway` failed to start with `Error: push consumer requires deliver_subject`. NATS 2.29.3 validates `if (!cso.isBind && !cso.config.deliver_subject) throw`. The toolkit's default push-consumer options lacked a `deliver_subject`. This fix closes that gap.

### 1.3 Documentation audit

| File | References consumer defaults / deliverTo? | Action |
|------|-------------------------------------------|--------|
| `CHANGELOG.md` | Top entry is `0.11.3` | **Add** new `## [0.11.4]` section above `0.11.3` |
| `docs/testing-utilities.md` | Yes — "Consumer defaults" note (L154) + "Bugs Guarded" row (L386) mention only `ack_policy` crash | **Update** both spots to add the `deliver_subject` push-consumer fix |
| `README.md` | No references to `consumerOpts`/`deliverTo`/consumer defaults | No change |
| `docs/nats-jetstream-configuration.md`, other `docs/*.md` | No references | No change |
| `.agent/project-info/context.md` | Recent-changes log stops at `0.10.2` | **Append** `0.11.4` recent-changes block + update Current Work Focus (Critical Closing Step) |

Note: `CHANGELOG.md` uses em-dash (`—`) date separators and has **no** link-reference footer lines, so the new section must not append `[0.11.4]: …` references.

### 1.4 Changelog format conventions (from existing entries)

- Newest entry on top.
- Section headers: `### Fixed`, `### Changed`, `### Tests` (matching `0.11.2` and `0.10.5`).
- Entries are prose paragraphs with inline backticks for symbols; bold the lead symbol (`**`...`**`) on first mention.
- Date format: `## [0.11.4] — 2026-07-16` (em-dash, ISO date).

## 2. High-Level Approach

1. Verify working tree state (read `CHANGELOG.md` top + `package.json` version to confirm `0.11.4` and that no `0.11.4` section already exists).
2. Insert the new `## [0.11.4] — 2026-07-16` CHANGELOG section above `## [0.11.3] — 2026-07-16`.
3. Update `docs/testing-utilities.md` "Consumer defaults" note (L154) and "Bugs Guarded" table row (L386) to cover the `deliver_subject` default.
4. Update `.agent/project-info/context.md`: append a `0.11.4` recent-changes block and refresh "Current Work Focus".
5. Verify no `.gitignore`-matching files are staged (gitignore-compliance rule); run `git status`.
6. Commit with message `docs: add 0.11.4 changelog entry and consumer deliverTo docs`.

## 3. Detailed, Verifiable Implementation Steps

### Step 1 — Read current state (verification, no edits)

- Read `CHANGELOG.md` lines 1–10; confirm `## [0.11.3] — 2026-07-16` is the top version section and that **no** `## [0.11.4]` section exists.
- Read `package.json` line 3; confirm `"version": "0.11.4"`.
- **Verify**: version mismatch is not acceptable — if `package.json` is not `0.11.4`, STOP and return a question to caller.

### Step 2 — Insert new CHANGELOG section

Use `vscode-mcp-server_replace_lines_code` (or `edit`) to insert the new section between line 7 (the blank line after the Semantic Versioning sentence) and line 8 (`## [0.11.3]…`).

**Exact markdown to insert** (place a blank line before and after; the new block goes immediately above `## [0.11.3] — 2026-07-16`):

```markdown
## [0.11.4] — 2026-07-16

### Fixed

- **Push consumer missing `deliver_subject` (`createDefaultConsumerOpts`)**: The toolkit's default JetStream consumer options (`consumerOpts().manualAck().ackExplicit()`) produced a push-consumer configuration without a `deliver_subject`. NATS 2.29.3 `jetStream.subscribe()` validates `if (!cso.isBind && !cso.config.deliver_subject) throw new Error("push consumer requires deliver_subject")`, so `RequestReplyConsumerService` / `JetStreamConsumerService` failed to subscribe after `StreamAutoCreator` created the stream. `createDefaultConsumerOpts()` now chains `.deliverTo(createInbox())`, assigning each push consumer a unique inbox as its `deliver_subject`. This restores startup for consumers (e.g. `ms-db-gateway`) that omit `consumerOpts`.

### Changed

- **`resolveConsumerSubscribeOpts` now guarantees `deliver_subject`**: When a caller supplies a plain `Partial<ConsumerOpts>` whose `config` omits `deliver_subject`, the new `ensureValidConsumerConfig` helper defaults it to a unique `createInbox()` via nullish coalescing (`??=`) — the same mechanism already used for `config.ack_policy` (defaulted to `AckPolicy.Explicit`). Caller-supplied `deliver_subject`/`ack_policy` are preserved verbatim, and the input `config` object is not mutated (a shallow copy is returned). `ConsumerOptsBuilder` values are still returned as-is, leaving the caller responsible for `.deliverTo()` on that path.

### Tests

- Added `src/consumer/subscribe-options.interface.spec.ts`: `createDefaultConsumerOpts()` sets a unique non-empty `deliver_subject` with manual + explicit ack; `resolveConsumerSubscribeOpts(undefined)` returns a builder with `deliver_subject`; `resolveConsumerSubscribeOpts(builder)` preserves the caller's `deliverTo` (same instance); `resolveConsumerSubscribeOpts(plainOpts)` preserves caller `deliver_subject`/`ack_policy` without mutating the input config; plain config without defaults receives both fields; `isConsumerOptsBuilder` distinguishes builders from plain objects/`undefined`/`null`.
```

**Verify after insert**:
- `CHANGELOG.md` line 8 is now `## [0.11.4] — 2026-07-16` and the previous `## [0.11.3]` section follows immediately after the new block (separated by one blank line).
- The new section date uses the em-dash `—` (U+2014), not a hyphen, matching the rest of the file.

### Step 3 — Update `docs/testing-utilities.md` "Consumer defaults" note (L154)

Replace the existing blockquote at L154.

**Current (exact):**
```
> **Consumer defaults:** `JetStreamConsumerService.subscribe()` applies `AckPolicy.Explicit` + `manualAck` when `consumerOpts` is omitted, preventing the NATS `ack_policy` undefined crash that occurs when an empty `{}` is passed to `jetStream.subscribe()`.
```

**Replacement (exact):**
```
> **Consumer defaults:** `JetStreamConsumerService.subscribe()` applies `AckPolicy.Explicit` + `manualAck` + `.deliverTo(createInbox())` when `consumerOpts` is omitted. This guarantees a unique `deliver_subject` for the push consumer (required by NATS 2.29.3 `jetStream.subscribe()`, which throws `push consumer requires deliver_subject` when it is absent) and prevents the `ack_policy` undefined crash that occurs when an empty `{}` is passed to `jetStream.subscribe()`.
```

**Verify**: the note now mentions both `deliver_subject` AND `ack_policy`; the call to `createInbox()` is referenced.

### Step 4 — Update `docs/testing-utilities.md` "Bugs Guarded" table row (L386)

Replace the existing table row for the "Empty consumer-options crash".

**Current row (exact):**
```
| Empty consumer-options crash | `JetStreamConsumerService` / `RequestReplyConsumerService` passed `{}` to `jetStream.subscribe`, causing NATS to read `undefined.ack_policy` | Assertions verify every `subscribe` call receives a config with a defined `ack_policy` (via `consumerOpts` builder or explicit config) |
```

**New: add a second row for the deliver_subject bug below it (exact):**
```
| Empty consumer-options crash | `JetStreamConsumerService` / `RequestReplyConsumerService` passed `{}` to `jetStream.subscribe`, causing NATS to read `undefined.ack_policy` | Assertions verify every `subscribe` call receives a config with a defined `ack_policy` (via `consumerOpts` builder or explicit config) |
| Push consumer missing `deliver_subject` (0.11.4) | Default push-consumer options lacked `deliver_subject`; NATS 2.29.3 `jetStream.subscribe()` throws `push consumer requires deliver_subject` | `createDefaultConsumerOpts()` chains `.deliverTo(createInbox())`; `resolveConsumerSubscribeOpts` defaults `config.deliver_subject` for plain `Partial<ConsumerOpts>`; covered by `subscribe-options.interface.spec.ts` |
```

**Verify**: the table now has two crash rows and the new row cites the spec file `subscribe-options.interface.spec.ts`.

### Step 5 — Update `.agent/project-info/context.md`

Per `.agent/project-info/instructions.md` Critical Closing Step, document the change.

**5a — "Current Work Focus":** Replace the existing focus with:
```
**Fix push consumer missing deliver_subject (v0.11.4).** `createDefaultConsumerOpts()` now chains `.deliverTo(createInbox())` and `resolveConsumerSubscribeOpts` defaults `config.deliver_subject` for plain consumer options, restoring NATS 2.29.3 push-consumer subscription.
```

**5b — "Recent Changes":** Insert (sorted newest-first, above the `2026-07-13` block, after the `## Recent Changes` header) a new block:

```markdown
### 2026-07-16 — Fix push consumer missing deliver_subject (v0.11.4)
- `createDefaultConsumerOpts()` in `src/consumer/subscribe-options.interface.ts` now chains `.deliverTo(createInbox())`, giving each push consumer a unique `deliver_subject` required by NATS 2.29.3 `jetStream.subscribe()` (`push consumer requires deliver_subject`).
- `resolveConsumerSubscribeOpts` gained `ensureValidConsumerConfig` helper: plain `Partial<ConsumerOpts>` now default both `config.ack_policy` (Explicit) and `config.deliver_subject` (unique `createInbox()`) via `??=`, preserving caller values and not mutating the input.
- Added `src/consumer/subscribe-options.interface.spec.ts` (96 lines) covering default + preserve/default paths and the `isConsumerOptsBuilder` type guard.
- Updated `CHANGELOG.md` (`## [0.11.4]`) and `docs/testing-utilities.md` (consumer defaults note + bugs-guarded table).
- Branch: `feat/fix-deliverTo-push-consumer` (current Critical Workflow feature branch).
```

> If the branch name differs from `feat/fix-deliverTo-push-consumer`, the implementer MUST substitute the actual `git branch --show-current` output before writing context.md. Do NOT invent a branch name.

**Verify**: context.md has a `2026-07-16 … v0.11.4` block at the top of Recent Changes and an updated Current Work Focus; the rest of the file is unchanged.

### Step 6 — Gitignore compliance + commit

- Read `.gitignore`; run `git status`. Confirm no staged/added files match ignore patterns (no `dist/`, `node_modules/`, `coverage/`). Unstage any if found.
- Confirm only these files changed: `CHANGELOG.md`, `docs/testing-utilities.md`, `.agent/project-info/context.md`. (If `subscribe-options.interface.ts` / spec / `package.json` already committed in earlier steps — confirmed by `git log` — they must NOT be re-staged here.)
- Stage the three documentation files and commit:

```
git add CHANGELOG.md docs/testing-utilities.md .agent/project-info/context.md
git commit -m "docs: add 0.11.4 changelog entry and consumer deliverTo docs"
```

- **Verify**: `git log --oneline -3` shows the new docs commit on top; `git status` reports clean working tree (or only unrelated unstaged files).

### Step 7 — Optional verification (no required test/build changes)

- No source code changed in this task, so `npm run typecheck` / `npm test` are not required by this step. (If CI triggers on the branch anyway, the prior test suite from Tasks 1–3 must still pass.)
- Optionally run `npm run lint -- docs/` if docs are linted; not required by project config (lint targets `src/**/*.ts`).

## 4. Acceptance Criteria

- [ ] `CHANGELOG.md` has a `## [0.11.4] — 2026-07-16` section above `0.11.3` with `### Fixed`, `### Changed`, `### Tests` subsections.
- [ ] `docs/testing-utilities.md` "Consumer defaults" note mentions `deliverTo(createInbox())` and `deliver_subject`.
- [ ] `docs/testing-utilities.md` "Bugs Guarded" table includes a `deliver_subject` row citing `subscribe-options.interface.spec.ts`.
- [ ] `.agent/project-info/context.md` Current Work Focus updated and a `2026-07-16 … v0.11.4` recent-changes block inserted.
- [ ] Single commit `docs: add 0.11.4 changelog entry and consumer deliverTo docs` containing exactly the three doc files.
- [ ] No `.gitignore`-matching files staged.
- [ ] TODO Task 4 line (`### 4. Update Documentation`) is **NOT** marked `[DONE]` here — that is step 4.6 (Task Completion), out of scope for this documentation step.

## 5. Out of Scope / NOT Done (this step)

- Marking Task 4 `[DONE]` in the TODO file (that is step 4.6).
- Marking the TODO file with `-DONE` suffix and merging the feature branch (step 5).
- Any change to `src/` source files or tests (already committed in Tasks 1–3).
- Any change to `package.json` version (already done in Step 3).
- README or other `docs/*.md` edits (no consumer-defaults references found; no change needed).