# Global Plan — Idempotency Support for @OnRequestReply

**Date:** 2026-07-23  
**TODO File:** `.agent/todos/20260723/20260723-todo-2.md`  
**Branch:** `feat/idempotency-on-request-reply`  
**Version Bump:** `0.15.1` (patch — backward-compatible additive change)

---

## Overview

Extend the idempotency feature (added in v0.15.0 for `@OnEvent`) to the `@OnRequestReply` decorator. Request-reply response handlers also receive events and can suffer from duplicate delivery — they need the same deduplication guard.

---

## Step 2: Git Feature Branch Setup

- Switch to `main`, commit any unstaged files.
- Create and switch to `feat/idempotency-on-request-reply`.

---

## Step 3: Version Update

- Bump `package.json` version from `0.15.0` → `0.15.1`.
- Commit as `chore: bump version to 0.15.1`.

---

## Task 1: Add `idempotent` flag to @OnRequestReply decorator

**Goal:** Add `idempotent?: boolean` to `@OnRequestReply` metadata/options and wire it into `OnRequestReplyExplorer`.

**Files:**
1. `src/consumer/decorators/on-request-reply.decorator.ts`
2. `src/consumer/decorators/on-request-reply-explorer-deps.interface.ts`
3. `src/consumer/decorators/on-request-reply.explorer.ts`

**Pre-analysis:**
- The `@OnEvent` implementation in `on-event.explorer.ts` lines 60-87 and `on-event.decorator.ts` lines 23-31 provide the exact pattern to mirror.
- `OnEventExplorer` uses `resolveHandler()` + `wrapWithIdempotency()` private helpers to stay under the 50-line method-body limit.
- `OnRequestReplyExplorer` currently has 77 lines; adding the wrapping logic will push it over 200 lines if not careful. The explorer itself (without comments/imports) is small, but we must extract `wrapWithIdempotency()` as a private method to respect max-lines-per-method.

**Architecture decisions:**
- Mirror `OnEventExplorer` exactly: `resolveHandler(handler, metadata)` → `wrapWithIdempotency(handler, service)`.
- The wrapper must: check `isDuplicate`, execute handler, `markAsProcessed` on success, do NOT mark on throw.
- `idempotencyService` is optional in deps — silent no-op when absent.

**Implementation steps:**
1. Add `idempotent?: boolean` to `OnRequestReplyMetadata` with JSDoc matching `OnEventMetadata.idempotent` style (with `@see` links).
2. Add `idempotent?: boolean` to `OnRequestReplyOptions` with JSDoc + example block.
3. Import `IdempotencyService` into `OnRequestReplyExplorerDeps` and add `idempotencyService?: IdempotencyService`.
4. In `OnRequestReplyExplorer`:
   - Add `private resolveHandler()` method ( mirrors `OnEventExplorer.resolveHandler` ).
   - Add `private wrapWithIdempotency()` method ( mirrors `OnEventExplorer.wrapWithIdempotency` ).
   - In `tryRegisterHandler()`, bind handler, call `resolveHandler(handler, metadata)`, pass `finalHandler` to `registerHandler`.
5. Ensure no method body exceeds 50 lines and no file exceeds 200 lines.

---

## Task 2: Wire IdempotencyService into Request-Reply Explorer Provider

**Goal:** Update DI wiring so `IdempotencyService` is injected into `OnRequestReplyExplorerDeps` with `@Optional()`.

**Files:**
1. `src/consumer/on-request-reply-explorer-deps.provider.ts` *(new)*
2. `src/consumer/consumer-module.providers.ts`
3. `src/consumer/consumer.module.ts`

**Pre-analysis:**
- `createRequestReplyExplorerDepsProvider()` in `consumer-module.providers.ts` currently has 2 params (`pair`, `rrConsumerService`). Adding `idempotencyService` would make 3, violating max-2-params.
- The cleanest fix is to mirror `on-event-explorer-deps.provider.ts`: create an intermediate `REQUEST_REPLY_DISCOVERY_PAIR_TOKEN` that merges `DiscoveryReflectorPair` + `RequestReplyConsumerService` into one object.
- Then `createRequestReplyExplorerDepsProvider()` accepts 2 params: `(baseDeps, idempotencyService?)`.
- Moving this to a dedicated file also keeps `consumer-module.providers.ts` under 200 lines (currently 178 lines — safe, but cleaner separation).

**Architecture decisions:**
- Create `src/consumer/on-request-reply-explorer-deps.provider.ts` with:
  - `REQUEST_REPLY_DISCOVERY_PAIR_TOKEN` constant.
  - `createRequestReplyDiscoveryPairProvider()` — merges `DISCOVERY_REFLECTOR_PAIR` + `RequestReplyConsumerService`.
  - `createRequestReplyExplorerDepsProvider()` — uses the pair + optional `IdempotencyService`.
- Update `consumer.module.ts` imports to use the new file.
- Remove `createRequestReplyExplorerDepsProvider()` from `consumer-module.providers.ts`.

**Implementation steps:**
1. Create `src/consumer/on-request-reply-explorer-deps.provider.ts` mirroring `on-event-explorer-deps.provider.ts` structure.
2. Export `REQUEST_REPLY_DISCOVERY_PAIR_TOKEN` and `RequestReplyDiscoveryPair` interface from `consumer.module.ts` (or from the new provider file if cleaner).
3. Update `ConsumerModule.forRoot()` and `forRootAsync()` provider arrays:
   - Replace `createRequestReplyExplorerDepsProvider()` import from `consumer-module.providers` with imports from new file.
   - Add `createRequestReplyDiscoveryPairProvider()` before `createRequestReplyExplorerDepsProvider()`.
