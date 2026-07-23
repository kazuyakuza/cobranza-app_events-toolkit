# Plan — Task 1: Add `idempotent` flag to `@OnRequestReply` decorator

- **TODO file:** `.agent/todos/20260723/20260723-todo-2.md` (Task 1 only)
- **Critical Workflow step:** 4.1 — Analysis & Planning
- **Scope:** Task 1 of TODO-2 ONLY. Tasks 2–5 (provider wiring, tests, docs, verification) are separate 4.1–4.6 cycles and are OUT OF SCOPE for this plan.
- **Reference pattern:** `@OnEvent` idempotency implementation (v0.15.0).

---

## 1. Pre-Analysis & Technical Decisions

### 1.1 Current state

- `@OnRequestReply` exists and registers handlers via `RequestReplyConsumerService.registerHandler({ eventType, handler, companyId })` (options-object form, respects max-2-params).
- `OnRequestReplyExplorer` (77 lines) scans providers/controllers, reads `ON_REQUEST_REPLY_METADATA`, binds handler, and calls `registerHandler`.
- `OnRequestReplyMetadata`/`OnRequestReplyOptions` currently have NO `idempotent` field.
- `OnRequestReplyExplorerDeps` currently has `discovery`, `reflector`, `requestReplyConsumerService` — no `idempotencyService`.
- `@OnEvent` already implements the exact target behavior in `on-event.decorator.ts`, `on-event-explorer-deps.interface.ts`, and `on-event.explorer.ts` (`resolveHandler` + `wrapWithIdempotency` private methods).

### 1.2 Key differences from `@OnEvent` to preserve

- `@OnRequestReply` has NO `version` field and NO `EventScope`/`buildWildcardSubject`. It registers by `eventType` (+ optional `companyId`), not by a NATS wildcard subject. So the explorer does NOT need a `buildWildcardSubject` step.
- `registerHandler` accepts an options object (`RegisterHandlerOptions`), so the resolved (possibly wrapped) handler must be passed as `handler` inside that options object.
- The idempotency wrapping itself (`isDuplicate` → run → `markAsProcessed` on success; skip mark on throw) is **identical** to `OnEventExplorer.wrapWithIdempotency`.

### 1.3 Decisions

1. **Mirror `OnEventExplorer` exactly** for `resolveHandler` and `wrapWithIdempotency` (same signatures, same JSDoc style), adapting only the registration call.
2. **`wrapWithIdempotency` signature:** `(handler: EventHandler, service: IdempotencyService): EventHandler` — 2 params (max 2-params compliant), a direct mirror of `OnEventExplorer`. The TODO Task 1 text shows a 1-param signature `wrapWithIdempotency(handler)`, but the caller instruction explicitly requires "mirroring OnEventExplorer" and "wrap the handler identically to OnEventExplorer". Passing `service` as a second explicit param is allowed (≤ 2 params) and keeps the method pure/testable without non-null assertions on `this.deps`. This is the safer, rule-compliant choice.
3. **`resolveHandler` signature:** `(handler: EventHandler, metadata: OnRequestReplyMetadata): EventHandler` — 2 params, direct mirror.
4. **No new files** for Task 1 (only the 3 listed files). Provider wiring (Task 2) and tests (Task 3) are separate.
5. **`IdempotencyService` import** in explorer uses `import type` (mirrors OnEventExplorer line 6) since it is only used as a type in the helper signature.
6. **Backward compatibility:** all new fields are optional; when `idempotencyService` is `undefined` or `idempotent` is falsy, behavior is unchanged (original handler registered).

### 1.4 Rule compliance checks (post-change targets)

- `on-request-reply.explorer.ts`: estimated ~115 lines < 200 ✓.
- Every method body: `tryRegisterHandler` (~10 lines), `resolveHandler` (~4), `wrapWithIdempotency` (~6) — all < 50 ✓.
- Max params per method: 2 ✓ (`resolveHandler`, `wrapWithIdempotency`, `tryRegisterHandler`, `registerInstanceHandlers`).
- Max nesting depth: 2 ✓ (no new nesting added; wrapping uses arrow function with single `if`).
- Prefer private: `resolveHandler` and `wrapWithIdempotency` are `private` ✓.
- Self-documenting: JSDoc on new members mirroring OnEvent style ✓.
- No commented code ✓.

---

## 2. High-Level Approach

Mirror the `@OnEvent` idempotency implementation onto `@OnRequestReply`:

