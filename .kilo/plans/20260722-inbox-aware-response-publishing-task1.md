# Per-Task Plan: Add INBOX-aware response publishing fallback (Task 1)

**Source TODO:** `.agent/todos/20260722/20260722-todo-0.md`
**Global Plan:** `.kilo/plans/20260722-inbox-aware-response-publishing.md`
**Date:** 2026-07-22
**Branch:** `feat/inbox-aware-response-fallback`
**Version:** `0.13.0` (already bumped in `package.json`)

---

## 1. Design Verification & Research Findings

### 1.1 Confirmed facts from codebase read

- `src/request-reply/request-reply.types.ts` (80 lines):
  - `RequestReplyConfig` currently holds only `defaultTimeoutMs: number`.
  - `resolveRequestReplyConfig(partial?)` applies a single default via `?? DEFAULT_TIMEOUT_MS`.
  - `RequestReplyDeps` already injects `natsConnection`, `producerService`, `logger`, `config` into the service. No provider changes required for the new config fields.
- `src/request-reply/request-reply.service.ts` (121 lines):
  - `RequestReplyService` already stores `private readonly natsConnection`, `producerService`, `logger`, `config` from `deps`.
  - `encodeEvent` is already imported from `../common/utils/serialization.utils`.
  - `sendResponse(correlationId, responseEvent)` currently does: `ensureReplyTo(replyTo, correlationId)` then `await this.producerService.publish(replyTo, responseEvent)`.
  - `natsConnection.publish(subject, payload)` is a sync core-NATS publish returning `void` (verified against `nats` types and the existing `processMessage`/`routeToDlq` usage of `jetStream.publish` for the byte-array pattern; `encodeEvent` returns `Uint8Array`, matching the NATS `publish(subject, Uint8Array)` signature).
- `src/request-reply/request-reply.helpers.ts` already exports `logRequestSent(logger, subject, envelope)` which calls `logger.logEventEmitted(toLogContext(...))`. Reusing it keeps logging consistent with `ProducerService.publish`'s success log. No new logging helper needed.
- `src/events-toolkit-module.providers.ts`: both `buildSyncRequestReplyDepsProvider` and `buildAsyncRequestReplyDepsProvider` call `resolveRequestReplyConfig(requestReply)`. Adding defaults to the resolver wires the new fields automatically with **zero provider changes**.
- `src/request-reply/index.ts`: re-exports `RequestReplyConfig` and `resolveRequestReplyConfig`. The two new optional fields are part of the existing `RequestReplyConfig` interface — **no new exports required**.
- `package.json` version is already `0.13.0` — **no version change needed in this task**.
- Consumer side `src/consumer/request-reply-message-processor.ts`: `processMessage` acks only after `await this.dispatch(...)` resolves; if `sendResponse` throws, `handleError` naks/redelivers. The fallback (core NATS publish returning `void` instead of awaiting a PubAck) removes the timeout-throw root cause. No processor change is in scope for this task.

### 1.2 Ambiguities / gaps identified and resolved

1. **Where to compile the regex.** Resolved: compile once in the `RequestReplyService` constructor (config is immutable after DI resolution). Avoids repeated `new RegExp` per call. Store as `private readonly inboxRegex: RegExp`.
2. **Type-safety when `coreNatsFallbackPattern` is optional.** Resolved: the resolved config always provides the default string, but TS sees the interface field as `string | undefined`. The service constructor uses `this.config.coreNatsFallbackPattern ?? DEFAULT_INBOX_PATTERN` (single source of truth constant exported from `request-reply.types.ts`, not re-exported from `index.ts` to keep it package-internal).
3. **Single-section boolean condition rule.** `shouldUseCoreNats` must NOT combine `fallbackToCoreNatsOnInbox && inboxRegex.test(replyTo)` in one `if`. Resolved: early-return on the flag, then `return this.inboxRegex.test(replyTo)` — two single-section statements.
4. **Invalid custom pattern.** `new RegExp(invalidString)` throws synchronously → service DI construction fails fast. Resolved: this is desired fail-fast behavior (asserts valid config at boot). Test asserts the throw rather than swallow.
5. **`createDeps` test helper already exceeds the 2-params rule (6 params).** Adding a `mockNatsPublish` parameter increases the tension. Resolved: add it as an **optional 7th param** defaulting to `jest.fn()` so every existing 6-argument caller keeps compiling unchanged (preserve existing code). Flag the structural tension explicitly for step 4.3 (code-simplifier) to optionally refactor `createDeps` into a `CreateDepsOptions` object — **not** done in this step to keep blast radius minimal.

