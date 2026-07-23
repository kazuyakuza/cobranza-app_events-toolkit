# Plan — Idempotency Support for @OnRequestReply Decorator

## Context

Idempotency support was successfully added to the `@OnEvent` decorator in the previous work (TODO-2). The user now requests extending the same `idempotent?: boolean` flag to `@OnRequestReply`, since it is also a consumer-side decorator that receives events.

## Analysis

### Current State

- **`@OnEvent`** — already supports `{ idempotent: true }` via `OnEventOptions.idempotent` / `OnEventMetadata.idempotent`. `OnEventExplorer` wraps the handler with `IdempotencyService` when the flag is set and the service is present.
- **`@OnRequestReply`** — does NOT have an `idempotent` flag. `OnRequestReplyOptions` / `OnRequestReplyMetadata` lack the field. `OnRequestReplyExplorer` does not wrap handlers with idempotency.
- **`@EmitEvent`** — producer-side decorator; idempotency does not apply (it emits, it does not consume/deduplicate).

### Decision

**Scope**: Add `idempotent?: boolean` to `@OnRequestReply` only. Do NOT add it to `@EmitEvent` (producer-side, out of scope).

## Files to Change

### 1. `src/consumer/decorators/on-request-reply.decorator.ts`
- Add `idempotent?: boolean` to `OnRequestReplyMetadata`
- Add `idempotent?: boolean` to `OnRequestReplyOptions` with JSDoc matching `@OnEvent`

### 2. `src/consumer/decorators/on-request-reply-explorer-deps.interface.ts`
- Add optional `idempotencyService?: IdempotencyService` to `OnRequestReplyExplorerDeps`

### 3. `src/consumer/decorators/on-request-reply.explorer.ts`
- In `tryRegisterHandler()`: if `metadata.idempotent` is true AND `deps.idempotencyService` exists, wrap the handler identically to `OnEventExplorer`:
  ```ts
  const wrappedHandler = async (event, context) => {
    if (await idempotencyService.isDuplicate(event)) {
      return; // skip duplicate silently
    }
    await handler(event, context);
    await idempotencyService.markAsProcessed(event);
  };
  ```
- Extract a private `wrapWithIdempotency(handler)` helper (mirrors `OnEventExplorer` pattern)

### 4. `src/consumer/consumer-module.providers.ts`
- Update `createRequestReplyExplorerDepsProvider()` to inject `IdempotencyService` with `@Optional()` (mirrors `createOnEventExplorerDepsProvider` pattern).
- Must respect max-2-params rule: refactor to use an intermediate `REQUEST_REPLY_DISCOVERY_PAIR_TOKEN` if needed, exactly as was done for `createOnEventExplorerDepsProvider` → `createConsumerDiscoveryPairProvider`.

### 5. Tests
- `src/consumer/decorators/on-request-reply.explorer.spec.ts` — add idempotency wrapping tests (or create `on-request-reply.explorer.idempotent.spec.ts` if the original spec exceeds 200 lines)
- `src/testing/mock-idempotency.service.spec.ts` — no changes needed (already covers the mock)
- `src/consumer/decorators/on-request-reply.explorer.fixtures.ts` — add `IdempotentRequestReplyConsumer` fixture

### 6. Documentation
- `docs/idempotency.md` — update "Automatic Usage Patterns" section to mention `@OnRequestReply` alongside `@OnEvent`
- `docs/request-reply-patterns.md` — mention idempotency support in request-reply consumer section (if applicable)
- `CHANGELOG.md` — add note under existing 0.15.0 entry

## Acceptance Criteria

- [ ] `@OnRequestReply('type', { ..., idempotent: true })` compiles and works
- [ ] When `idempotent: true` and `IdempotencyModule` is present, duplicate request-reply responses are silently skipped
- [ ] When `idempotent: true` but `IdempotencyModule` is absent, the flag is a silent no-op
- [ ] All existing tests pass; new tests cover the wrapping behavior
- [ ] No file exceeds 200 lines
- [ ] No method exceeds 50 lines body / 2 params / 2 nesting depth

## Out of Scope

- `@EmitEvent` — producer-side, does not receive events, idempotency does not apply
- Any other decorators — none exist in the codebase beyond the three mentioned above