4. Remove old `createRequestReplyExplorerDepsProvider()` from `consumer-module.providers.ts`.
5. Ensure `consumer-module.providers.ts` stays under 200 lines.

---

## Task 3: Test Coverage

**Goal:** Add unit tests mirroring `on-event.explorer.idempotent.spec.ts` for request-reply.

**Files:**
1. `src/consumer/decorators/on-request-reply.explorer.fixtures.ts`
2. `src/consumer/decorators/on-request-reply.explorer.idempotent.spec.ts` *(new)*

**Pre-analysis:**
- Existing `on-request-reply.explorer.spec.ts` is 155 lines — under 200. Adding idempotency tests inline would push it close to or over 200. Better to split into a dedicated `on-request-reply.explorer.idempotent.spec.ts`.
- Fixtures need `IdempotentRequestReplyConsumer` and `FailingThenSucceedingRequestReplyConsumer` classes.
- Test helper `createIdempotentExplorer()` needs to construct `OnRequestReplyExplorer` with mock `DiscoveryService`, `Reflector`, `RequestReplyConsumerService`, and optional `IdempotencyService`.

**Implementation steps:**
1. In `on-request-reply.explorer.fixtures.ts`, add:
   - `IdempotentRequestReplyConsumer` with `@OnRequestReply('billing.invoice.adjusted', { companyId: '...', description: '...', payloadExample: {...}, idempotent: true })`.
   - `FailingThenSucceedingRequestReplyConsumer` with same decorator but throws on first invocation.
2. Create `on-request-reply.explorer.idempotent.spec.ts` with test cases:
   - "wraps handler with idempotency when idempotent:true and service present"
   - "does not wrap handler when idempotent:true but service absent"
   - "does not wrap handler when idempotent:false"
   - "marks event as processed only when handler succeeds"
3. Mirror the structure, naming, and assertions from `on-event.explorer.idempotent.spec.ts` exactly.
4. Ensure each test file stays under 200 lines.

---

## Task 4: Documentation Updates

**Goal:** Update all docs to mention `@OnRequestReply` idempotency support.

**Files:**
1. `docs/idempotency.md`
2. `docs/request-reply-patterns.md`
3. `README.md`
4. `CHANGELOG.md`
5. `docs/ai-agent-guidelines.md`

**Pre-analysis:**
- `docs/idempotency.md` §Automatic Usage Patterns currently only shows `@OnEvent`. Need to add `@OnRequestReply` example and update the manual-vs-automatic table.
- `docs/request-reply-patterns.md` §3 (Async Pattern) and §7 (Idempotency Requirements) need a subsection noting `@OnRequestReply` supports `{ idempotent: true }`.
- `README.md` §Idempotency Pattern needs a brief `@OnRequestReply` example alongside `@OnEvent`.
- `CHANGELOG.md` needs an entry under `[0.15.1]` (or `[0.15.0]` if we decide not to bump). Given the TODO says "add a new `## [0.15.1]` if preferred", we will use `0.15.1` since we bumped version.
- `docs/ai-agent-guidelines.md` step 8 (Idempotency) and Common Mistakes #4 need to mention both decorators.

**Implementation steps:**
1. `docs/idempotency.md`:
   - Update "Automatic Usage Patterns" intro text to say "`@OnEvent` and `@OnRequestReply` decorators accept..."
   - Add `@OnRequestReply` code example after the `@OnEvent` example.
   - Update manual-vs-automatic table to mention request-reply.
2. `docs/request-reply-patterns.md`:
   - Add a subsection under §3 (Async Pattern — Consumer side) or §7 noting `@OnRequestReply({ idempotent: true })`.
   - Cross-link to `docs/idempotency.md`.
3. `README.md`:
   - In §Idempotency Pattern, add a second code block showing `@OnRequestReply` with `idempotent: true`.
   - Update onboarding step 8 text if needed.
4. `CHANGELOG.md`:
   - Add `## [0.15.1] — 2026-07-23` section with Added/Tests bullets.
   - Mention `@OnRequestReply()` now supports `{ idempotent: true }`.
   - List new test file.
5. `docs/ai-agent-guidelines.md`:
   - Update Quick Reference rule 6 and Step-by-Step Consuming Events / Handling Async Responses to mention both decorators.
   - Update Common Mistakes #4.

---

## Task 5: Verification & Completion

**Goal:** Run checks, mark TODO done, merge branch.

**Implementation steps:**
1. Run `npm run typecheck` — must pass.
2. Run `npm run lint` — must pass.
3. Run `npm test` — all existing + new tests pass.
4. Verify no source file exceeds 200 lines.
5. Verify no method exceeds 50 lines body / 2 params / 2 nesting depth.
6. Mark TODO file as `[DONE]`.
7. Commit all changes with meaningful messages.
8. Rename TODO with `-DONE` suffix.
9. Merge feature branch to `main`, delete branch.
10. Push `main` to `origin` if remote set.

---

## Global Constraints

- **Backward compatible**: all new fields are optional.
- **Max 200 lines per file** (source code in `src/`).
- **Max 50 lines per method body**.
- **Max 2 params per method/function** — use object encapsulation when needed.
- **Max 2 nesting depth** — extract helper methods for 3rd level.
- **Prefer private members** — default to `private`.
- **Self-documenting code** — clear names, minimal comments.
- **No commented-out code**.
- **Follow exact patterns** from `@OnEvent` idempotency implementation — no invention.
