# Task 1 Code Simplification Plan — Optional `actor_id` for System Actors

**Source TODO:** `.agent/todos/20260716/20260716-todo-2.md` (Task 1)
**Implementation plan:** `.kilo/plans/20260717-optional-actor-id-task1.md`
**Branch:** `feat/relax-envelope-validation-and-global-events`
**Date:** 2026-07-17

## Scope

Review and simplify only the files created or modified for Task 1:

1. `src/common/envelope/validators/is-optional-for-system-actors.validator.ts`
2. `src/common/envelope/validators/index.ts`
3. `src/common/envelope/validators/is-optional-for-system-actors.validator.spec.ts`
4. `src/common/envelope/event-envelope.actor-id-optional.spec.ts`
5. `src/common/envelope/event-envelope.class.ts`
6. `src/common/envelope/event-context.interface.ts`
7. `src/common/envelope/index.ts`
8. `src/common/utils/event.factory.spec.ts`

Simplifications must preserve exact observable behavior and keep all tests passing.

## Simplifications Found

### 1. `src/common/envelope/event-envelope.actor-id-optional.spec.ts` — Extract envelope builder and error-count helpers

**Current issues:**
- `propertiesWithoutActorId` manually deletes `actor_id` with a type cast.
- `plainToInstance(...createValidProperties()...)` and `validateSync(...).filter(...)` are repeated in every test.
- Mixed assertion style (`toHaveLength(0)` vs `toBeGreaterThan(0)`).

**Lines to change:** 7–65

**Proposed simplified code (full file replacement):**

```ts
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';
import { createValidProperties } from './event-envelope.fixture';

function buildEnvelope(actorType: ActorType, actorId?: unknown): EventEnvelope {
  return plainToInstance(EventEnvelope, {
    ...createValidProperties(),
    actor_type: actorType,
    actor_id: actorId,
  });
}

function actorIdErrorCount(envelope: EventEnvelope): number {
  return validateSync(envelope).filter((e) => e.property === 'actor_id').length;
}

describe('EventEnvelope — actor_id conditional optionality', () => {
  describe('automated actors (actor_id optional)', () => {
    it.each([ActorType.SYSTEM, ActorType.SCHEDULER, ActorType.EXTERNAL_API])(
      'accepts undefined actor_id for ActorType.%s',
      (actorType) => {
        expect(actorIdErrorCount(buildEnvelope(actorType))).toBe(0);
      },
    );

    it('accepts a present non-empty actor_id for an automated actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.SYSTEM, 'system-bot'))).toBe(0);
    });

    it('rejects an empty string actor_id even for an automated actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.SYSTEM, ''))).toBeGreaterThan(0);
    });

    it('rejects a non-string actor_id for an automated actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.SYSTEM, 123))).toBeGreaterThan(0);
    });
  });

  describe('human actors (actor_id required)', () => {
    it.each([ActorType.CLIENT, ActorType.COMPANY_USER])('rejects undefined actor_id for ActorType.%s', (actorType) => {
      expect(actorIdErrorCount(buildEnvelope(actorType))).toBeGreaterThan(0);
    });

    it('accepts a present non-empty actor_id for a human actor', () => {
      expect(actorIdErrorCount(buildEnvelope(ActorType.CLIENT, 'user-123'))).toBe(0);
    });
  });
});
```

**Behavior impact:** None. Omitted `actor_id` is still `undefined`, and the same validation expectations are asserted.

---

### 2. `src/common/envelope/validators/is-optional-for-system-actors.validator.spec.ts` — Remove double cast and clarify helper names

**Current issues:**
- `actorId?: string` forces `123 as unknown as string` for the non-string case.
- `class-validator` imports are split across two statements.
- Helper names `dto` and `actorIdErrors` are somewhat generic.

**Lines to change:** 1–22 and 46–48

**Proposed simplified code (full file replacement):**