1. Add `idempotent?: boolean` (with JSDoc) to both `OnRequestReplyMetadata` and `OnRequestReplyOptions` in the decorator file.
2. Add optional `idempotencyService?: IdempotencyService` to `OnRequestReplyExplorerDeps` (with `import type`).
3. In `OnRequestReplyExplorer`, import `IdempotencyService` as type, route the bound handler through a new `resolveHandler` private method, and add a private `wrapWithIdempotency` helper that performs the duplicate-check / execute / mark-on-success flow, then register the resolved (wrapped or original) handler.

No git, build, test, or doc actions in this step (4.2 implementation handles code edits; 4.4 handles docs; tests are Task 3). This plan is plan-only; no source files are modified during 4.1.

---

## 3. Detailed Steps

### Step 3.1 — Modify `src/consumer/decorators/on-request-reply.decorator.ts`

**Goal:** Add `idempotent?: boolean` to `OnRequestReplyMetadata` and `OnRequestReplyOptions` with JSDoc mirroring `OnEventOptions.idempotent`.

#### 3.1.1 Add to `OnRequestReplyMetadata` interface

Insert after the `payloadExample: Record<string, unknown>;` field (line 19), before the closing `}`:

```ts
  /**
   * When `true` and `IdempotencyModule` is registered, the explorer wraps this handler
   * with a duplicate check so repeated delivery of the same event is skipped silently.
   * No-op when the idempotency module is not configured.
   *
   * @see {@link IdempotencyService} for the underlying deduplication service.
   * @see {@link OnRequestReplyExplorer} for the wrapping logic.
   */
  idempotent?: boolean;
```

#### 3.1.2 Add to `OnRequestReplyOptions` interface

Insert after the `payloadExample: Record<string, unknown>;` field (line 37), before the closing `}`. Include an `@example` block for parity with `OnEventOptions.idempotent`:

```ts
  /**
   * When `true` and `IdempotencyModule` is registered, the explorer wraps this handler
   * with a duplicate check so repeated delivery of the same event is skipped silently.
   * No-op when the idempotency module is not configured.
   *
   * @see {@link IdempotencyService} for the underlying deduplication service.
   * @see {@link OnRequestReplyExplorer} for the wrapping logic.
   *
   * @example
   * ```ts
   * @OnRequestReply('payment.proof.uploaded', {
   *   companyId: '550e8400-e29b-41d4-a716-446655440000',
   *   description: 'Handles upload responses',
   *   payloadExample: { proofId: 'uuid' },
   *   idempotent: true,
   * })
   * async handleResponse(event: EventEnvelope<PaymentProofData>) {
   *   // handle response
   * }
   * ```
   */
  idempotent?: boolean;
```

**No import changes needed** — `IdempotencyService`/`OnRequestReplyExplorer` are referenced via `{@link}` JSDoc only; `import type` is not required because the decorator file does not use the type at runtime or in a type annotation (only in JSDoc, which does not need imports). This mirrors `on-event.decorator.ts`, which also references `{@link IdempotencyService}` purely in JSDoc without importing it.

**Verification:** File stays well under 200 lines (estimated ~95 lines).

---

### Step 3.2 — Modify `src/consumer/decorators/on-request-reply-explorer-deps.interface.ts`

**Goal:** Add optional `idempotencyService?: IdempotencyService` to `OnRequestReplyExplorerDeps` mirroring `OnEventExplorerDeps`.

#### 3.2.1 Add `import type` for `IdempotencyService`

Add after the existing imports (after line 2), mirroring `on-event-explorer-deps.interface.ts` line 3:

```ts
import type { IdempotencyService } from '../../idempotency/idempotency.service';
```

#### 3.2.2 Add `idempotencyService` member

Append to the `OnRequestReplyExplorerDeps` interface (after `requestReplyConsumerService`), with JSDoc mirroring `OnEventExplorerDeps`:

```ts
  /**
   * Idempotency service used to wrap handlers declared with `idempotent: true`.
   * Optional — `undefined` when `IdempotencyModule` is not registered, in which
   * case the `idempotent` flag on `@OnRequestReply()` is silently ignored.
   *
   * @see {@link IdempotencyService} for the deduplication methods.
   */
  idempotencyService?: IdempotencyService;
```

**Verification:** File stays well under 200 lines (estimated ~30 lines). No multi-section boolean conditions; no method bodies.

---

### Step 3.3 — Modify `src/consumer/decorators/on-request-reply.explorer.ts`

**Goal:** Route handlers through idempotency wrapping when opted in, mirroring `OnEventExplorer`.

#### 3.3.1 Add `IdempotencyService` type import

