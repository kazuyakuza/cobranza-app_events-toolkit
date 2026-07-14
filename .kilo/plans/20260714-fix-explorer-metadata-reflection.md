# Plan — Fix OnEventExplorer & OnRequestReplyExplorer Metadata Reflection

- **TODO file:** `.agent/todos/20260714/20260714-todo-0.md`
- **Task:** Fix OnEventExplorer metadata reflection (### "Fix OnEventExplorer metadata reflection")
- **Critical Workflow step:** 4.1 Analysis & Planning
- **Plan agent:** architector
- **Date:** 2026-07-14

## 1. Task Statement

Add a `typeof methodRef === 'function'` guard in `OnEventExplorer.tryRegisterHandler()` and `OnRequestReplyExplorer.tryRegisterHandler()` so that accessor properties (getters/setters) returned by `Object.getOwnPropertyNames(prototype)` are skipped before calling `Reflector.get()`. Add unit-test coverage using a consumer class that declares getter/setter properties.

## 2. Root Cause Analysis

`OnEventExplorer.registerInstanceHandlers()` and `OnRequestReplyExplorer.registerInstanceHandlers()` iterate `Object.getOwnPropertyNames(prototype)`. This enumeration returns the names of accessor properties (getter-only, setter-only, getter/setter pairs) in addition to regular method names.

In `tryRegisterHandler()`:

```typescript
const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
```

- For a **getter-only** property: the getter is invoked with `this = prototype`. If the getter does not reference `this`, it returns its literal value (e.g. a string or number) — a *non-function*.
- For a **setter-only** property: there is no getter, so `prototype[name]` returns `undefined`.
- For a **getter/setter pair**: similar to getter-only; returns a non-function value.

The next line:

```typescript
const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
```

`Reflector.get` delegates to `Reflect.getMetadata(key, target)`. The `reflect-metadata` implementation throws `TypeError` when `target` is `undefined` (the setter-only case). This is the stack trace observed in production (`TypeError at Reflect.getMetadata ... at OnEventExplorer.tryRegisterHandler`).

### Why guard with `typeof methodRef === 'function'`

- Skips `undefined` (setter-only → prevents the `TypeError`).
- Skips non-function return values from getters (defensive against `Reflect.getMetadata` returning `undefined` silently on non-object targets, which would not throw but is semantically incorrect for a method scan).
- Decorator-applied metadata lives on method functions only; accessor properties never carry `@OnEvent`/`@OnRequestReply` metadata, so skipping them is correct behavior.

## 3. Confirmation: Both Explorers Need the Fix

| File | `tryRegisterHandler` line | Same pattern? | Needs guard? |
|------|---------------------------|----------------|--------------|
| `src/consumer/decorators/on-event.explorer.ts` | line 67–77 | Yes | **Yes** |
| `src/consumer/decorators/on-request-reply.explorer.ts` | line 61–75 | Yes (identical access pattern) | **Yes** |

Both explorers perform `const methodRef = (target.prototype as Record<...>)[methodName];` followed by `this.deps.reflector.get(...)` with no accessor guard. The fix is required in both.

## 4. Detailed Implementation Steps

### Step 4.1 — Add guard in `OnEventExplorer`

**File:** `src/consumer/decorators/on-event.explorer.ts`
**Method:** `tryRegisterHandler` (currently lines 67–77)

**Current code (lines 67–77):**

```typescript
  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
    if (!metadata) return;

    const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(
      target.instance,
    ) as EventHandler;
    const subject = this.buildWildcardSubject(metadata);
    this.deps.consumerService.registerHandler(subject, handler);
  }
```

**New code (insert one guard line after the `methodRef` assignment):**

```typescript
  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    if (typeof methodRef !== 'function') return;
    const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
    if (!metadata) return;

    const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(
      target.instance,
    ) as EventHandler;
    const subject = this.buildWildcardSubject(metadata);
    this.deps.consumerService.registerHandler(subject, handler);
  }
```

**Change summary:** Insert `if (typeof methodRef !== 'function') return;` between the `methodRef` assignment (current line 68) and the `reflector.get` call (current line 69).

**Rule compliance:**
- Single-section boolean conditions: `typeof methodRef !== 'function'` is a single section — compliant.
- Max depth: the guard adds no new nesting — compliant.
- Max lines per method: body grows by 1 line (still well under 50) — compliant.
- Max lines per file: file grows by 1 line (83 total) — compliant.
- Self-documenting: the guard is a single-section, self-explanatory early return — compliant.

### Step 4.2 — Add guard in `OnRequestReplyExplorer`

**File:** `src/consumer/decorators/on-request-reply.explorer.ts`
**Method:** `tryRegisterHandler` (currently lines 61–75)

**Current code (lines 61–75):**

```typescript
  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return;

    const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(
      target.instance,
    ) as EventHandler;

    this.deps.requestReplyConsumerService.registerHandler({
      eventType: metadata.eventType,
      handler,
      companyId: metadata.companyId,
    });
  }
```

**New code (insert one guard line after the `methodRef` assignment):**

```typescript
  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    if (typeof methodRef !== 'function') return;
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return;

    const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(
      target.instance,
    ) as EventHandler;

    this.deps.requestReplyConsumerService.registerHandler({
      eventType: metadata.eventType,
      handler,
      companyId: metadata.companyId,
    });
  }
```

**Change summary:** Insert `if (typeof methodRef !== 'function') return;` between the `methodRef` assignment (current line 62) and the `reflector.get` call (current line 63).

### Step 4.3 — Add getter/setter test coverage to `OnEventExplorer` spec

**File:** `src/consumer/decorators/on-event.explorer.spec.ts`

**4.3.1 — Add new test consumer class** (after the `CustomVersionConsumer` class, before the `createDeps` function, i.e. after current line 50):

```typescript
class GetterSetterConsumer {
  handlerInvoked = false;

  @OnEvent('audit.ledger.snapshot', {
    version: '1',
    description: 'Handles audit ledger snapshots',
    payloadExample: { ledgerId: 'led-1' },
  })
  handleSnapshot(): void {
    this.handlerInvoked = true;
  }

  get readOnlyValue(): string {
    return 'constant';
  }

  set writeOnlyValue(_value: string) {
    void _value;
  }

  get computed(): number {
    return 42;
  }

  set computed(_value: number) {
    void _value;
  }

  plainMethod(): void {}
}
```

**4.3.2 — Add new test case** inside the `describe('onModuleInit', ...)` block (append after the last `it(...)` at current line 156, before the closing `});` at line 157):

```typescript
    it('should skip getter/setter accessor properties without throwing', () => {
      const instance = new GetterSetterConsumer();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      expect(() => explorer.onModuleInit()).not.toThrow();
      expect(consumerService.handlerCount).toBe(1);
      expect(consumerService.getHandler('company.*.audit.ledger.snapshot.v1')).toBeDefined();
    });
```

**Test rationale:**
- `writeOnlyValue` (setter-only) → `prototype['writeOnlyValue']` is `undefined` → previously caused `TypeError` at `Reflect.getMetadata`.
- `readOnlyValue` (getter-only) → returns non-function string.
- `computed` (getter/setter pair) → getter returns non-function number.
- `plainMethod` → plain function with no metadata (already covered semantically, included for completeness).
- `handleSnapshot` → the only decorated method; must be the single registered handler.
- Asserts `not.toThrow()` (regression guard for the `TypeError`) and `handlerCount === 1` (only the real handler registers).

### Step 4.4 — Add getter/setter test coverage to `OnRequestReplyExplorer` spec

**File:** `src/consumer/decorators/on-request-reply.explorer.spec.ts`

**4.4.1 — Add new test consumer class** (after the `CompanyScopedConsumer` class, before the `createDeps` function, i.e. after current line 48):

```typescript
class GetterSetterConsumer {
  handlerInvoked = false;

  @OnRequestReply('audit.ledger.snapshot', {
    companyId: 'tenant-1',
    description: 'Handles audit ledger responses',
    payloadExample: { ledgerId: 'led-1' },
  })
  handleSnapshot(): void {
    this.handlerInvoked = true;
  }

  get readOnlyValue(): string {
    return 'constant';
  }

  set writeOnlyValue(_value: string) {
    void _value;
  }

  get computed(): number {
    return 42;
  }

  set computed(_value: number) {
    void _value;
  }

  plainMethod(): void {}
}
```

**4.4.2 — Add new test case** inside the `describe('onModuleInit', ...)` block (append after the last `it(...)` at current line 173, before the closing `});` at line 174):

```typescript
    it('should skip getter/setter accessor properties without throwing', () => {
      const instance = new GetterSetterConsumer();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      expect(() => explorer.onModuleInit()).not.toThrow();
      expect(requestReplyConsumerService.handlerCount).toBe(1);
      expect(requestReplyConsumerService.getHandler('audit.ledger.snapshot', 'tenant-1')).toBeDefined();
    });
```

## 5. Build, Test & Lint Verification

After implementation (Step 4.2 of the Critical Workflow), the implementer must run the following single commands (one at a time, no chaining):

1. **Type-check / build:**
   ```
   npm run build
   ```
2. **Unit tests (target the two spec files first for fast feedback):**
   ```
   npx jest src/consumer/decorators/on-event.explorer.spec.ts src/consumer/decorators/on-request-reply.explorer.spec.ts
   ```
3. **Full test suite:**
   ```
   npm test
   ```
4. **Lint:**
   ```
   npm run lint
   ```
5. **Format check (optional):**
   ```
   npx prettier --check src/consumer/decorators/on-event.explorer.ts src/consumer/decorators/on-request-reply.explorer.ts src/consumer/decorators/on-event.explorer.spec.ts src/consumer/decorators/on-request-reply.explorer.spec.ts
   ```

**Acceptance gate for this task:**
- `npm run build` succeeds.
- The two new test cases pass.
- Existing tests in both spec files still pass.
- `npm test` is green (no regressions).
- `npm run lint` reports no new errors in the four touched files.

## 6. Code Review Checklist (for 4.3 reviewer)

- [ ] Guard uses `typeof methodRef !== 'function'` (not `=== 'undefined'` — the broader check also skips non-function getter return values).
- [ ] Guard is placed **after** the `methodRef` assignment and **before** the `reflector.get` call in both explorers.
- [ ] No other lines in `tryRegisterHandler` were altered.
- [ ] No commented-out code introduced.
- [ ] No magic numbers; `_value` parameter prefixed with underscore to satisfy unused-param convention.
- [ ] Test consumer classes use the required decorator options (`version` for `@OnEvent`; `companyId` + `description` + `payloadExample` for both decorators) per the v0.8.0 metadata contract.
- [ ] Test asserts both `not.toThrow()` and the exact `handlerCount`/`getHandler` expectations.

## 7. Documentation Updates (for 4.4 docs step)

This is a bug fix; no public API change. Documentation impact is minimal:

- **CHANGELOG.md**: Add an entry under the current unreleased/fixed section: "Fix `OnEventExplorer` and `OnRequestReplyExplorer` throwing `TypeError` when scanning providers that declare getter/setter accessor properties (now skipped via a `typeof === 'function'` guard)."
- **No README / no `docs/*.md` updates required** — the explorers are internal components and their public behavior is unchanged (accessor properties never carried event metadata).
- **No `.agent/project-structure.md` update** — no new folders/files under `src/`.

## 8. Verification (for 4.5)

The verification agent must confirm:
- `on-event.explorer.ts`: guard present at the exact position specified in §4.1.
- `on-request-reply.explorer.ts`: guard present at the exact position specified in §4.2.
- `on-event.explorer.spec.ts`: `GetterSetterConsumer` class + new test case present and passing.
- `on-request-reply.explorer.spec.ts`: `GetterSetterConsumer` class + new test case present and passing.
- No deviations from this plan; any deviation must be justified.

## 9. Files Changed (summary)

| File | Type | Change |
|------|------|--------|
| `src/consumer/decorators/on-event.explorer.ts` | edit | +1 guard line in `tryRegisterHandler` |
| `src/consumer/decorators/on-request-reply.explorer.ts` | edit | +1 guard line in `tryRegisterHandler` |
| `src/consumer/decorators/on-event.explorer.spec.ts` | edit | +1 test class + 1 test case |
| `src/consumer/decorators/on-request-reply.explorer.spec.ts` | edit | +1 test class + 1 test case |
| `CHANGELOG.md` | edit | +1 fix entry (docs step) |

No new files. No renames. No deletions. No dependency changes.

## 10. Out of Scope

The following items from the TODO file are **explicitly out of scope** for this per-task plan and belong to other task cycles of the same Critical Workflow:
- "Fix JetStream consumer options" (separate task).
- "Add end-to-end integration test" (separate task).
- Git feature branch setup, version bump, TODO completion marking (handled by other Critical Workflow steps).

No git operations, no code-file creation, and no implementation is performed by this planning step. The plan is returned for approval before proceeding to 4.2 Implementation.