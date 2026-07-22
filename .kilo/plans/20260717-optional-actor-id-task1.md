# Plan — Task 1: Make `actor_id` Optional for SYSTEM/SCHEDULER/EXTERNAL_API

**Source TODO:** `.agent/todos/20260716/20260716-todo-2.md` (Task 1)
**Parent global plan:** `.kilo/plans/20260717-relax-envelope-and-global-events.md`
**Branch:** `feat/relax-envelope-validation-and-global-events`
**Step:** 4.1 Analysis & Planning (Architector)
**Date:** 2026-07-17

---

## 1. Scope (Task 1 only)

Make the `EventEnvelope.actor_id` field optional when `actor_type` is an automated
(non-human) actor (`system`, `scheduler`, `external_api`) while keeping it required
(`@IsString() @IsNotEmpty()`) for human actors (`client`, `company_user`).

Deliverables:
1. New custom `class-validator` decorator `@IsOptionalForSystemActors()` (exported).
2. `EventEnvelope.actor_id` becomes optional both at runtime (validation) and at the type level (`actor_id?: string`).
3. `EventContext.actorId` becomes optional (`actorId?: string`).
4. New + updated tests covering the conditional optionality.
5. Public API export via barrel.

**NOT in scope (Task 2 / Task 3):** `GlobalEventEnvelope`, `company_id` removal, global
subject routing, docs/new guide, CHANGELOG. This plan must not touch those.

---

## 2. Design Decisions & Rationale

### 2.1 Custom decorator vs. `@ValidateIf`

The TODO explicitly recommends the custom decorator approach (`@IsOptionalForSystemActors`),
exported so library consumers reuse it on their own DTOs. Decision: implement a single
custom decorator via `class-validator`'s `registerDecorator` that **fully encapsulates** the
conditional `@IsString() @IsNotEmpty()` behavior:

- For `actor_type` in `{ system, scheduler, external_api }` and `actor_id` absent
  (`null`/`undefined`): **valid**.
- Otherwise (the value is present OR the actor is human): `actor_id` **must** be a
  non-empty string.

Rationale:
- Single decorator encodes the whole rule → `EventEnvelope` stays declarative.
- Exported → reusable on downstream DTOs mirroring the envelope contract.
- Self-contained validator keeps `class-validator`'s decorator stack on `actor_id` to one
  decorator (no `@ValidateIf` + `@IsString` + `@IsNotEmpty` chain to maintain in the class).

**Caveat (acceptance-managed):** `class-validator-jsonschema` (peer dep, used by
`src/discovery/utils/schema-generator.ts`) does not know the custom constraint name.
Consequence: the auto-generated JSON Schema will no longer mark `actor_id` as a universally
required string for `EventEnvelope`-derived DTOs. Verified that no existing discovery test
asserts `actor_id` requirements on a generated schema (grep: only `discovery-event-publisher`
sets `actor_id: PLATFORM_ACTOR_ID`; `schema-types.interface` declares the generic
`required?: string[]` field). No regression in the current suite. Documented for Task 3 docs.

### 2.2 Type-level optionality

`EventEnvelope.actor_id!: string` → `actor_id?: string` and `EventContext.actorId: string`
→ `actorId?: string`. This is **additive** (optional fields) — backward compatible at the
type level: existing code that always supplies `actorId` continues to compile.

### 2.3 Call-site handling — no logic changes required

The factories/builders simply assign `actor_id: context.actorId` (which may now be
`undefined`). `EventEnvelope({ actor_id: undefined })` sets the property to `undefined`;
the custom validator accepts that for automated actors. For human actors that omit `actorId`,
validation **intentionally fails** at publish/consume time with a clear message — this is
the desired enforcement, not a bug. Therefore the field-assignment call sites need **no
behavioral change**, only the type flows through. `envelopeToContext` reads
`envelope.actor_id` and returns the now-optional `actorId?` — straight pass-through.

### 2.4 Rules compliance check

- File ≤ 200 lines, methods ≤ 50 lines, ≤ 2 params, max depth 2, private-by-default,
  self-documenting, no commented code, single-section boolean conditions.