```ts
import { IsEnum, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ActorType } from '../actor-type.enum';
import { IsOptionalForSystemActors } from './is-optional-for-system-actors.validator';

/** Minimal DTO exercising the decorator on `actor_id` alongside `actor_type`. */
class ActorIdDto {
  @IsEnum(ActorType)
  actor_type!: ActorType;

  @IsOptionalForSystemActors()
  actor_id?: string;
}

function createActorIdDto(actorType: ActorType, actorId?: unknown): ActorIdDto {
  return plainToInstance(ActorIdDto, { actor_type: actorType, actor_id: actorId });
}

function countActorIdErrors(actorType: ActorType, actorId?: unknown): number {
  return validateSync(createActorIdDto(actorType, actorId)).filter((e) => e.property === 'actor_id').length;
}

describe('IsOptionalForSystemActors', () => {
  it('accepts undefined actor_id for automated actors', () => {
    expect(countActorIdErrors(ActorType.SYSTEM)).toBe(0);
    expect(countActorIdErrors(ActorType.SCHEDULER)).toBe(0);
    expect(countActorIdErrors(ActorType.EXTERNAL_API)).toBe(0);
  });

  it('rejects undefined actor_id for human actors', () => {
    expect(countActorIdErrors(ActorType.CLIENT)).toBeGreaterThan(0);
    expect(countActorIdErrors(ActorType.COMPANY_USER)).toBeGreaterThan(0);
  });

  it('accepts a non-empty string actor_id for any actor type', () => {
    expect(countActorIdErrors(ActorType.SYSTEM, 'system-bot')).toBe(0);
    expect(countActorIdErrors(ActorType.CLIENT, 'user-1')).toBe(0);
  });

  it('rejects an empty string actor_id regardless of actor type', () => {
    expect(countActorIdErrors(ActorType.SYSTEM, '')).toBeGreaterThan(0);
    expect(countActorIdErrors(ActorType.CLIENT, '')).toBeGreaterThan(0);
  });

  it('rejects a non-string actor_id', () => {
    expect(countActorIdErrors(ActorType.SYSTEM, 123)).toBeGreaterThan(0);
  });
});
```

**Behavior impact:** None. The same assertions are executed; the non-string value is passed without a cast.

---

### 3. `src/common/envelope/validators/is-optional-for-system-actors.validator.ts` — Refactor automated-actor check

**Current issues:**
- `AUTOMATED_ACTOR_TYPES` declaration is on a single long line.
- `isAutomatedActor` receives the whole object and casts `actor_type`.
- Passing the whole object is unnecessary when only the actor type is needed.

**Lines to change:** 10–26 and 37–43

**Proposed simplified code for lines 10–26:**

```ts
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

/** Returns true when the actor type is an automated (non-human) actor. */
function isAutomatedActor(actorType?: ActorType): boolean {
  return actorType !== undefined && AUTOMATED_ACTOR_TYPES.includes(actorType);
}
```

**Proposed simplified code for lines 37–43:**

```ts
  validate(value: unknown, args: ValidationArguments): boolean {
    const target = args.object as { actor_type?: ActorType };
    if (isAutomatedActor(target.actor_type) && isAbsent(value)) {
      return true;
    }
    return isNonEmptyString(value);
  }
```

**Behavior impact:** None. The same actor types are recognized and the same validation logic is applied.

---

### 4. `src/common/envelope/event-envelope.class.ts` — Split long `class-validator` import line

**Current issue:**
- Line 1 is a single long import statement that is hard to read and exceeds typical line-length conventions.

**Lines to change:** 1

**Proposed simplified code:**

```ts
import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsObject,
  IsISO8601,
  Matches,
} from 'class-validator';
```

**Behavior impact:** None. Pure formatting.

---

### 5. `src/common/utils/event.factory.spec.ts` — Extract helper for "optional field omitted" tests

**Current issue:**
- The `causation_id` and `actor_id` "undefined when not provided" tests duplicate the same `buildContext(); delete context.<field>` pattern.

**Lines to change:** Insert helper at 20–24; update tests at 85–97.

**Proposed simplified code — helper to insert after `buildContext` (around line 20):**

```ts
function buildContextWithout(key: keyof EventContext): EventContext {
  const context = buildContext();
  delete (context as Partial<EventContext>)[key];
  return context;
}
```

**Proposed simplified code — replace the two "undefined when not provided" tests with:**

```ts
    it('leaves causation_id undefined when causationId is not provided', () => {
      const event = createEvent({}, buildContextWithout('causationId'));
      expect(event.causation_id).toBeUndefined();
    });

    it('leaves actor_id undefined when actorId is not provided', () => {
      const event = createEvent({}, buildContextWithout('actorId'));
      expect(event.actor_id).toBeUndefined();
    });
```

**Behavior impact:** None. The same contexts are created and the same expectations are asserted.

---

## Files with No Simplification Needed

- `src/common/envelope/validators/index.ts` — minimal barrel; no duplication.
- `src/common/envelope/index.ts` — minimal barrel; no duplication.
- `src/common/envelope/event-context.interface.ts` — clean, already minimal.

## Recommended Application Order

1. Apply simplification 2 (`validator.spec.ts`) and simplification 3 (`validator.ts`) together.
2. Apply simplification 1 (`event-envelope.actor-id-optional.spec.ts`).
3. Apply simplification 5 (`event.factory.spec.ts`).
4. Apply simplification 4 (`event-envelope.class.ts`) last.

## Verification

After applying the simplifications, run:

```bash
npm run typecheck
npm run lint
npx jest src/common/envelope src/common/utils/event.factory.spec.ts
npm test
npm run build
```

All existing tests must continue to pass with no behavior changes.
