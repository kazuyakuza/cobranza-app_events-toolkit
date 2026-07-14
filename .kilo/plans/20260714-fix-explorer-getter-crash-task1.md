# Per-Task Plan — Fix OnEventExplorer getter property crash (v0.10.7)

- **TODO file:** `.agent/todos/20260714/20260714-todo-1.md`
- **Global plan:** `.kilo/plans/20260714-fix-explorer-getter-crash.md`
- **Task:** Fix OnEventExplorer property access (step 4.1 — analysis & planning)
- **Branch:** `fix/explorer-getter-crash`
- **Version:** `0.10.7` (already bumped in `package.json`)
- **Date:** 2026-07-14

---

## 1. Root Cause Confirmation

Version `0.10.6` added a `typeof methodRef !== 'function'` guard in both explorers,
but that guard executes **after** the property access, so it cannot prevent the crash.

### Verified current source state

**`src/consumer/decorators/on-event.explorer.ts`** — `tryRegisterHandler` (line 67):
```typescript
private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
  const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName]; // line 68 — INVOKES getter
  // Accessor properties (getters/setters) appear in getOwnPropertyNames but are not callable; skip them.
  if (typeof methodRef !== 'function') return; // line 70 — too late
  const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
  if (!metadata) return;

  const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind( // line 74 — instance access (safe, but redundant)
    target.instance,
  ) as EventHandler;
  const subject = this.buildWildcardSubject(metadata);
  this.deps.consumerService.registerHandler(subject, handler);
}
```

**`src/consumer/decorators/on-request-reply.explorer.ts`** — `tryRegisterHandler` (line 61):
```typescript
private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
  const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName]; // line 62 — INVOKES getter
  // Accessor properties (getters/setters) appear in getOwnPropertyNames but are not callable; skip them.
  if (typeof methodRef !== 'function') return; // line 64 — too late
  const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
  if (!metadata) return;

  const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind( // line 68 — instance access (safe, but redundant)
    target.instance,
  ) as EventHandler;

  this.deps.requestReplyConsumerService.registerHandler({
    eventType: metadata.eventType,
    handler,
    companyId: metadata.companyId,
  });
}
```

### Why it crashes

`Object.getOwnPropertyNames(prototype)` returns accessor property names too
(e.g. `HttpAdapterHost.prototype.listen$`). Accessing `prototype[methodName]`
**invokes the getter**. `HttpAdapterHost.prototype.listen$` runs
`this._listen$.asObservable()`, but `this._listen$` is `undefined` on the
prototype (only set in the constructor), producing:
```
TypeError: Cannot read properties of undefined (reading 'asObservable')
```
The `typeof` guard cannot catch this because the getter throws during the access.

### Fix rationale

Use `Object.getOwnPropertyDescriptor(target.prototype, methodName)` which returns
the descriptor **without invoking accessors**. For a data property, `descriptor.value`
holds the function. For an accessor (getter/setter), `descriptor.value` is
`undefined` and `descriptor.get`/`descriptor.set` are set instead. Checking
`typeof descriptor.value === 'function'` therefore selects only callable data
properties and never invokes any getter.

---

## 2. Code Changes

### 2.1 `src/consumer/decorators/on-event.explorer.ts`

**Replace `tryRegisterHandler` (lines 67–79) with:**

```typescript
  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
    if (!descriptor) return;
    if (typeof descriptor.value !== 'function') return;
    const methodRef = descriptor.value as (...args: unknown[]) => unknown;
    const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
    if (!metadata) return;

    const handler = methodRef.bind(target.instance) as EventHandler;
    const subject = this.buildWildcardSubject(metadata);
    this.deps.consumerService.registerHandler(subject, handler);
  }
```

Notes:
- Removes the now-stale comment `// Accessor properties (getters/setters) appear in getOwnPropertyNames but are not callable; skip them.` (no-commented-code / self-documenting).
- Two separate single-section `if` returns satisfy the **single-section boolean condition** rule.
- `methodRef.bind(target.instance)` replaces the redundant `target.instance[methodName].bind(...)` re-access.
- Depth = 1 (max ≤ 2 ✓). Params = 2 (max ✓). Method body ≤ 8 lines (max 50 ✓). File stays ≤ 200 lines (84 currently, minor reduction).