- The validator `validate(value, args)` has 2 params (class-validator interface fixed).
- Conditionals extracted into named helpers (`isAbsent`, `isNonEmptyString`,
  `isAutomatedActor`) so no compound boolean conditions (`max-depth`,
  `single-section-boolean-conditions`).
- The decorator factory `IsOptionalForSystemActors(options?)` has 1 param.

---

## 3. Call-Site Inventory (verified via grep on `actor_id|actorId` + `EventContext`)

### 3.1 Construction / assignment of `actor_id` / `actorId` (from `EventContext`)
| # | File | Line | Action |
|---|------|------|--------|
| A | `src/common/envelope/event-envelope.class.ts` | 72-77 | **MODIFY** — replace validators + optional type |
| B | `src/common/envelope/event-context.interface.ts` | 46 | **MODIFY** — `actorId?: string` |
| C | `src/common/utils/event.factory.ts` | 46 | No code change (flows optional) — type-only |
| D | `src/producer/producer.service.ts` `buildEnvelope` | 78 | No code change — type-only |
| E | `src/request-reply/request-reply.helpers.ts` `buildEnvelope` | 18 | No code change — type-only |
| F | `src/testing/mock-producer.service.ts` `buildEnvelope` | 72 | No code change — type-only |
| G | `src/testing/mock-request-reply.service.ts` `buildResponseEnvelope` | 100 | No code change — type-only |
| H | `src/outbox/outbox.utils.ts` `createDlqEnvelope` | 54 | No code change — copies `actor_id` (now optional) |
| I | `src/discovery/events/discovery-event-publisher.service.ts` `buildEnvelope` | 118 | No change — uses `ActorType.SYSTEM` + `PLATFORM_ACTOR_ID` (still valid) |
| J | `src/consumer/subscribe-options.interface.ts` `envelopeToContext` | 74 | No code change — pass-through |

### 3.2 Validation paths (runtime enforcement points that automatically honor the rule)
| File | Line | Note |
|------|------|------|
| `src/consumer/jetstream-consumer.service.ts` `validateEnvelope` | 113-120 | `validateSync(envelope)` — benefits automatically |
| `src/consumer/request-reply-message-processor.ts` `validateEnvelope` | 80-87 | benefits automatically |

### 3.3 Test files referencing `actor_id` / `actorId` (no behavioral fix needed unless stated)
- `src/common/envelope/event-envelope.fixture.ts` — uses `ActorType.SYSTEM` + `actor_id: 'user-123'` (valid, keep).
- `src/common/envelope/event-envelope.metadata.spec.ts` — actor_id describe (lines 46-61): keep existing 2 tests; **do not extend** (would exceed 200 lines; new cases go to a new file).
- `src/common/envelope/event-envelope.validation.spec.ts` — no actor_id tests; unchanged.
- `src/common/envelope/event-envelope.spec.ts` — unchanged.
- `src/common/utils/event.factory.spec.ts` — add ONE new test.
- `src/producer/producer.service.spec.ts` — **already 224 lines (over 200, pre-existing)**; do NOT grow it. Producer behavior is identical to `createEvent` mapping (covered); skip producer actor_id tests in Task 1.
- All other `.spec.ts` fixtures pass `actorId: '...'` with `ActorType.CLIENT` / `COMPANY_USER` — still valid, unchanged.

---

## 4. Atomic Implementation Steps

> Order matters. Commit between logical groups with meaningful messages. Tool priority:
> `vscode-mcp-server_*` / `Bifrost_*` for edits; `bash` only for git/build/test/lint.

### Step 4.1 — Create the custom validator file (NEW)

**File (NEW):** `src/common/envelope/validators/is-optional-for-system-actors.validator.ts`

**Full content:**

