# Plan — Fix RequestReplyService Registration · Task 2: End-to-End Integration Test

- **TODO file:** `.agent/todos/20260713/20260713-todo-2.md`
- **Task:** Add end-to-end integration test (section "Add end-to-end integration test")
- **Branch:** `feat/fix-requestreply-service-registration`
- **Critical Workflow step:** 4.1 (Analysis & Planning) — architector
- **Plan author role:** Architector (analysis & planning only — no code changes in this step)

## 1. Pre-Analysis (Global + Task)

### 1.1 Project Status Summary

`@cobranza-apps/events-toolkit` is a NestJS library assembling Producer, Consumer, Outbox, Discovery, and Request-Reply subsystems under a single global `EventsToolkitModule`. The `forRootAsync` path had three DI bugs (see TODO):

- **Bug 1** (v0.10.2, fixed): `forRootAsync` missing exports.
- **Bug 2** (v0.10.3, fixed): `DiscoveryModule` missing `@nestjs/core` `DiscoveryModule` import.
- **Bug 3** (Task 1, fixed on this branch): `RequestReplyService` never registered as provider — now registered+exported in both `forRoot` and `forRootAsync`, along with `REQUEST_REPLY_DEPS_TOKEN`.

Task 2 closes the loop with a regression E2E test that compiles `EventsToolkitModule.forRootAsync` and asserts all key services resolve — including the newly-wired `RequestReplyService` and the cross-module `RequestReplyConsumerService`.

### 1.2 Current State of the E2E Test

File `src/events-toolkit.module.e2e-spec.ts` already exists and has **5 passing tests**:

1. `compiles the full toolkit graph without external core providers`
2. `resolves ProducerService from the compiled module`
3. `resolves ConsumerService from the compiled module`
4. `resolves OutboxService from the compiled module`
5. `resolves DiscoveryService via the fixed NestDiscoveryModule import`

**Gaps vs. TODO acceptance criteria:**

- Does NOT assert `RequestReplyService` resolves.
- Does NOT assert `RequestReplyConsumerService` resolves.
- Mocked `nats.connect` connection object exposes `{ jetstream, close }` but **not** `request` (used by `RequestReplyService` at runtime, not at construction).

### 1.3 Technical & Architecture Decisions (verified against source)

| Question | Finding (from source) | Decision |
|---|---|---|
| Is `RequestReplyService` resolvable via `forRootAsync`? | Yes. `events-toolkit.module.ts` `buildAsyncProviders` includes `RequestReplyService` (line 130) and `buildAsyncRequestReplyDepsProvider` (line 129). Exports list includes both `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN` (lines 83–84). | Add an `it` that resolves it. |
| Is `RequestReplyConsumerService` resolvable? | Yes. `ConsumerModule.forRootAsync` (`consumer.module.ts` lines 124–152) provides+exports `RequestReplyConsumerService` (lines 141, 148). Its dep token `REQUEST_REPLY_CONSUMER_DEPS_TOKEN` is provided by `createAsyncRequestReplyConsumerDepsProvider` injecting `RESOLVED_CONNECTION_TOKEN`, `EventLoggerService`, `CONSUMER_MODULE_OPTIONS` — all resolvable. | Add an `it` that resolves it. |
| Does `RequestReplyService` construction trigger `natsConnection.request()`? | No. Constructor (`request-reply.service.ts` lines 41–46) only stores `deps`. `request()` is called at runtime by `request<T,R>(...)` (line 66), not during DI construction. | Mock `request` NOT strictly required; add defensively for fidelity (harmless). |
| Does `RequestReplyConsumerService` construction trigger `jetStream.subscribe`? | No. Constructor (`request-reply-consumer.service.ts` lines 28–39) stores `deps` + builds a `RequestReplyMessageProcessor`. `subscribe` is called in `onModuleInit` (line 42), which is **NOT** triggered by `Test.createTestingModule().compile()`. | Resolve-only test is safe; do NOT call `moduleRef.init()` (keeps existing pattern, avoids side effects). |
| Are there side effects from `onModuleInit` if accidentally invoked? | `onModuleInit` → `subscribe()` → `await this.jetStream.subscribe(subject, {})` returns the mocked `jest.fn()` value (`undefined`), then `processSubscription(undefined, …)` runs `for await (const msg of undefined)` → throws synchronously, but caught by `.catch()` and only logged. No test failure. | Defensive: keep `compile()`-only pattern; existing `afterEach` `moduleRef.close()` is sufficient. |
| Does CI run the e2e test? | Yes. `.github/workflows/npm-publish.yml` step "Run e2e tests" (line 39) runs `npm run test:e2e`. `jest.e2e.config.js` `testRegex: '\\.e2e-spec\\.ts$'` picks up `src/events-toolkit.module.e2e-spec.ts`. | NO CI workflow changes needed. TODO item "This test must run in CI" is already satisfied. |
| Is `RequestReplyConsumerService` actually instantiated during `compile()`? | Yes. NestJS instantiates module providers during `compile()`. It is injected by `createRequestReplyExplorerDepsProvider` (`consumer-module.providers.ts` lines 63–73) → it must be instantiated. | `moduleRef.get(RequestReplyConsumerService)` will return the live instance. |

