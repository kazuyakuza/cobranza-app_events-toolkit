# Global Plan: Add INBOX-aware response publishing fallback to @cobranza-apps/events-toolkit

**Source TODO:** `.agent/todos/20260722/20260722-todo-0.md`
**Date:** 2026-07-22

---

## Global Pre-Analysis

### Problem
When using core NATS `nats req` with `@cobranza-apps/events-toolkit`, the caller sets a `reply_to` pointing to an INBOX subject. `RequestReplyService.sendResponse()` publishes via `ProducerService.publish()`, which always uses `jetStream.publish()`. INBOX subjects do not match any JetStream stream, so publish times out waiting for a PubAck. The message is never acked, causing JetStream redelivery and duplicate processing.

### Solution Design (Enhanced Option A)
Add two new optional fields to `RequestReplyConfig`:
- `fallbackToCoreNatsOnInbox?: boolean` (default `false` for backward compatibility)
- `coreNatsFallbackPattern?: string` (default `'^_?INBOX\\.'`)

When `fallbackToCoreNatsOnInbox` is `true`, `sendResponse()` tests `replyTo` against a RegExp built from `coreNatsFallbackPattern`. On match, it uses `natsConnection.publish()` directly instead of `ProducerService.publish()`.

### Why a Configurable Pattern?
Different NATS deployments or client conventions may use custom INBOX prefixes. A hardcoded `^_?INBOX\.` is sufficient for standard NATS but brittle for non-standard setups. Exposing a regex string as config follows the "convention over configuration" principle: it works out of the box but can be overridden without code changes.

### Backward Compatibility
- Default `fallbackToCoreNatsOnInbox: false` preserves existing behavior exactly.
- Default `coreNatsFallbackPattern` only applies when the flag is enabled.
- No changes to `ProducerService`, consumer ack semantics, or public API beyond the two new optional config fields.

### Version Bump
Current: `0.12.0`. This is a new feature (minor bump) → `0.13.0`.

### Files Affected
- `src/request-reply/request-reply.types.ts`
- `src/request-reply/request-reply.service.ts`
- `src/request-reply/request-reply.service.sendResponse.spec.ts`
- `src/request-reply/__tests__/request-reply-test.utils.ts`
- `src/request-reply/index.ts` (verify no new exports needed)
- `package.json`
- `README.md`
- `docs/request-reply-patterns.md`
- `docs/request-reply-guidelines.md`
- `CHANGELOG.md`

---

## Execution Steps

| Step | Description | Sub-agent |
|------|-------------|-----------|
| 2 | Git Feature Branch Setup | implementer |
| 3 | Version Update (0.12.0 → 0.13.0) | implementer |
| 4.1 | Task 1: Analysis & Planning | architector |
| 4.2 | Task 1: Implementation | implementer |
| 4.3 | Task 1: Code Review & Simplification | code-reviewer + code-simplifier; fix via implementer |
| 4.4 | Task 1: Documentation | docs-specialist |
| 4.5 | Task 1: Verification | architector |
| 4.6 | Task 1: Task Completion | implementer |
| 5 | TODO File Completion | implementer |

---

## Task 1: Add INBOX-aware response publishing fallback

### Task 1 Pre-Analysis

**Technical Decisions:**
1. **RegExp construction**: Compile the pattern once in `resolveRequestReplyConfig()` and store it as a private compiled regex on the service, or compile lazily in `sendResponse()`. Given the config is static after resolution, compiling once at service construction or in `resolveRequestReplyConfig` is best. However, since `RequestReplyConfig` is a plain object interface, we can compile it in a private helper inside `RequestReplyService` or add a small util function `buildInboxRegex(pattern: string): RegExp`.
2. **Default pattern string**: `'^_?INBOX\\.'` — note the double-escape for the backslash in the string literal, so the actual regex is `^_?INBOX\.`.
3. **Core NATS publish API**: `natsConnection.publish(subject, payload)` where `payload` is `Uint8Array`. `encodeEvent` already returns `Uint8Array`.
4. **Logging**: When falling back to core NATS, we should not skip logging entirely. The existing `ProducerService.publish()` logs emission on success and error on failure. For the fallback path, we should log via `EventLoggerService` manually for consistency. The `RequestReplyService` already has access to the logger.
5. **Error handling**: If `natsConnection.publish()` throws, let it bubble up. The caller (`processMessage` in consumers) will handle it as before (nack/rethrow).