### 1.3 Decisions summary
- Default `fallbackToCoreNatsOnInbox: false` (backward compatible).
- Default `coreNatsFallbackPattern: '^_?INBOX\\.'` (matches `INBOX.` and `_INBOX.` prefixes; the literal backslash is escaped in the string so the runtime regex is `^_?INBOX\.`).
- Compile regex once in constructor; reuse `logRequestSent` for fallback observability; let core-NATS publish errors bubble (caller nacks as before).
- No changes to `index.ts`, providers, `package.json`, processor, or `RequestReplyDeps` shape.

---

## 2. Constraints Compliance Check

- **Max 200 lines/file (`src/`):** `request-reply.types.ts` 80 → ~90; `request-reply.service.ts` 121 → ~138; all below 200.
- **Max 50 lines/method body:** all new/modified methods ≤ ~8 lines.
- **Max 2 params/method:** `sendResponse(correlationId, responseEvent)` = 2; `publishToInbox(replyTo, responseEvent)` = 2; `shouldUseCoreNats(replyTo)` = 1; `buildInboxRegex()` = 0.
- **Max 2 nesting levels:** early returns, no 3rd-level nesting.
- **Single-section boolean conditions:** enforced via early-return helper.
- **Prefer private members:** new members `inboxRegex`, `shouldUseCoreNats`, `publishToInbox` are all `private`.
- **Self-documenting code / no commented-out code / use assertions:** method names self-document; `ensureReplyTo` assertion preserved; no commented code.
- **Preserve existing code:** existing tests and signatures untouched; only additive changes.

---

## 3. Implementation Steps (atomic, ordered)

### Step 3.1 — Edit `src/request-reply/request-reply.types.ts`

Add a default-pattern constant near `DEFAULT_TIMEOUT_MS`, two optional fields on `RequestReplyConfig`, and two defaults in `resolveRequestReplyConfig`.

After the existing `DEFAULT_TIMEOUT_MS` constant (line 15), add:
```typescript
/** Default INBOX subject prefix pattern for core-NATS fallback. */
const DEFAULT_INBOX_PATTERN = '^_?INBOX\\.';
```

Extend `RequestReplyConfig` (currently lines 18-21) to:
```typescript
export interface RequestReplyConfig {
  /** Default timeout in milliseconds for request operations. */
  defaultTimeoutMs: number;
  /** When true, publish INBOX reply_to subjects via core NATS instead of JetStream. */
  fallbackToCoreNatsOnInbox?: boolean;
  /** Regex (as string) matching INBOX reply_to subjects; used when fallbackToCoreNatsOnInbox is true. */
  coreNatsFallbackPattern?: string;
}
```

Extend the returned object of `resolveRequestReplyConfig` (currently lines 24-28) to:
```typescript
export function resolveRequestReplyConfig(partial?: Partial<RequestReplyConfig>): RequestReplyConfig {
  return {
    defaultTimeoutMs: partial?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    fallbackToCoreNatsOnInbox: partial?.fallbackToCoreNatsOnInbox ?? false,
    coreNatsFallbackPattern: partial?.coreNatsFallbackPattern ?? DEFAULT_INBOX_PATTERN,
  };
}
```

Export `DEFAULT_INBOX_PATTERN` so the service can import it (single source of truth). Add to the bottom of the const block:
```typescript
export { DEFAULT_INBOX_PATTERN };
```
(Internal export — NOT added to `src/request-reply/index.ts`.)