```ts
import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { ActorType } from '../actor-type.enum';

/** Automated (non-human) actor types that have no database actor row. */
const AUTOMATED_ACTOR_TYPES: ReadonlyArray<ActorType> = [
  ActorType.SYSTEM,
  ActorType.SCHEDULER,
  ActorType.EXTERNAL_API,
];

/** Returns true when the value is null or undefined (i.e. not supplied). */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

/** Returns true when the value is a non-empty string. */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

/** Returns true when the validated object's actor_type is an automated actor. */
function isAutomatedActor(target: { actor_type?: ActorType }): boolean {
  return AUTOMATED_ACTOR_TYPES.includes(target.actor_type as ActorType);
}

/**
 * Constraint implementing the `actor_id` optionality rule:
 * optional for {@link ActorType.SYSTEM}, {@link ActorType.SCHEDULER},
 * and {@link ActorType.EXTERNAL_API}; required (non-empty string) for
 * human actors ({@link ActorType.CLIENT}, {@link ActorType.COMPANY_USER}).
 * When supplied for any actor type, `actor_id` must be a non-empty string.
 */
@ValidatorConstraint({ name: 'isOptionalForSystemActors', async: false })
class IsOptionalForSystemActorsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const target = args.object as { actor_type?: ActorType };
    if (isAutomatedActor(target) && isAbsent(value)) {
      return true;
    }
    return isNonEmptyString(value);
  }

  defaultMessage(): string {
    return 'actor_id must be a non-empty string for human actors (client, company_user)';
  }
}

/**
 * Decorator factory that registers {@link IsOptionalForSystemActorsConstraint}
 * on `actor_id`, replacing `@IsString() @IsNotEmpty()` for that property.
 *
 * Exported via the public API so downstream DTOs mirroring the envelope
 * contract can apply the same conditional optionality.
 *
 * @example
 * ```ts
 * class MyEnvelope {
 *   @IsEnum(ActorType)
 *   actor_type!: ActorType;
 *
 *   @IsOptionalForSystemActors()
 *   actor_id?: string;
 * }
 * ```
 *
 * @param options - Optional class-validator {@link ValidationOptions} (message/groups).
 */
export function IsOptionalForSystemActors(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isOptionalForSystemActors',
      target: target.constructor,
      propertyName: String(propertyKey),
      constraints: [],
      options,
      validator: IsOptionalForSystemActorsConstraint,
    });
  };
}
```

**Line count:** ~78 lines (under 200). Methods ≤ 50 lines. Max depth 1. Params ≤ 2. ✓

### Step 4.2 — Export the validator from the validators barrel (NEW)

**File (NEW):** `src/common/envelope/validators/index.ts`

```ts
/**
 * @packageDocumentation
 * Custom class-validator decorators for the event envelope contract.
 */

export { IsOptionalForSystemActors } from './is-optional-for-system-actors.validator';
```

### Step 4.3 — Re-export validators from the envelope barrel (MODIFY)

**File:** `src/common/envelope/index.ts`

Append a new export line after the existing exports:

```ts
export { EventEnvelope } from './event-envelope.class';
export { EventBase } from './event-base.class';
export { ActorType } from './actor-type.enum';
export { EventContext } from './event-context.interface';
export { IsOptionalForSystemActors } from './validators';
```

(Keeps `src/index.ts` → `export * from './common'` → `export * from './envelope'` → new
symbol flows to the public API automatically. No change to `src/index.ts`.)

### Step 4.4 — Modify `EventEnvelope.actor_id` (MODIFY)

**File:** `src/common/envelope/event-envelope.class.ts`

**4.4.1** Add import (new line after the `import { ActorType } from './actor-type.enum';` line):

```ts
import { IsOptionalForSystemActors } from './validators/is-optional-for-system-actors.validator';
```

(Use the direct path rather than the barrel to keep the envelope class self-contained and
avoid any indirect import order concerns.)

**4.4.2** Replace lines 66-77 (the `actor_id` JSDoc + decorators + field):

Current:
```ts
  /**
   * Unique identifier of the actor (user_id, client_id, etc.)
   */
  @IsString()
  @IsNotEmpty()
  actor_id!: string;
```

New:
```ts
  /**
   * Unique identifier of the actor (user_id, client_id, etc.).
   * Required for human actors (`client`, `company_user`); optional for
   * automated actors (`system`, `scheduler`, `external_api`).
   */
  @IsOptionalForSystemActors()
  actor_id?: string;
```

Note: `IsString` and `IsNotEmpty` remain in the `class-validator` import (still used by
`id`, `type`, `version`, `produced_at`, `producer`). Do NOT remove them from that import.

**Resulting file size:** ~130 lines (under 200). ✓

### Step 4.5 — Modify `EventContext.actorId` (MODIFY)

