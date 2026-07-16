# Task 3 — Add unit tests for `subscribe-options.interface.ts`

**TODO:** `.agent/todos/20260716/20260716-todo-0.md` (Task 3 — Tests)
**Target source:** `src/consumer/subscribe-options.interface.ts`
**Critical Workflow step:** 4.1 Analysis & Planning (this plan feeds step 4.2 Implementation)

## High-Level Approach

Create a new Jest spec file `src/consumer/subscribe-options.interface.spec.ts` that exercises the
public surface of `subscribe-options.interface.ts`:

- `createDefaultConsumerOpts()`
- `resolveConsumerSubscribeOpts(opts?)`
- `isConsumerOptsBuilder(value)` (helper used by `resolveConsumerSubscribeOpts`)

The tests assert that `deliver_subject` is always populated (the bug fixed in Tasks 1 & 2) using two
distinct shapes returned by the module:

1. `ConsumerOptsBuilder` → assert via `builder.getOpts().config.deliver_subject`.
2. `Partial<ConsumerOpts>` (plain object) → assert via `result.config.deliver_subject`.

The suite follows the existing project conventions (see
`src/consumer/stream-auto-creator.spec.ts`, `src/consumer/consumer.service.spec.ts`):

- Plain Jest globals (`describe`, `it`, `expect`, `beforeEach`) — `jest.config.js` sets
  `testEnvironment: 'node'` and `ts-jest` transform; `@jest/globals` is not imported in existing
  specs, so this plan keeps that convention.
- Imports for `consumerOpts`, `createInbox`, `AckPolicy`, `ConsumerOpts`, `ConsumerOptsBuilder` come
  from the `nats` package (already a peerDependency; types resolve via
  `node_modules/nats/lib/jetstream/types.d.ts`).
- No NestJS `Test` module is required — the functions under test are pure helpers.

The tests also add edge-case coverage beyond the strict TODO list (plain object with/without
`deliver_subject`, `ack_policy` defaulting, `isConsumerOptsBuilder` for `null`/`undefined`) to
honor Rules §9 (Test Coverage) and §14 (Consider Edge Cases).

## Pre-Analysis & Technical Decisions

- **Assertion target**: `ConsumerOpts.config` is a `Partial<ConsumerConfig>` containing the
  `deliver_subject?: string` field. `ConsumerOptsBuilder` exposes `getOpts(): ConsumerOpts`.
  Therefore:
  - For builder results → `expect(builder.getOpts().config.deliver_subject).toBeTruthy()`.
  - For plain-object results → `expect(opts.config.deliver_subject).toBeTruthy()`.
- **Uniqueness of inbox**: `createInbox()` returns a string like `_INBOX.<uuid>`. Two consecutive
  calls must differ — assert with `.not.toBe()` to guarantee the default is a *fresh* inbox
  (guards against accidental hardcoded subject regressions).
- **Reference preservation for builders**: `resolveConsumerSubscribeOpts(builder)` must return the
  *same* builder instance (`toBe`), so caller-set `deliverTo` survives untouched.
- **Plain-object spread**: `ensureValidConsumerConfig` returns a *new* object
  (`{ ...opts, config }`) — caller's `config` must not be mutated. Assert by capturing the original
  `config` reference and validating it stays intact.
- **Immutable ack_policy defaulting**: when a plain object omits `ack_policy`, the resolved config
  must equal `AckPolicy.Explicit` (`DEFAULT_ACK_POLICY`). This is already covered by Task 2; the
  test guards it against regression.
- **Rules compliance for the spec file**:
  - `max-lines-per-file` (≤200 lines, ~125 logical): the planned file is ~150 lines, within budget.
  - `max-lines-per-method` (≤50): each `it(...)` body stays < 15 lines; helper functions kept
    short.
  - `max-depth` (≤2): no deeply nested callbacks; assertion helpers flatten the read path.
  - `max-arguments-per-method` (≤2): helpers take ≤2 params.
  - `self-documenting-code`: descriptive test names; no inline comments needed.
  - `single-section-boolean-conditions`: no complex conditions in the tests.