Add after existing imports (after line 7), mirroring `on-event.explorer.ts` line 6:

```ts
import type { IdempotencyService } from '../../idempotency/idempotency.service';
```

#### 3.3.2 Update class JSDoc (optional but recommended for parity)

The existing class doc comment (lines 15–22) has no idempotency note. Append a paragraph mirroring the OnEventExplorer idempotency note (lines 22–26 of on-event.explorer.ts). Insert before the closing `*/` of the class doc:

```ts
 * When a handler is decorated with `idempotent: true` and {@link IdempotencyService}
 * is available (i.e. `IdempotencyModule` is registered), the explorer wraps the handler
 * with a duplicate check: the event is skipped if already processed, otherwise the
 * handler runs and the event is marked as processed afterwards.
```

And add to the `@see` list at the end of the class doc:

```ts
 * @see {@link IdempotencyService} for the deduplication service used in idempotent wrapping.
```

#### 3.3.3 Modify `tryRegisterHandler`

**Current (lines 61–76):**

```ts
  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
    if (!descriptor) return;
    if (typeof descriptor.value !== 'function') return;
    const methodRef = descriptor.value as (...args: unknown[]) => unknown;
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return;

    const handler = methodRef.bind(target.instance) as EventHandler;

    this.deps.requestReplyConsumerService.registerHandler({
      eventType: metadata.eventType,
      handler,
      companyId: metadata.companyId,
    });
  }
```

**New:**

```ts
  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
    if (!descriptor) return;
    if (typeof descriptor.value !== 'function') return;
    const methodRef = descriptor.value as (...args: unknown[]) => unknown;
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return;

    const handler = methodRef.bind(target.instance) as EventHandler;
    const finalHandler = this.resolveHandler(handler, metadata);

    this.deps.requestReplyConsumerService.registerHandler({
      eventType: metadata.eventType,
      handler: finalHandler,
      companyId: metadata.companyId,
    });
  }
```

Changes: add `const finalHandler = this.resolveHandler(handler, metadata);` and register `finalHandler` instead of `handler`. Method body stays ~12 lines (< 50) ✓. Params: 2 ✓. Nesting depth: `if (!descriptor)` is level 1, no deeper nesting added ✓.

#### 3.3.4 Add `resolveHandler` private method

Insert after `tryRegisterHandler` (mirroring OnEventExplorer lines 87–102). JSDoc adapted for `OnRequestReply`:

```ts
  /**
   * Returns the handler to register, wrapping it with idempotency when the
   * decorator opted in and the idempotency service is available.
   *
   * Resolution order:
   * 1. If `metadata.idempotent` is falsy, returns the original handler unchanged.
   * 2. If `idempotencyService` is undefined (module not registered), returns the original handler.
   * 3. Otherwise, delegates to {@link wrapWithIdempotency}.
   *
   * @see {@link wrapWithIdempotency} for the wrapping implementation.
   */
  private resolveHandler(handler: EventHandler, metadata: OnRequestReplyMetadata): EventHandler {
    if (!metadata.idempotent) return handler;
    if (!this.deps.idempotencyService) return handler;
    return this.wrapWithIdempotency(handler, this.deps.idempotencyService);
  }
```

Method body: 4 lines < 50 ✓. Params: 2 ✓. Nesting: single-level `if` returns ✓. Boolean conditions are single-section (no `&&`) ✓.

#### 3.3.5 Add `wrapWithIdempotency` private method

Insert after `resolveHandler` (mirroring OnEventExplorer lines 104–122):

```ts
  /**
   * Wraps a handler so duplicate events are skipped and processed events are marked.
   *
   * The wrapped handler:
   * 1. Calls {@link IdempotencyService.isDuplicate} — returns early if `true`.
   * 2. Invokes the original handler.
   * 3. Calls {@link IdempotencyService.markAsProcessed} after the handler succeeds.
   *
   * If the handler throws, the event is **not** marked as processed, allowing retries.
   *
   * @see {@link IdempotencyService.executeIfNotProcessed} for the equivalent high-level API.
   */
  private wrapWithIdempotency(handler: EventHandler, service: IdempotencyService): EventHandler {
    return async (event, context) => {
      if (await service.isDuplicate(event)) return;
      await handler(event, context);
      await service.markAsProcessed(event);
    };
  }
```

Method body: 6 lines (< 50) ✓. Params: 2 ✓. Nesting: arrow body has a single `if` (level 1 within method body; method-body-relative depth = 1) ✓. The `if (await service.isDuplicate(event)) return;` is a single-section boolean condition ✓.