**File:** `src/common/envelope/event-context.interface.ts`

Replace lines 42-46:

Current:
```ts
  /**
   * Unique identifier of the actor (user_id, client_id, etc.)
   */
  actorId: string;
```

New:
```ts
  /**
   * Unique identifier of the actor (user_id, client_id, etc.).
   * Required for human actors (`client`, `company_user`); optional for
   * automated actors (`system`, `scheduler`, `external_api`).
   */
  actorId?: string;
```

**Resulting file size:** ~71 lines (under 200). ✓

> No changes to the field-assignment call sites (C–J in §3.1): assigning
> `actor_id: context.actorId` with `actorId` now possibly `undefined` is correct and
> intended. `envelopeToContext` pass-through is correct.

### Step 4.6 — Update `event.factory.spec.ts` (MODIFY)

**File:** `src/common/utils/event.factory.spec.ts` (currently 118 lines)

In the `describe('createEvent')` block, add ONE test near the existing "leaves
causation_id undefined when causationId is not provided" test (around line 89). Insert:

```ts
    it('leaves actor_id undefined when actorId is not provided', () => {
      const context = buildContext();
      delete context.actorId;
      const event = createEvent({}, context);
      expect(event.actor_id).toBeUndefined();
    });
```

(`buildContext` already merges `...overrides`; deleting `actorId` after construction is
the approach already used by the causation_id test — consistent style.)

**Resulting file size:** ~125 lines (under 200). ✓

### Step 4.7 — Create dedicated `actor_id` conditional-optionality spec (NEW)

**File (NEW):** `src/common/envelope/event-envelope.actor-id-optional.spec.ts`

(Separate file keeps `event-envelope.metadata.spec.ts` (165 lines) under the 200-line limit
and concentrates the new conditional behavior.)

**Full content:**

```ts
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';
import { createValidProperties } from './event-envelope.fixture';

/** Base valid properties with `actor_id` removed; callers set `actor_type`. */
function propertiesWithoutActorId(actorType: ActorType): Record<string, unknown> {
  const { actor_id: _omit, ...rest } = createValidProperties();
  return { ...rest, actor_type: actorType };
}

describe('EventEnvelope — actor_id conditional optionality', () => {
  describe('automated actors (actor_id optional)', () => {
    it.each([ActorType.SYSTEM, ActorType.SCHEDULER, ActorType.EXTERNAL_API])(
      'accepts undefined actor_id for ActorType.%s',
      (actorType) => {
        const envelope = plainToInstance(EventEnvelope, propertiesWithoutActorId(actorType));
        expect(validateSync(envelope).filter((e) => e.property === 'actor_id')).toHaveLength(0);
      },
    );

    it('accepts a present non-empty actor_id for an automated actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.SYSTEM,
        actor_id: 'system-bot',
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id')).toHaveLength(0);
    });

    it('rejects an empty string actor_id even for an automated actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.SYSTEM,
        actor_id: '',
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id').length).toBeGreaterThan(0);
    });

    it('rejects a non-string actor_id for an automated actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.SYSTEM,
        actor_id: 123,
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id').length).toBeGreaterThan(0);
    });
  });

  describe('human actors (actor_id required)', () => {
    it.each([ActorType.CLIENT, ActorType.COMPANY_USER])(
      'rejects undefined actor_id for ActorType.%s',
      (actorType) => {
        const envelope = plainToInstance(EventEnvelope, propertiesWithoutActorId(actorType));
        expect(validateSync(envelope).filter((e) => e.property === 'actor_id').length).toBeGreaterThan(0);
      },
    );

    it('accepts a present non-empty actor_id for a human actor', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.CLIENT,
        actor_id: 'user-123',
      });
      expect(validateSync(envelope).filter((e) => e.property === 'actor_id')).toHaveLength(0);
    });
  });
});
```

Note on `_omit` lint: an unused destructured var prefixed with `_` is conventional; if the
project's ESLint config flags it, replace with:
```ts
const rest = { ...createValidProperties() };
delete (rest as Record<string, unknown>).actor_id;
return { ...rest, actor_type: actorType };
```
Implementer must conform to whichever pattern passes `npm run lint`.

**Resulting file size:** ~70 lines (under 200). ✓