## File to Create

### `src/consumer/subscribe-options.interface.spec.ts`

```typescript
import { AckPolicy, ConsumerOpts, ConsumerOptsBuilder, consumerOpts, createInbox } from 'nats';
import {
  ConsumerSubscribeOpts,
  createDefaultConsumerOpts,
  isConsumerOptsBuilder,
  resolveConsumerSubscribeOpts,
} from './subscribe-options.interface';

/** Reads the resolved `deliver_subject` from either a builder or a plain ConsumerOpts. */
function deliverSubjectOf(value: ConsumerSubscribeOpts): string | undefined {
  if (isConsumerOptsBuilder(value)) {
    return value.getOpts().config.deliver_subject;
  }
  return (value as Partial<ConsumerOpts>).config?.deliver_subject;
}

/** Builds a plain ConsumerOpts-shaped object missing both deliver_subject and ack_policy. */
function plainOptsWithoutDefaults(): Partial<ConsumerOpts> {
  return { mack: false, stream: 'test-stream', config: {} };
}

describe('createDefaultConsumerOpts', () => {
  it('returns a ConsumerOptsBuilder detectable by isConsumerOptsBuilder', () => {
    expect(isConsumerOptsBuilder(createDefaultConsumerOpts())).toBe(true);
  });

  it('sets a unique non-empty deliver_subject on the builder config', () => {
    const builder = createDefaultConsumerOpts();

    expect(builder.getOpts().config.deliver_subject).toBeTruthy();
    expect(builder.getOpts().config.deliver_subject).not.toBe(createInbox());
  });

  it('enables manual ack and explicit ack policy (defaults for push consumers)', () => {
    const opts = createDefaultConsumerOpts().getOpts();

    expect(opts.mack).toBe(true);
    expect(opts.config.ack_policy).toBe(AckPolicy.Explicit);
  });
});

describe('resolveConsumerSubscribeOpts', () => {
  describe('when opts is undefined', () => {
    it('returns a builder whose deliver_subject is set', () => {
      const resolved = resolveConsumerSubscribeOpts(undefined);

      expect(deliverSubjectOf(resolved)).toBeTruthy();
    });
  });

  describe('when opts is a ConsumerOptsBuilder', () => {
    it('returns the same builder instance preserving caller-set deliverTo', () => {
      const callerSubject = createInbox();
      const builder = consumerOpts().deliverTo(callerSubject);

      const resolved = resolveConsumerSubscribeOpts(builder);

      expect(resolved).toBe(builder);
      expect(deliverSubjectOf(resolved)).toBe(callerSubject);
    });
  });

  describe('when opts is a plain object with deliver_subject', () => {
    it('preserves the caller-supplied deliver_subject without mutating the input config', () => {
      const originalConfig = { deliver_subject: 'kept.inbox', ack_policy: AckPolicy.All };
      const opts: Partial<ConsumerOpts> = { config: originalConfig };

      const resolved = resolveConsumerSubscribeOpts(opts) as Partial<ConsumerOpts>;

      expect(resolved.config.deliver_subject).toBe('kept.inbox');
      expect(resolved.config.ack_policy).toBe(AckPolicy.All);
      expect(opts.config).toBe(originalConfig);
    });
  });

  describe('when opts is a plain object without deliver_subject', () => {
    it('defaults deliver_subject to a unique non-empty inbox', () => {
      const resolved = resolveConsumerSubscribeOpts(plainOptsWithoutDefaults()) as Partial<ConsumerOpts>;

      expect(resolved.config.deliver_subject).toBeTruthy();
      expect(resolved.config.deliver_subject).not.toBe(createInbox());
    });

    it('defaults ack_policy to AckPolicy.Explicit when omitted', () => {
      const resolved = resolveConsumerSubscribeOpts(plainOptsWithoutDefaults()) as Partial<ConsumerOpts>;

      expect(resolved.config.ack_policy).toBe(AckPolicy.Explicit);
    });
  });
});

describe('isConsumerOptsBuilder', () => {
  it('returns true for consumerOpts() and createDefaultConsumerOpts()', () => {
    expect(isConsumerOptsBuilder(consumerOpts())).toBe(true);
    expect(isConsumerOptsBuilder(createDefaultConsumerOpts())).toBe(true);
  });

  it('returns false for plain ConsumerOpts objects, undefined, and null', () => {
    const plain: Partial<ConsumerOpts> = { config: {} };
    expect(isConsumerOptsBuilder(plain)).toBe(false);
    expect(isConsumerOptsBuilder(undefined)).toBe(false);
    // @ts-expect-error — guard against null being passed at runtime by external callers
    expect(isConsumerOptsBuilder(null)).toBe(false);
  });
});
```