#### 3.3.6 Resulting file structure (order, mirroring OnEventExplorer)

```text
imports (incl. import type IdempotencyService)
HandlerTarget interface
class JSDoc
@Injectable() OnRequestReplyExplorer
  constructor
  onModuleInit
  private explore
  private getValidInstances
  private isValidWrapper
  private hasObjectInstance
  private registerInstanceHandlers
  private tryRegisterHandler      <- modified
  private resolveHandler          <- new
  private wrapWithIdempotency     <- new
```

**Estimated final line count:** ~115 lines (< 200) ✓.

---

## 4. Verification of Plan vs Original Task (Task 1)

| TODO Task 1 requirement (lines 17–39) | Plan coverage |
|---|---|
| Add `idempotent?: boolean` to `OnRequestReplyMetadata` | Step 3.1.1 ✓ |
| Add `idempotent?: boolean` to `OnRequestReplyOptions` | Step 3.1.2 ✓ |
| JSDoc matching `OnEventOptions.idempotent` style with `@see` to `IdempotencyService` and `OnRequestReplyExplorer` | Steps 3.1.1/3.1.2 ✓ |
| Add `idempotencyService?: IdempotencyService` to `OnRequestReplyExplorerDeps`, import from `../../idempotency/idempotency.service` | Step 3.2 ✓ |
| `tryRegisterHandler`: wrap when `metadata.idempotent` true AND `deps.idempotencyService` exists | Step 3.3.3 + 3.3.4 ✓ |
| Extract private `wrapWithIdempotency(handler: EventHandler): EventHandler` | Step 3.3.5 — uses 2-param `(handler, service)` mirror (compliant, see §1.3.2) ✓ |
| Wrapper: check `isDuplicate` → skip if true; run handler; on success `markAsProcessed`; on throw do NOT mark | Step 3.3.5 ✓ |
| `resolveHandler()` and `wrapWithIdempotency()` extracted as private (mirroring OnEventExplorer) | Steps 3.3.4/3.3.5 ✓ |
| Explorer stays < 200 lines; method bodies < 50 lines | Estimated ~115 lines; all methods < 50 ✓ |
| Do NOT modify other source files | Only 3 files touched ✓ |

All Task 1 requirements are covered. Tasks 2–5 are intentionally excluded (separate 4.1–4.6 cycles per Critical Workflow).

---

## 5. Out of Scope (handled by other tasks / steps)

- Provider wiring (`consumer-module.providers.ts`, `consumer.module.ts`) → Task 2.
- Test fixtures & idempotent spec files → Task 3.
- Documentation (`docs/idempotency.md`, `README.md`, `CHANGELOG.md`, etc.) → Task 4 / step 4.4.
- Typecheck/lint/test runs and TODO `[DONE]` marking → Task 5 / steps 4.5–4.6.
- Git branch setup / commits: handled by Critical Workflow steps 2 and per-task 4.2 (implementer), NOT by this 4.1 plan step.

---

## 6. Risks & Edge Cases

- **`import type` vs runtime import:** Using `import type` for `IdempotencyService` is correct because the explorer only uses it as a parameter type annotation, never instantiated or accessed at runtime within the explorer file itself (access is via `this.deps.idempotencyService`). Mirrors OnEventExplorer. No risk of unused-import lint since type-only imports are erased.
- **Non-null assertion avoidance:** `resolveHandler` guards `if (!this.deps.idempotencyService) return handler;` before calling `wrapWithIdempotency`, so passing `this.deps.idempotencyService` to the helper is type-safe without `!`. (TypeScript narrowing inverts `undefined` after the guard.) Mirrors OnEventExplorer exactly.
- **Backward compatibility:** All new fields optional; default behavior unchanged when `idempotent` omitted or `idempotencyService` absent. Existing `on-request-reply.explorer.spec.ts` tests continue to pass because they do not set `idempotent` (handler returned unchanged) and do not provide `idempotencyService` in `createDeps` (deps interface gains an optional field — existing objects remain valid).

---

## 7. Post-Implementation Checklist (for 4.2 implementer to run, not 4.1)

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` — existing `on-request-reply.explorer.spec.ts` passes unchanged.
- `on-request-reply.explorer.ts` line count < 200 (run: count non-blank; confirm).
- No method body > 50 lines; no method > 2 params; no nesting > 2 levels.

---

**Plan authored by:** Architector sub-agent (Critical Workflow step 4.1).
**Status:** Plan complete. Awaiting Plan Agent approval before 4.2 implementation.