### 1.4 Risks / Ambiguities

- **Low risk:** Adding `request: jest.fn()` to the connection mock. Harmless; not exercised during compile. Improves mock faithfulness to the real `NatsConnection` interface. **Decision: include it** because the TODO explicitly raises "adding `request` to the mocked NATS connection" as a consideration, and it future-proofs the mock.
- **No risk to existing 5 tests:** They do not depend on the absence of `request` on the connection, nor on the absence of the two new `it` blocks.
- **No `onModuleInit` side effects:** Compilation does not run lifecycle hooks; resolving the service triggers only the constructor. Verified above.
- **CI already covered:** No workflow edit required — reduces scope and risk to zero for the CI concern.

## 2. High-Level Approach

Extend the **existing** `src/events-toolkit.module.e2e-spec.ts` (do NOT create a new e2e file — the TODO's "Create" verb is satisfied by extending the already-created spec) with:

1. Two new imports (`RequestReplyService`, `RequestReplyConsumerService`).
2. A one-line mock fidelity enhancement: add `request: jest.fn()` to the mocked NATS connection.
3. Two new `it` test cases resolving `RequestReplyService` and `RequestReplyConsumerService`, using the exact same assertion pattern as the existing tests (`toBeInstanceOf`).
4. Local verification: `npm run test:e2e` (expect 7 passing), `npm run lint`, `npm run typecheck`.
5. Confirm CI workflow already runs e2e (no edit).

No new files. No production code changes. No git operations in this 4.1 step.

## 3. Detailed, Atomic Implementation Steps

> For the implementer (step 4.2). Each step is verifiable. Apply edits with `edit` (small, exact replacements) or `vscode-mcp-server_replace_lines_code`.

### Step 0 — Re-read context (implementer)

- Read `AGENTS.md`, `.agent/project-info/context.md`, `.agent/project-structure.md`.
- Read this plan file in full.
- Read current `src/events-toolkit.module.e2e-spec.ts` to confirm exact current content before editing.
- Read `.gitignore` and run `git status` (Gitignore Compliance Rule). Confirm no gitignored files are staged.

### Step 1 — Add imports to the E2E spec

**File:** `src/events-toolkit.module.e2e-spec.ts`

**Edit:** After the existing import line (line 15):

```ts
import { DiscoveryService } from './discovery/discovery.service';
```

Append two new import lines:

```ts
import { RequestReplyService } from './request-reply/request-reply.service';
import { RequestReplyConsumerService } from './consumer/request-reply-consumer.service';
```

**oldString** (for `edit`):

```
import { DiscoveryService } from './discovery/discovery.service';
```

**newString:**

```
import { DiscoveryService } from './discovery/discovery.service';
import { RequestReplyService } from './request-reply/request-reply.service';
import { RequestReplyConsumerService } from './consumer/request-reply-consumer.service';
```

**Verify:** The two new imports resolve (no TS2307). `RequestReplyService` is exported from `./request-reply/request-reply.service.ts`; `RequestReplyConsumerService` from `./consumer/request-reply-consumer.service.ts`.

### Step 2 — Enhance the NATS connection mock with `request`

**File:** `src/events-toolkit.module.e2e-spec.ts`

**Edit:** The `jest.mock('nats', …)` block currently (lines 17–25):

```ts
jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    close: jest.fn(),
  }),
}));
```

**newString** (add `request: jest.fn()` to the connection object, after `jetstream`):

```ts
jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    jetstream: jest.fn().mockReturnValue({
      publish: jest.fn(),
      subscribe: jest.fn(),
    }),
    request: jest.fn(),
    close: jest.fn(),
  }),
}));
```

**Rationale:** `RequestReplyService` stores `deps.natsConnection` and calls `natsConnection.request(subject, encoded, { timeout })` only at runtime (`request<T,R>`). The test does not invoke `request()`, but exposing `request` on the mock makes the connection object faithful to the real `NatsConnection` contract and removes a latent gap if a future assertion exercises the method.

### Step 3 — Add two new `it` test cases

**File:** `src/events-toolkit.module.e2e-spec.ts`

**Edit:** Insert immediately **before** the final closing `});` of the `describe` block (after the `DiscoveryService` test, line 84).

**oldString** (the last existing test + describe close):

```ts
  it('resolves DiscoveryService via the fixed NestDiscoveryModule import', () => {
    expect(moduleRef.get(DiscoveryService)).toBeInstanceOf(DiscoveryService);
  });
});
```

**newString:**

```ts
  it('resolves DiscoveryService via the fixed NestDiscoveryModule import', () => {
    expect(moduleRef.get(DiscoveryService)).toBeInstanceOf(DiscoveryService);
  });

  it('resolves RequestReplyService from the compiled module', () => {
    expect(moduleRef.get(RequestReplyService)).toBeInstanceOf(RequestReplyService);
  });

  it('resolves RequestReplyConsumerService from the compiled module', () => {
    expect(moduleRef.get(RequestReplyConsumerService)).toBeInstanceOf(
      RequestReplyConsumerService,
    );
  });
});
```

**Notes:**
- Same pattern as the existing `resolves *Service` tests for consistency.
- `moduleRef.get(...)` triggers instantiation (DI resolution) — the actual behavior under test.
- No `await moduleRef.init()` is called. This deliberately avoids triggering `onModuleInit` (which would call the mocked `jetStream.subscribe`). The existing tests use the same compile-only pattern; this keeps the suite uniform and side-effect-free.
- Prettier wrapping of the `RequestReplyConsumerService` instance check across two lines matches the repo's Prettier config (print width). If the project Prettier config yields single-line, the implementer should run `npm run format` and let Prettier shape it — do NOT hand-format. The assertion semantics are identical either way.

### Step 4 — Verify locally

Run each command independently (single cmd per bash invocation per tool-selection-priority rule):

1. `npm run test:e2e`
   - **Expected:** 7 passed, 0 failed (5 existing + 2 new).
   - **Verify specifically:** the two new tests `resolves RequestReplyService from the compiled module` and `resolves RequestReplyConsumerService from the compiled module` report as passing.
   - **On failure:** do NOT proceed. Inspect the DI error; if it indicates an unresolvable token, escalate to caller (this would indicate a Task 1 regression, not a test defect).

2. `npm run lint`
   - **Expected:** no errors in `src/events-toolkit.module.e2e-spec.ts`.

3. `npm run typecheck`
   - **Expected:** `tsc --noEmit` exits 0 (no TS2307/TS2345 in the edited file).

4. `npm run format:check`
   - If it reports the edited file is not formatted, run `npm run format` (formats `src/**/*.ts`) and re-run `format:check`. Do NOT manually adjust whitespace beyond Step 3's content.

### Step 5 — Confirm CI coverage (no edit)

- Verify `.github/workflows/npm-publish.yml` already contains (lines 38–39):
  ```yaml
        - name: Run e2e tests
          run: npm run test:e2e
  ```
- Verify `jest.e2e.config.js` `testRegex: '\\.e2e-spec\\.ts$'` matches `src/events-toolkit.module.e2e-spec.ts` (rootDir is `.`).
- **Do NOT modify the workflow file.** The TODO item "This test must run in CI to prevent regressions" is already satisfied: any e2e-spec file under the repo is automatically executed by the existing CI step.
- Record this confirmation in the step-completion summary so the caller/verifier (4.5) can audit it.

### Step 6 — Git (after Step 4 passes; commit to current feature branch)

> Only if steps 4.1.4.2 delegation instructs committing. The implementer commits the test change on the current branch `feat/fix-requestreply-service-registration`.

- `git status` — confirm only `src/events-toolkit.module.e2e-spec.ts` is modified; confirm no `.gitignore`-matching artifacts (`dist/`, `node_modules/`, `.events-toolkit/`, `coverage/`, etc.) are staged.
- `git diff src/events-toolkit.module.e2e-spec.ts` — review exactly two edits (imports + mock `request` + two `it` blocks).
- Stage only the spec file:
  - `git add src/events-toolkit.module.e2e-spec.ts`
- Commit message (follow repo style — see `git log --oneline -10`):
  ```
  test(e2e): assert RequestReplyService and RequestReplyConsumerService resolve via forRootAsync
  ```
- Do NOT push (per Git Remote Safety Rule — push is handled later in the Critical Workflow merge step, to `origin` only).

## 4. Code Review Checklist (for 4.3 code-reviewer)

- [ ] Only `src/events-toolkit.module.e2e-spec.ts` was modified; no production code touched.
- [ ] No new e2e spec files created (TODO "Create" satisfied by extending the existing file).
- [ ] Imports added exactly: `RequestReplyService`, `RequestReplyConsumerService` — both used.
- [ ] Mock enhanced with `request: jest.fn()` only; existing mock fields untouched.
- [ ] Two new `it` blocks added; existing 5 tests unchanged in semantics.
- [ ] No `moduleRef.init()` introduced (compile-only pattern preserved).
- [ ] `npm run test:e2e` → 7 passed.
- [ ] `npm run lint` and `npm run typecheck` clean.
- [ ] No CI workflow file modified, with justification recorded.
- [ ] File line count still within limits (max-lines-per-file applies to `src/` source files; this spec will be ~98 lines, well under 200).

## 5. Documentation Updates (for 4.4 docs-specialist)

- If `docs/testing-utilities.md` or `docs/ai-agent-guidelines.md` enumerates the e2e suite's coverage, add a one-line note that the `forRootAsync` e2e spec now also asserts `RequestReplyService` and `RequestReplyConsumerService` resolution. Otherwise no doc work required.
- No README/CHANGELOG changes are mandated for a test-only addition; if the project CHANGELOG records test additions, append under the relevant `v0.10.4` Unreleased entry: `Added e2e DI resolution assertions for RequestReplyService and RequestReplyConsumerService (forRootAsync path).`

## 6. Verification (for 4.5 architector)

- Confirm the implementer applied steps 1–3 exactly as specified.
- Confirm `npm run test:e2e` shows 7 passing tests (re-run if needed).
- Confirm no deviation from this plan (e.g., creation of a second e2e file, edits to `.github/workflows/npm-publish.yml`, edits to production code) — such deviations are NOT acceptable for this task and must be reverted or escalated.
- Confirm CI step "Run e2e tests" remains in place and will execute the updated spec.

## 7. Task Completion (for 4.6 implementer)

- In `.agent/todos/20260713/20260713-todo-2.md`, mark the "Add end-to-end integration test" sub-items as done:
  - `- [x] Create events-toolkit.module.e2e-spec.ts that compiles EventsToolkitModule.forRootAsync` *(already existed; extended)*
  - `- [x] Mock NATS_CONNECTION provider`
  - `- [x] Enable all options (discovery, consumer, outbox)`
  - `- [x] Assert module compiles and key services resolve:` *(all 6 services now asserted)*
    - ProducerService, DiscoveryService, ConsumerService, OutboxService, RequestReplyService, RequestReplyConsumerService
  - `- [x] This test must run in CI to prevent regressions` *(already covered by existing CI step)*
- Append `[DONE]` to the "Add end-to-end integration test" section title if not already present.
- Preserve original file content otherwise (only flip `- [ ]` to `- [x]` and append the `[DONE]` marker).
- Commit the TODO update (separate commit): `chore: mark TODO 20260713-todo-2 task 2 done`.

## 8. Acceptance Criteria Traceability

| TODO acceptance criterion | How this plan satisfies it |
|---|---|
| All existing library tests pass | Step 4.1 runs `npm run test:e2e` (7 pass) — implementer also confirms unit suite (`npm run test`) is unaffected since only a spec file changed. |
| New end-to-end test passes and is added to CI | Step 3 adds 2 new passing tests; Step 5 documents that CI already runs `npm run test:e2e` against the updated spec — no CI edit needed. |

## 9. Out of Scope (explicit)

- No changes to `EventsToolkitModule` or any `*.module.ts` / `*.providers.ts` production code (Task 1 already handled Bug 3).
- No new e2e spec file (extend existing).
- No CI workflow file modification.
- No `forRoot` (sync) path changes or tests — TODO Task 2 targets `forRootAsync` only.
- No push, no merge, no PR (handled in later Critical Workflow steps).
- No version bump for a test-only change (left to the Critical Workflow's Version Update step judgment; if skipped, document why).