**Architecture:**
- `RequestReplyService` already owns `natsConnection` and `config`. No provider wiring changes needed.
- `RequestReplyDeps` already passes these in.

---

### Task 1 Detailed Plan

#### 4.1 Analysis & Planning
- Architector confirms the design above, generates the per-task plan below, and saves it.

#### 4.2 Implementation

**A. Update `src/request-reply/request-reply.types.ts`**
- Add `fallbackToCoreNatsOnInbox?: boolean` to `RequestReplyConfig`.
- Add `coreNatsFallbackPattern?: string` to `RequestReplyConfig`.
- Update `resolveRequestReplyConfig` to default:
  - `fallbackToCoreNatsOnInbox: partial?.fallbackToCoreNatsOnInbox ?? false`
  - `coreNatsFallbackPattern: partial?.coreNatsFallbackPattern ?? '^_?INBOX\\.'`

**B. Update `src/request-reply/request-reply.service.ts`**
- Add a private helper `buildInboxRegex(pattern: string): RegExp` (or inline).
- Add a private readonly `inboxRegex: RegExp | null` initialized in constructor if `config.fallbackToCoreNatsOnInbox` is true.
- Add a private method `shouldUseCoreNats(replyTo: string): boolean`.
- Modify `sendResponse()`:
  ```typescript
  async sendResponse(correlationId: string, responseEvent: AnyEventEnvelope<unknown>): Promise<void> {
    const replyTo = responseEvent.reply_to;
    ensureReplyTo(replyTo, correlationId);

    if (this.shouldUseCoreNats(replyTo)) {
      const payload = encodeEvent(responseEvent);
      this.natsConnection.publish(replyTo, payload);
      return;
    }

    await this.producerService.publish(replyTo, responseEvent);
  }
  ```
- Optionally log the fallback for observability (via `this.logger.logInfo` or similar).

**C. Update tests**
- `src/request-reply/__tests__/request-reply-test.utils.ts`: Update `defaultConfig` and `createDeps` if needed. Actually `defaultConfig` should stay minimal; tests that need the new config can pass overrides.
- `src/request-reply/request-reply.service.sendResponse.spec.ts`:
  1. Add `mockNatsPublish` mock to the test utils/deps.
  2. Test: INBOX reply_to + `fallbackToCoreNatsOnInbox: true` → calls `natsConnection.publish`, not `producerService.publish`.
  3. Test: INBOX reply_to + `fallbackToCoreNatsOnInbox: false` (default) → calls `producerService.publish`.
  4. Test: non-INBOX reply_to + `fallbackToCoreNatsOnInbox: true` → calls `producerService.publish`.
  5. Test: custom pattern `^custom\.` + `fallbackToCoreNatsOnInbox: true` + `reply_to: 'custom.foo'` → calls `natsConnection.publish`.
  6. Test: invalid pattern string does not crash service creation (optional, but good).

**D. Update `package.json`**
- Bump version to `0.13.0`.

#### 4.3 Code Review & Simplification
- Review for: correct regex compilation, safe fallback, test coverage, no breaking changes.
- Simplify where possible.

#### 4.4 Documentation
- **CHANGELOG.md**: Add `## [0.13.0]` section with Added sub-section describing the two new config fields and behavior.
- **README.md**: Update the Configuration Options table under `requestReply` to list `fallbackToCoreNatsOnInbox` and `coreNatsFallbackPattern`.
- **docs/request-reply-patterns.md**: Update the `RequestReplyConfig` API reference table (§10) to include the new fields. Add a short paragraph in §3 (Async Pattern) explaining when to enable the fallback (e.g., manual testing with `nats req`).
- **docs/request-reply-guidelines.md**: Add a note in the Timeout or Error Handling sections about INBOX fallback for responders.

#### 4.5 Verification
- Run `npm run test` — all request-reply tests must pass.
- Run `npm run lint` — no lint errors.
- Run `npm run typecheck` — no type errors.
- Verify no `.gitignore` violations.

#### 4.6 Task Completion
- Append `[DONE]` to the task in the TODO file.
- Commit with meaningful message: `feat: add INBOX-aware core NATS fallback for sendResponse`.

---

## Step 5: TODO File Completion

- Rename TODO file to `20260722-todo-0-DONE.md`.
- Merge feature branch `feat/inbox-aware-response-fallback` into `main`.
- Push `main` to `origin`.