### 2.2 `src/consumer/decorators/on-request-reply.explorer.ts`

**Replace `tryRegisterHandler` (lines 61–77) with:**

```typescript
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

Same rule compliance as 2.1. File stays ≤ 200 lines (78 currently).

---

## 3. Unit Test Additions (Throwing Getter)

### Goal

Add a throwing accessor that simulates `HttpAdapterHost.prototype.listen$` to prove
the explorer no longer invokes getters during prototype scanning.

### 3.1 `src/consumer/decorators/on-event.explorer.spec.ts`

**Add a throwing getter to the existing `GetterSetterConsumer` class (after line 78, the `computed` setter):**

```typescript
  get listen$(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'asObservable')");
  }
```

Use a single-line form to control file length:
```typescript
  get listen$(): never { throw new TypeError("Cannot read properties of undefined (reading 'asObservable')"); }
```

**Update the existing test case `should skip getter/setter accessor properties without throwing` (lines 189–197)**
to additionally assert the throwing getter is never invoked:

```typescript
    it('should skip getter/setter accessor properties without throwing', () => {
      const instance = new GetterSetterConsumer();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      expect(() => explorer.onModuleInit()).not.toThrow();
      expect(consumerService.handlerCount).toBe(1);
      expect(consumerService.getHandler('company.*.audit.ledger.snapshot.v1')).toBeDefined();
    });

    it('should not access prototype getter that throws (HttpAdapterHost.listen$ regression)', () => {
      const instance = new GetterSetterConsumer();
      (discovery.getProviders as jest.Mock).mockReturnValue([{ instance }]);
      (discovery.getControllers as jest.Mock).mockReturnValue([]);

      const prototype = Object.getPrototypeOf(instance);
      const listenGetter = Object.getOwnPropertyDescriptor(prototype, 'listen$')?.get;
      expect(listenGetter).toBeDefined();
      expect(() => listenGetter!()).toThrow(TypeError);
      expect(() => explorer.onModuleInit()).not.toThrow();
    });
```

**Line-budget management:** This spec is currently 199 lines. The one-line throwing getter adds +1 line
→ 200. The new test case adds +10 lines → 210, exceeding the 200-line rule.

**Resolution:** Extract the four test-fixture consumer classes (`SampleConsumer`,
`ConsumerWithoutDecorator`, `CustomVersionConsumer`, `GetterSetterConsumer`) into a new file
`src/consumer/decorators/on-event.explorer.fixtures.ts`, and import them into the spec. This keeps the
spec under 200 lines and is consistent with `.agent/project-structure.md` placement under
`consumer/decorators/`. The implementer MUST add the new fixtures file to
`.agent/project-structure.md` (append a `- consumer/decorators/` comment line note or refine, since
the folder entry already exists — just ensure no file-level tracking item is required).

If extraction is undesirable, alternative: keep the throwing getter in `GetterSetterConsumer` only and
rely on the existing `without throwing` test (which already iterates all accessor names). Then no new
test case is needed (+1 line → 200 total). **Primary recommendation:** extraction for proper coverage.
**Minimal recommendation:** one-line getter only, no new test case.

### 3.2 `src/consumer/decorators/on-request-reply.explorer.spec.ts`

**Add the same throwing getter to its `GetterSetterConsumer`** (after line 78):
```typescript
  get listen$(): never { throw new TypeError("Cannot read properties of undefined (reading 'asObservable')"); }
```

**Add an equivalent regression test** mirroring 3.1 (assert the getter throws when invoked directly, but
`onModuleInit()` does not throw). Use `requestReplyConsumerService.handlerCount` instead of
`consumerService.handlerCount`.

**Line-budget management:** This spec is currently **216 lines** — already over the 200-line limit
(pre-existing violation). Adding any lines worsens it. **Resolution:** extract the test-fixture classes
(`SampleConsumer`, `ConsumerWithoutDecorator`, `CompanyScopedConsumer`, `GetterSetterConsumer`) into
`src/consumer/decorators/on-request-reply.explorer.fixtures.ts`. This brings the spec well under 200
and fixes the pre-existing overage. Implementer MUST perform this extraction for this file.

---

## 4. E2E Test Update — Remove Workaround

### File: `src/events-toolkit.runtime.e2e-spec.ts`

**4.1 Remove `limitDiscoveryToHandlerProvider`** (lines 133–145) entirely:
```typescript
function limitDiscoveryToHandlerProvider(moduleRef: TestingModule): void {
  ...
}
```

**4.2 Remove its call** at line 166 inside `beforeEach`:
```typescript
  beforeEach(async () => {
    moduleRef = await compileToolkit();
    limitDiscoveryToHandlerProvider(moduleRef);   // <-- DELETE this line
    await moduleRef.init();
  });