**Tooling:** use `vscode-mcp-server_replace_lines_code` for the three contiguous regions, or `Bifrost_*` if available. Verify with `read` after edit.

### Step 3.2 — Edit `src/request-reply/request-reply.service.ts`

A. Update imports (top of file). The helpers import already includes `logRequestSent`. Add `DEFAULT_INBOX_PATTERN` to the existing import from `./request-reply.types`:
```typescript
import {
  RequestReplyConfig,
  RequestReplyDeps,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  REQUEST_REPLY_DEPS_TOKEN,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
  DEFAULT_INBOX_PATTERN,
} from './request-reply.types';
```

B. Add a private readonly field on the class (after the existing `config` field, ~line 42):
```typescript
  private readonly inboxRegex: RegExp;
```

C. In the constructor (currently lines 44-49), after assigning `this.config = deps.config;`, compile the regex:
```typescript
    this.config = deps.config;
    this.inboxRegex = new RegExp(this.config.coreNatsFallbackPattern ?? DEFAULT_INBOX_PATTERN);
```

D. Replace `sendResponse` (currently lines 85-89) with:
```typescript
  /**
   * Publishes a reply event to the subject stored in `reply_to`.
   *
   * When `fallbackToCoreNatsOnInbox` is enabled and `reply_to` matches the INBOX
   * pattern, publishes via core NATS (no PubAck) instead of JetStream.
   */
  async sendResponse(correlationId: string, responseEvent: AnyEventEnvelope<unknown>): Promise<void> {
    const replyTo = responseEvent.reply_to;
    ensureReplyTo(replyTo, correlationId);

    if (this.shouldUseCoreNats(replyTo)) {
      this.publishToInbox(replyTo, responseEvent);
      return;
    }

    await this.producerService.publish(replyTo, responseEvent);
  }
```

E. Add two private methods immediately after `sendResponse`:
```typescript
  private shouldUseCoreNats(replyTo: string): boolean {
    if (!this.config.fallbackToCoreNatsOnInbox) {
      return false;
    }
    return this.inboxRegex.test(replyTo);
  }

  private publishToInbox(replyTo: string, responseEvent: AnyEventEnvelope<unknown>): void {
    const payload = encodeEvent(responseEvent);
    this.natsConnection.publish(replyTo, payload);
    logRequestSent(this.logger, replyTo, responseEvent);
  }
```

**Tooling:** use `vscode-mcp-server_replace_lines_code` for the import block, the constructor block, and the `sendResponse` block (each with exact `originalCode` matching). Re-read the file to confirm.

### Step 3.3 — Edit `src/request-reply/__tests__/request-reply-test.utils.ts`

Add the optional `mockNatsPublish` parameter to `createDeps` and wire it into the mocked `natsConnection`.

Replace the `createDeps` function (currently lines 18-37) with:
```typescript
export function createDeps(
  mockNatsRequest: jest.Mock,
  mockPublish: jest.Mock,
  mockLogEmitted: jest.Mock,
  mockLogConsumed: jest.Mock,
  mockLogError: jest.Mock,
  config: RequestReplyConfig,
  mockNatsPublish: jest.Mock = jest.fn(),
): RequestReplyDeps {
  return {
    natsConnection: { request: mockNatsRequest, publish: mockNatsPublish } as unknown as RequestReplyDeps['natsConnection'],
    producerService: { publish: mockPublish } as unknown as RequestReplyDeps['producerService'],
    logger: {
      logEventEmitted: mockLogEmitted,
      logEventConsumed: mockLogConsumed,
      logEventError: mockLogError,
      logEventDlq: jest.fn(),
    } as unknown as RequestReplyDeps['logger'],
    config,
  };
}
```

`defaultConfig` stays unchanged (`{ defaultTimeoutMs: 5000 }`) — tests requiring fallback pass explicit overrides.