### Step 4.8 — Create dedicated validator unit spec (NEW)

**File (NEW):** `src/common/envelope/validators/is-optional-for-system-actors.validator.spec.ts`

```ts
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { ActorType } from '../actor-type.enum';
import { IsOptionalForSystemActors } from './is-optional-for-system-actors.validator';

/** Minimal DTO exercising the decorator on `actor_id` alongside `actor_type`. */
class ActorIdDto {
  @IsEnum(ActorType)
  actor_type!: ActorType;

  @IsOptional()
  @IsOptionalForSystemActors()
  actor_id?: string;
}

function dto(actorType: ActorType, actorId?: string): ActorIdDto {
  return plainToInstance(ActorIdDto, { actor_type: actorType, actor_id: actorId });
}

function actorIdErrors(actorType: ActorType, actorId?: string): number {
  return validateSync(dto(actorType, actorId)).filter((e) => e.property === 'actor_id').length;
}

describe('IsOptionalForSystemActors', () => {
  it('accepts undefined actor_id for automated actors', () => {
    expect(actorIdErrors(ActorType.SYSTEM)).toBe(0);
    expect(actorIdErrors(ActorType.SCHEDULER)).toBe(0);
    expect(actorIdErrors(ActorType.EXTERNAL_API)).toBe(0);
  });

  it('rejects undefined actor_id for human actors', () => {
    expect(actorIdErrors(ActorType.CLIENT)).toBeGreaterThan(0);
    expect(actorIdErrors(ActorType.COMPANY_USER)).toBeGreaterThan(0);
  });

  it('accepts a non-empty string actor_id for any actor type', () => {
    expect(actorIdErrors(ActorType.SYSTEM, 'system-bot')).toBe(0);
    expect(actorIdErrors(ActorType.CLIENT, 'user-1')).toBe(0);
  });

  it('rejects an empty string actor_id regardless of actor type', () => {
    expect(actorIdErrors(ActorType.SYSTEM, '')).toBeGreaterThan(0);
    expect(actorIdErrors(ActorType.CLIENT, '')).toBeGreaterThan(0);
  });

  it('rejects a non-string actor_id', () => {
    expect(actorIdErrors(ActorType.SYSTEM, 123 as unknown as string)).toBeGreaterThan(0);
  });
});
```

(`@IsOptional()` is stacked with `@IsOptionalForSystemActors()` so `class-validator` skips
the property when `undefined` and lets the custom validator contribute the human-actor
requirement semantics. On `EventEnvelope` itself we use only `@IsOptionalForSystemActors()`
because the custom constraint already handles the `undefined`-for-automated case; `@IsOptional()`
is harmless and consistent here on the standalone test DTO.)

**Resulting file size:** ~52 lines (under 200). ✓

### Step 4.9 — Verify leave existing metadata spec untouched

**File:** `src/common/envelope/event-envelope.metadata.spec.ts`

- Keep the existing `actor_id field validation` describe block (lines 46-61) unchanged:
  - "accepts valid actor_id string" (fixture uses `ActorType.SYSTEM` + `actor_id: 'user-123'`
    → still valid).
  - "rejects empty string actor_id" (SYSTEM + `actor_id: ''` → still rejected by the custom
    validator). Still correct.
- All new conditional-optionality cases live in the new spec from Step 4.7. No edits.

---

## 5. Git/Lint/Test Commands (executed by the implementer in 4.2)

Run each as a single command (no chaining):

1. `git status` (verify branch is `feat/relax-envelope-validation-and-global-events`; verify
   no `.gitignore`-matching files staged).
2. (After edits) `npm run typecheck`
3. `npm run lint`
4. `npx jest src/common/envelope src/common/utils/event.factory.spec.ts` (fast targeted run)
5. `npm test` (full suite — runs `pretest` build hook → `npm run build`; covers all consumers
   to confirm no spec regressed by the optional `actorId` type change)
6. `npm run build` (explicit build to generate `.d.ts` and verify the public export compiles)
7. Commit (suggested message):
   `feat(envelope): make actor_id optional for system/scheduler/external_api actors`
   Scope each commit to a logical unit (validator file + barrel; envelope+context change;
   tests) or a single commit — implementer may choose, but commit before signaling completion.