```
After removal:
```typescript
  beforeEach(async () => {
    moduleRef = await compileToolkit();
    await moduleRef.init();
  });
```

**4.3 (Recommended) Add a throwing getter to `HandlerWithAccessorsProvider`** (lines 44–76) to
exercise the throwing-getter path in the full lifecycle without the discovery workaround. Add after the
`cachedValue` accessor:

```typescript
  get listen$(): never { throw new TypeError("Cannot read properties of undefined (reading 'asObservable')"); }
```

Now the explorers iterate **all** providers (including internal NestJS providers like `HttpAdapterHost`
which expose accessor properties). With the `getOwnPropertyDescriptor` fix, accessor properties are
skipped without invocation, so the boot completes safely. Removing the workaround strengthens the
regression guard by exercising real `DiscoveryService` behavior.

**4.4 Update the file header JSDoc** (lines 1–20): the comment references the
"`Reflect.getMetadata(undefined)`" crash. After the fix, the guard is about **not invoking getters**.
Update the description bullet #1 to mention `getOwnPropertyDescriptor` and the
`HttpAdapterHost.prototype.listen$` throwing-getter scenario. Keep the `nats` mock note unchanged.

**4.5 Remove the now-unused import if applicable:** after removing `limitDiscoveryToHandlerProvider`,
check whether `DiscoveryService` import (line 33) is still referenced. If not, remove the import to
satisfy no-unused-imports / lint. (If the throwing getter + provider scanning still references
`DiscoveryService`, keep it; otherwise remove.)

### Acceptance for E2E

- `npm run test:e2e` (or the suite that runs `*.e2e-spec.ts`) must pass.
- The test boots the full module without the discovery workaround and without throwing.

---

## 5. CHANGELOG Update

### File: `CHANGELOG.md`

Current top version entry is `## [0.10.5]` (line 8). `package.json` is `0.10.7`.
The CHANGELOG is missing `[0.10.6]` and `[0.10.7]` entries. The `0.10.5` entry already documents the
`typeof methodRef === 'function'` guard (the incomplete fix).

**Action:** Insert a new `## [0.10.7] — 2026-07-14` section immediately above `## [0.10.5]` (between
lines 7 and 8). Content:

```markdown
## [0.10.7] — 2026-07-14

### Fixed

- **Explorer crash on getter properties that throw during prototype scanning:** The `typeof methodRef === 'function'` guard added in 0.10.5 was incomplete — the expression `target.prototype[methodName]` invokes accessors **before** the guard runs. When `Object.getOwnPropertyNames(prototype)` includes accessor properties such as `HttpAdapterHost.prototype.listen$` (which reads `this._listen$.asObservable()` where `this._listen$` is `undefined` on the prototype), accessing the property throws `TypeError: Cannot read properties of undefined (reading 'asObservable')`. Both `OnEventExplorer` and `OnRequestReplyExplorer` now use `Object.getOwnPropertyDescriptor(target.prototype, methodName)` to inspect properties **without invoking accessors**, and only process entries whose descriptor `value` is a function (data properties only). Accessor properties are skipped entirely, never invoked.
- Removed the `limitDiscoveryToHandlerProvider` workaround from the runtime e2e regression test, so the explorers now scan all providers (including internal NestJS providers with accessor properties) and confirm the fix holds in the real `DiscoveryService` iteration path.

### Changed

- Explorers now bind the handler via the descriptor's `value` (`methodRef.bind(target.instance)`) instead of re-accessing `target.instance[methodName]`, eliminating a redundant property lookup and avoiding any accidental accessor invocation.
```