### Step 3.4 — Edit `src/request-reply/request-reply.service.sendResponse.spec.ts`

Add a local `buildService` factory and new test cases. Do NOT modify the existing three `it` blocks.

A. Add the factory helper and a `mockNatsPublish` variable inside the `describe('sendResponse', ...)` block, before `beforeEach`. Add it after the existing variable declarations (after line 22):
```typescript
  let mockNatsPublish: jest.Mock;

  const buildService = async (configOverrides: Partial<RequestReplyConfig>): Promise<RequestReplyService> => {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: REQUEST_REPLY_DEPS_TOKEN,
          useValue: createDeps(
            mockNatsRequest,
            mockPublish,
            mockLogEmitted,
            mockLogConsumed,
            mockLogError,
            { ...defaultConfig, ...configOverrides },
            mockNatsPublish,
          ),
        },
        RequestReplyService,
      ],
    }).compile();
    return module.get(RequestReplyService);
  };
```

B. In the existing `beforeEach` (after line 26 `mockNatsRequest = jest.fn();`), initialize:
```typescript
    mockNatsPublish = jest.fn();
```
(The existing `beforeEach` keeps building the default-config `service` as-is — no change to its body except the `mockNatsPublish` init.)

C. Update the import line (line 5) to also pull the type:
```typescript
import { sampleContext, defaultConfig, createDeps, createTestEnvelope } from './__tests__/request-reply-test.utils';
import type { RequestReplyConfig } from './request-reply.types';
```

D. Add new test cases at the end of the `describe` block (after the last `it`, before the closing `});`):
```typescript
  it('publishes INBOX reply_to via core NATS when fallback enabled', async () => {
    const serviceWithFallback = await buildService({ fallbackToCoreNatsOnInbox: true });
    const responseEvent = createTestEnvelope({
      id: 'evt_response-101',
      reply_to: '_INBOX.manual.company.create.abc',
    });

    await serviceWithFallback.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockNatsPublish).toHaveBeenCalledTimes(1);
    const [subject, payload] = mockNatsPublish.mock.calls[0];
    expect(subject).toBe('_INBOX.manual.company.create.abc');
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('logs the core-NATS fallback emission once', async () => {
    const serviceWithFallback = await buildService({ fallbackToCoreNatsOnInbox: true });
    const responseEvent = createTestEnvelope({
      id: 'evt_response-102',
      reply_to: 'INBOX.reply.subject',
    });

    await serviceWithFallback.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockLogEmitted).toHaveBeenCalledTimes(1);
  });

  it('uses JetStream publish for non-INBOX reply_to even when fallback enabled', async () => {
    const serviceWithFallback = await buildService({ fallbackToCoreNatsOnInbox: true });
    const responseEvent = createTestEnvelope({
      id: 'evt_response-103',
      reply_to: 'company.abc.response.v1',
    });

    await serviceWithFallback.sendResponse(sampleContext.correlationId, responseEvent);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockNatsPublish).not.toHaveBeenCalled();
  });

  it('respects a custom coreNatsFallbackPattern', async () => {
    const serviceCustom = await buildService({
      fallbackToCoreNatsOnInbox: true,
      coreNatsFallbackPattern: '^custom\\.',
    });
    const matched = createTestEnvelope({ id: 'evt_response-104', reply_to: 'custom.foo' });
    const unmatched = createTestEnvelope({ id: 'evt_response-105', reply_to: '_INBOX.foo' });

    await serviceCustom.sendResponse(sampleContext.correlationId, matched);
    expect(mockNatsPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).not.toHaveBeenCalled();

    await serviceCustom.sendResponse(sampleContext.correlationId, unmatched);
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockNatsPublish).toHaveBeenCalledTimes(1);
  });

  it('fails fast when the configured pattern is an invalid regex', async () => {
    await expect(buildService({ fallbackToCoreNatsOnInbox: true, coreNatsFallbackPattern: '(' })).rejects.toThrow();
  });
```