---

## 6. Acceptance (Verification) Checklist

- [ ] `src/common/envelope/validators/is-optional-for-system-actors.validator.ts` exists and
      exports `IsOptionalForSystemActors`.
- [ ] `src/common/envelope/validators/index.ts` re-exports the decorator.
- [ ] `src/common/envelope/index.ts` re-exports `IsOptionalForSystemActors`.
- [ ] `EventEnvelope.actor_id` is `@IsOptionalForSystemActors()` and `actor_id?: string`.
- [ ] `EventContext.actorId` is `actorId?: string`.
- [ ] `event-envelope.actor-id-optional.spec.ts` passes (all conditional cases).
- [ ] `is-optional-for-system-actors.validator.spec.ts` passes.
- [ ] `event.factory.spec.ts` new "leaves actor_id undefined" test passes.
- [ ] `event-envelope.metadata.spec.ts` unchanged and still passing.
- [ ] `npm run typecheck` passes (no breakage downstream from optional `actorId`).
- [ ] `npm run lint` passes (incl. any `_omit`-style fix the implementer applies).
- [ ] `npm test` full suite passes (no regression in producer/consumer/outbox/
      request-reply/discovery/testing specs).
- [ ] `npm run build` succeeds and `dist/` regenerates `.d.ts`.
- [ ] No file in `src/` exceeded 200 lines as a result of these changes (verified:
      validator file ~78, both new specs < ~70, `event.factory.spec.ts` ~125,
      `event-envelope.class.ts` ~131, `event-context.interface.ts` ~71,
      `event-envelope.metadata.spec.ts` unchanged at 165).
- [ ] No commented-out code added; no magic numbers (only string literals used as fixture
      data, which is acceptable for specs).

---

## 7. Out-of-Scope / Handled Elsewhere (do NOT do in Task 1)

- `GlobalEventEnvelope`, base envelope hierarchy, dual-type service acceptance → Task 2.
- `docs/global-events.md`, `docs/ai-agent-guidelines.md` validation checklist update,
  `CHANGELOG.md` → Task 3 (4.4 documentation step). This plan's 4.2 scope is **code + tests
  only**.
- `producer.service.spec.ts`, `outbox.*.spec.ts`, consumer specs: do NOT edit for actor_id
  behavior in Task 1 (the type-only change compiles; existing fixtures keep passing). Only
  edit a spec if a test starts genuinely failing due to the intentional behavior change, in
  which case the implementer reports it back rather than silently mutating.
- `.agent/project-structure.md`: the `common/envelope/validators/` folder is already listed;
  no structure change required.

---

## 8. Risk & Impact Notes

| Risk | Impact | Mitigation |
|------|--------|------------|
| `class-validator-jsonschema` schema regression for `actor_id` | No suite regression (verified); schema no longer marks `actor_id` required for envelope-derived DTOs | Accept for Task 1; documented for Task 3 docs step |
| Consumer handlers that assumed `context.actorId: string` | Runtime `undefined` for automated events | Intended behavior change per TODO; consumers should guard. Documented in Task 3. |
| Pre-existing 224-line `producer.service.spec.ts` | Over the 200-line rule already | Not introduced by Task 1; do NOT grow it further. Skip producer actor_id tests. |
| Lint on unused `_omit` destructuring var | Possible `@typescript-eslint/no-unused-vars` error | Fallback `delete` pattern specified in Step 4.7 note. Implementer applies whichever passes. |

---

## 9. Plan-vs-Task Sanity Check

TODO Task 1 requirements vs. plan coverage:
- "Modify `EventEnvelope` class" → Step 4.4 ✓
- "Add conditional validation for `actor_id`" → Steps 4.1 + 4.4 ✓
- "Update TypeScript interface/declaration" → Steps 4.4 (envelope class) + 4.5
  (`EventContext` interface) ✓
- "Add tests for the new validation behavior" → Steps 4.6, 4.7, 4.8 ✓
- "export it so anyone that imports the lib can use it" (custom decorator export) →
  Steps 4.1 (export), 4.2 (validators barrel), 4.3 (envelope barrel → public API) ✓

No Task 2 / Task 3 items are included. Plan matches the assigned task scope.