**Do not** delete or alter the `[0.10.5]` entry. If the team wants a `[0.10.6]` placeholder noting the
incomplete `typeof` guard, that is optional and out of scope; the `[0.10.7]` text frames the 0.10.5/0.10.6
fix as incomplete.

---

## 6. Git Actions (for implementation step 4.2 — not this planning step)

- All edits performed on branch `fix/explorer-getter-crash` (already checked out).
- Commit message: `fix: use Object.getOwnPropertyDescriptor in explorers to avoid getter invocation`
- Verify `.gitignore` compliance (`git status`) before staging — ensure no `dist/`, `node_modules/`, or
  generated artifacts are staged.

---

## 7. Verification Commands

Run each command **individually** (no chaining), in order:

1. `npm run build`
2. `npx jest src/consumer/decorators/on-event.explorer.spec.ts src/consumer/decorators/on-request-reply.explorer.spec.ts`
3. `npm test`
4. `npm run test:e2e`
5. `npm run lint`

### Acceptance Criteria

- [ ] `npm run build` succeeds.
- [ ] Both explorer spec suites pass, including the new throwing-getter regression tests.
- [ ] Full `npm test` is green.
- [ ] `npm run test:e2e` passes **without** the `limitDiscoveryToHandlerProvider` workaround.
- [ ] `npm run lint` reports no new errors.
- [ ] No direct prototype property access (`prototype[methodName]`) remains in either explorer's
      `tryRegisterHandler`.
- [ ] No commented-out code introduced.
- [ ] `src/` files ≤ 200 lines (new fixtures files included).
- [ ] CHANGELOG `[0.10.7]` section added above `[0.10.5]`.

---

## 8. Rule Compliance Checklist

| Rule | Status |
|------|--------|
| Max 200 lines/file (`src/`) | Extract test fixtures for on-request-reply spec (currently 216); on-event spec stays ≤200 via extraction or minimal one-line getter |
| Max 50 lines/method body | `tryRegisterHandler` ≤ 8 lines ✓ |
| Max 2 indentation levels | No nesting beyond method body ✓ |
| Max 2 params/function | `tryRegisterHandler(target, methodName)` = 2 ✓ |
| Single-section boolean conditions | Two separate `if (!descriptor)` / `if (typeof ... !== 'function')` returns ✓ |
| Prefer private members | `tryRegisterHandler` already private ✓ |
| Self-documenting code | `Object.getOwnPropertyDescriptor` is self-explanatory; removed redundant comments ✓ |
| No commented-out code | Removed stale accessor comment from both explorers ✓ |
| Newline prevention | All file content uses real newlines ✓ |

---

## 9. Files Touched Summary

| File | Action |
|------|--------|
| `src/consumer/decorators/on-event.explorer.ts` | Replace `tryRegisterHandler` with descriptor-based guard |
| `src/consumer/decorators/on-request-reply.explorer.ts` | Same replacement |
| `src/consumer/decorators/on-event.explorer.fixtures.ts` | **NEW** (recommended) — extracted test fixture consumers |
| `src/consumer/decorators/on-event.explorer.spec.ts` | Import fixtures; add throwing getter + regression test (or minimal getter only) |
| `src/consumer/decorators/on-request-reply.explorer.fixtures.ts` | **NEW** (required) — extracted test fixture consumers |
| `src/consumer/decorators/on-request-reply.explorer.spec.ts` | Import fixtures; add throwing getter + regression test |
| `src/events-toolkit.runtime.e2e-spec.ts` | Remove `limitDiscoveryToHandlerProvider`; add throwing getter to e2e provider; update JSDoc |
| `CHANGELOG.md` | Add `[0.10.7]` section |
| `.agent/project-structure.md` | No change needed — `consumer/decorators/` entry already covers new fixture files |

---

## 10. Plan vs TODO Reconciliation

TODO sub-tasks → plan coverage:

- ✅ Replace `const methodRef = target.prototype[methodName]` with `Object.getOwnPropertyDescriptor` check → §2.1, §2.2
- ✅ Ensure only data properties with function values are processed → `typeof descriptor.value !== 'function'` guard in §2.1, §2.2
- ✅ Apply same fix to `OnRequestReplyExplorer` → §2.2
- ✅ Update CHANGELOG file → §5

All TODO sub-items addressed. No ambiguity; root cause fully confirmed against source.