The first two existing tests (INBOX reply_to with default `fallbackToCoreNatsOnInbox` off → `producerService.publish`) already cover the backward-compat scenario explicitly, so no additional "fallback false" test is required.

### Step 3.5 — Verify no other spec needs updating

- `request-reply.service.request.spec.ts`, `request-reply.service.sendRequest.spec.ts`, `request-reply.service.isRequestReplyMessage.spec.ts`, `request-reply.service.buildResponseEnvelope.spec.ts`, `request-reply.global.spec.ts` all construct deps via the 6-argument `createDeps`. Because `mockNatsPublish` is optional with a default, these files need NO changes (re-confirm by reading each `createDeps(` call site — they pass exactly 6 args).
- `request-reply.types.ts` `RequestReplyConfig` gains optional fields — existing typed `let config: { defaultTimeoutMs: number }` literals still satisfy `RequestReplyConfig` structurally; no TS breakage.

---

## 4. Build / Test / Lint Verification Commands

Run each single command (do NOT chain):

1. `npm run build` — `tsc -p tsconfig.build.json` must succeed (pretest step).
2. `npm run typecheck` — `tsc --noEmit` must report zero errors.
3. `npm run lint` — `eslint "src/**/*.ts"` must be clean.
4. `npm test -- --testPathPattern=request-reply.service.sendResponse.spec` — new sendResponse tests pass.
5. `npm test` — full suite green (no regressions across request-reply and consumer specs).
6. `npm run format:check` — confirm formatting; run `npm run format` only if it fails.

---

## 5. Git Actions (step 4.2 implementer will execute; documented here for reference)

- Stage only the modified source/test files:
  - `src/request-reply/request-reply.types.ts`
  - `src/request-reply/request-reply.service.ts`
  - `src/request-reply/__tests__/request-reply-test.utils.ts`
  - `src/request-reply/request-reply.service.sendResponse.spec.ts`
- Before committing, run `git status` and verify no `.gitignore`-matching files (e.g. `dist/`, `node_modules/`) are staged (Gitignore Compliance Rule).
- Commit message: `feat(request-reply): add INBOX-aware core NATS fallback for sendResponse`
- This task plan does NOT perform the commit (that is step 4.2). This plan only specifies the change set.

---

## 6. Out of Scope for THIS step (4.1)

- Writing/modifying any non-`.md` file (source edits belong to step 4.2).
- `package.json` version bump (already done in step 3).
- Provider wiring (`events-toolkit-module.providers.ts`) — confirmed no change needed.
- Public API exports (`index.ts`) — confirmed no change needed.
- Consumer `RequestReplyMessageProcessor` / `request-reply-message-processor.spec.ts` integration test (TODO mentions it; scope is additive and NOT required to fix the redelivery root cause once `sendResponse` stops throwing). Left for a follow-up if step 4.5 flags it.
- Documentation (CHANGELOG, README, `docs/request-reply-patterns.md`, `docs/request-reply-guidelines.md`) — belongs to step 4.4.
- Refactoring `createDeps` into an options object — flagged for step 4.3 (simplifier).

---

## 7. Verification Checklist (to be used by step 4.5)

- [ ] `RequestReplyConfig` has both new optional fields with JSDoc.
- [ ] `resolveRequestReplyConfig` defaults: `false` and `'^_?INBOX\\.'`.
- [ ] `inboxRegex` compiled once in constructor; used only in `shouldUseCoreNats`.
- [ ] `shouldUseCoreNats` early-returns on disabled flag (single-section conditions).
- [ ] `sendResponse` falls back to `natsConnection.publish(replyTo, encodeEvent(...))` + `logRequestSent`, never awaiting a PubAck.
- [ ] Non-INBOX + fallback-on still uses `producerService.publish`.
- [ ] No changes to `index.ts`, provider files, `package.json`, processor.
- [ ] All new/changed methods ≤ 2 params, ≤ 50 lines, ≤ 2 nesting levels; private by default.
- [ ] New tests green; full suite green; lint/typecheck/build clean.