## Implementation Steps (for step 4.2)

1. **Create the spec file** at exactly `src/consumer/subscribe-options.interface.spec.ts`
   (matches the `.*\.spec\.ts$` testRegex in `jest.config.js`, `rootDir: 'src'`).

   Use the `write` tool (it is a brand-new file). Use real newline characters in the content
   (per `newline-prevention` rule). Do NOT use literal `\n` escape sequences.

2. **No other files should be modified.** Tasks 1 & 2 already updated
   `subscribe-options.interface.ts`; this sub-task is test-only.

3. **Run the build** (required by `pretest` hook before `jest`):

   ```bash
   npm run build
   ```

4. **Run the new spec in isolation** to confirm it passes:

   ```bash
   npx jest src/consumer/subscribe-options.interface.spec.ts --runInBand
   ```

   Expected: all `it` blocks green; 0 failures.

5. **Run the full Jest suite** to ensure no regressions:

   ```bash
   npm test
   ```

   Expected: existing specs remain green; new spec contributes ~12 passing tests.

6. **Run lint and typecheck**:

   ```bash
   npm run lint
   npm run typecheck
   ```

   Expected: no errors, no warnings introduced by the new spec. The `@ts-expect-error`
   directive on the `null` assertion must resolve (if `npm run typecheck` flags the directive as
   unused, drop the directive and instead cast: `expect(isConsumerOptsBuilder(null as unknown as ConsumerOptsBuilder)).toBe(false);`).

7. **Stop here.** Do NOT proceed to step 4.3 (Code Review), 4.4 (Documentation), etc.
   Committing is handled by the overarching Critical Workflow between steps — do not run git
   commands in this sub-task unless explicitly instructed.

## Verification Criteria (acceptance for this plan)

- [ ] File `src/consumer/subscribe-options.interface.spec.ts` exists and is ≤ 200 lines.
- [ ] Test suite covers all five behaviors enumerated in the task prompt:
  1. `createDefaultConsumerOpts()` returns a builder with `deliver_subject` set. ✅
  2. `resolveConsumerSubscribeOpts(undefined)` includes `deliver_subject`. ✅
  3. `resolveConsumerSubscribeOpts(existingOpts)` preserves existing `deliver_subject`. ✅
  4. `resolveConsumerSubscribeOpts(plainObjectWithDeliverSubject)` preserves it. ✅
  5. `resolveConsumerSubscribeOpts(plainObjectWithoutDeliverSubject)` adds default. ✅
- [ ] `npm test` (which runs `pretest` → `build` → `jest`) passes.
- [ ] `npm run lint` and `npm run typecheck` pass with no new issues.
- [ ] No source files other than the new spec were modified.

## Out of Scope

- Step 4.2 Implementation execution (writing the file and running commands) is performed by an
  `implementer` sub-agent in the next `task` invocation.
- Changelog / documentation updates belong to Task 4 (Documentation), not here.
- Git commits / branch actions are managed by the Plan Agent in the Critical Workflow shell.