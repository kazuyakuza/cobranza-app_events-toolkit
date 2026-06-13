# Plan: Subject Builder

**Task**: Create `BuildSubjectDto` (class-validator) and `SubjectBuilder` with `buildSubject()` function, including automatic companyId dash sanitization.
**Branch**: `feat/initialize-project-core`
**Date**: 2026-06-12
**Context**: Task 3 from TODO — Subject Builder

---

## 1. High-Level Approach

Two new source files + one test file implement the NATS subject string generation per `docs/event-messaging-convention.md` section 2:

1. **`src/common/dto/build-subject.dto.ts`** — DTO class with `class-validator` decorators that enforce the shape of subject builder inputs: UUID for `companyId`, non-empty strings for `domain`, `entity`, `action`, `version`.
2. **`src/common/utils/subject.builder.ts`** — `SubjectBuilder` class with `build()` method (single entry point for subject generation) plus a standalone `buildSubject()` convenience function. The builder automatically strips dashes from `companyId` to produce subject-compliant UUIDs (convention section 2: "Use UUID **without dashes**").

Subject format (from convention section 2):

```
company.{company_id}.{domain}.{entity}.{action}.v{version}
```

All code follows: max depth ≤2, max 2 params, max 50 lines/method, max 200 lines/file, prefer private members, self-documenting names, no commented code.

---

## 2. Preconditions

- [x] `package.json` exists with `class-validator` as peerDependency.
- [x] `tsconfig.json` exists with `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `strictPropertyInitialization: false`.
- [x] Directory `src/common/dto/` exists (currently has `.gitkeep`).
- [x] Directory `src/common/utils/` exists (currently has `.gitkeep`).
- [x] Convention document `docs/event-messaging-convention.md` section 2 defines subject format.
- [ ] `node_modules` installed (required for `class-validator` imports and build).

---

## 3. Step-by-Step Implementation

### Step 3.1 — Create `src/common/dto/build-subject.dto.ts`

**File**: `src/common/dto/build-subject.dto.ts`

**Design notes**:

- `companyId` uses `@IsUUID()` — accepts both dashed and dashless UUIDs. The dashes are stripped later in the builder, NOT in the DTO. This allows consumers to pass the raw UUID from the envelope directly.
- `domain`, `entity`, `action`, `version` are all `@IsString()` + `@IsNotEmpty()`.
- `version` defaults to `'1'` (string, as convention uses single-digit major versions like `v1`, `v2`).
- No custom sanitization in the DTO — sanitization belongs in the builder, keeping the DTO as a pure validation contract.

**Content**:

```ts
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Validated parameter object for building NATS subjects.
 *
 * All fields are validated at runtime by class-validator decorators.
 * The {@link SubjectBuilder} uses this DTO to generate subjects in the
 * format: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
 *
 * @example
 * ```ts
 * const dto = plainToInstance(BuildSubjectDto, {
 *   companyId: '550e8400-e29b-41d4-a716-446655440000',
 *   domain: 'payment',
 *   entity: 'proof',
 *   action: 'uploaded',
 *   version: '1',
 * });
 * ```
 *
 * @see docs/event-messaging-convention.md — Section 2 (Subject Naming Convention)
 */
export class BuildSubjectDto {
  /**
   * Company UUID — accepts dashed (e.g. `550e8400-e29b-41d4-a716-446655440000`)
   * or dashless format. Dashes are automatically removed during subject building.
   */
  @IsUUID()
  companyId!: string;

  /** Business domain (e.g. `payment`, `debt`, `client`, `notification`) */
  @IsString()
  @IsNotEmpty()
  domain!: string;

  /** Main entity involved (e.g. `proof`, `statement`, `schedule`, `attempt`) */
  @IsString()
  @IsNotEmpty()
  entity!: string;

  /** Verb in past tense describing the action (e.g. `uploaded`, `created`, `processed`) */
  @IsString()
  @IsNotEmpty()
  action!: string;

  /** Major version number (default: `'1'`). The `v` prefix is added automatically. */
  @IsString()
  @IsNotEmpty()
  version: string = '1';
}
```

**Lines**: ~53 (well under 200).

**Validation**: `@IsUUID()` accepts all UUID versions (1-5) in both dashed and dashless formats. This is intentional — the DTO validates the UUID format, while the builder handles format normalization.

---

### Step 3.2 — Create `src/common/utils/subject.builder.ts`

**File**: `src/common/utils/subject.builder.ts`

**Design notes**:

- `SubjectBuilder` class with a single public `build(dto: BuildSubjectDto): string` method.
- Method has exactly 2 lines of logic (dash removal + template literal), well under 50-line limit.
- Sanitization: `.replace(/-/g, '')` removes all dashes from `companyId`. Handles both dashed UUIDs (from envelope) and already-dashless UUIDs.
- Standalone `buildSubject()` function exported for convenience (matches the `buildSubject({...})` pattern in `brief.md` section 7).
- No external dependencies — pure string manipulation.

**Content**:

```ts
import { BuildSubjectDto } from '../dto/build-subject.dto';

/**
 * Builds NATS subjects in the standardized format defined by the
 * event-messaging convention.
 *
 * Subject format: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
 *
 * This is the single entry point for all subject generation across the platform.
 * All microservices MUST use this builder to ensure consistent subject naming.
 *
 * @example
 * ```ts
 * const builder = new SubjectBuilder();
 * const subject = builder.build({
 *   companyId: '550e8400-e29b-41d4-a716-446655440000',
 *   domain: 'payment',
 *   entity: 'proof',
 *   action: 'uploaded',
 *   version: '1',
 * });
 * // => 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1'
 * ```
 *
 * @see docs/event-messaging-convention.md — Section 2 (Subject Naming Convention)
 */
export class SubjectBuilder {
  /**
   * Builds a NATS subject string from the validated DTO.
   *
   * Automatically removes dashes from the {@link BuildSubjectDto.companyId}
   * to comply with the convention recommendation of dashless UUIDs in subjects.
   *
   * @param dto - Validated BuildSubjectDto instance.
   * @returns NATS subject string in the standard format.
   */
  build(dto: BuildSubjectDto): string {
    const companyId = dto.companyId.replace(/-/g, '');
    return `company.${companyId}.${dto.domain}.${dto.entity}.${dto.action}.v${dto.version}`;
  }
}

/**
 * Convenience function that builds a NATS subject from a validated DTO.
 *
 * Equivalent to `new SubjectBuilder().build(dto)`.
 *
 * @param dto - Validated BuildSubjectDto instance.
 * @returns NATS subject string in the standard format.
 */
export function buildSubject(dto: BuildSubjectDto): string {
  return new SubjectBuilder().build(dto);
}
```

**Lines**: ~50 (with JSDoc, well under 200).

**Design decisions**:

- `build()` is a single method with 1 param (≤2 params rule), 0 nesting depth.
- `companyId` sanitization is inline — the logic is trivial enough to not warrant extraction (single `.replace()` call).
- `buildSubject()` is a thin wrapper — no duplication, delegates to the class.
- Class is public (not private) because `SubjectBuilder` is part of the public API exported via `src/index.ts`. The `build()` method is also public for the same reason.
- No `new SubjectBuilder()` singleton — the class is stateless, and consumers can instantiate or use the function. If needed, a singleton can be added later without breaking the API.

---

### Step 3.3 — Create `src/common/utils/subject.builder.spec.ts`

**File**: `src/common/utils/subject.builder.spec.ts`

**Design notes**:

- Tests cover: dashed UUID sanitization, already-dashless UUID, default version, custom version, all fields assembled correctly.
- Tests use `validateSync` from `class-validator` to verify DTO validation independently.
- Both `SubjectBuilder.build()` and `buildSubject()` function are tested to ensure API equivalence.

**Content**:

```ts
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BuildSubjectDto } from '../dto/build-subject.dto';
import { SubjectBuilder, buildSubject } from './subject.builder';

describe('SubjectBuilder', () => {
  describe('BuildSubjectDto validation', () => {
    it('accepts a valid DTO with dashed UUID', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a valid DTO with dashless UUID', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400e29b41d4a716446655440000',
        domain: 'debt',
        entity: 'schedule',
        action: 'generated',
        version: '2',
      });
      const errors = validateSync(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects missing companyId', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'companyId')).toBe(true);
    });

    it('rejects empty domain', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: '',
        entity: 'proof',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'domain')).toBe(true);
    });

    it('rejects empty entity', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: '',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'entity')).toBe(true);
    });

    it('rejects empty action', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: 'proof',
        action: '',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'action')).toBe(true);
    });
  });

  describe('SubjectBuilder.build()', () => {
    it('builds subject with dashed UUID (dashes removed)', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      const subject = builder.build(dto);
      expect(subject).toBe(
        'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1',
      );
    });

    it('builds subject with already-dashless UUID', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400e29b41d4a716446655440000',
        domain: 'debt',
        entity: 'schedule',
        action: 'generated',
        version: '2',
      });
      const subject = builder.build(dto);
      expect(subject).toBe(
        'company.550e8400e29b41d4a716446655440000.debt.schedule.generated.v2',
      );
    });

    it('uses default version "1" when not specified', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        domain: 'client',
        entity: 'profile',
        action: 'updated',
      });
      const subject = builder.build(dto);
      expect(subject).toContain('.v1');
    });

    it('builds correct subject for notification domain', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '11111111-2222-3333-4444-555555555555',
        domain: 'notification',
        entity: 'email',
        action: 'sent',
        version: '3',
      });
      const subject = builder.build(dto);
      expect(subject).toBe(
        'company.11111111222233334444555555555555.notification.email.sent.v3',
      );
    });
  });

  describe('buildSubject() function', () => {
    it('produces the same result as SubjectBuilder.build()', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: 'aaaaaaaabbbbccccddddeeeeeeeeeeee',
        domain: 'bank',
        entity: 'statement',
        action: 'processed',
        version: '1',
      });
      const classResult = new SubjectBuilder().build(dto);
      const fnResult = buildSubject(dto);
      expect(fnResult).toBe(classResult);
    });
  });
});
```

**Lines**: ~150.

**Test runner**: Jest with `ts-jest` per `jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`).

---

### Step 3.4 — Build & Type Verification

Run type-check and build to confirm no compilation errors:

```bash
npm run typecheck
```

Expected: zero errors from `src/common/dto/build-subject.dto.ts` and `src/common/utils/subject.builder.ts`.

Run full build:

```bash
npm run build
```

Expected: successful compilation to `dist/`.

---

### Step 3.5 — Unit Test Verification

Run unit tests:

```bash
npm run test
```

Expected: all tests in `subject.builder.spec.ts` pass.

---

### Step 3.6 — Lint & Format

```bash
npm run lint
npm run format
```

Expected: zero lint errors, code formatted per Prettier config.

---

### Step 3.7 — Git Commit

After all files are created, build passes, and tests pass:

```bash
git add src/common/dto/build-subject.dto.ts src/common/utils/subject.builder.ts src/common/utils/subject.builder.spec.ts
git commit -m "feat: add BuildSubjectDto and SubjectBuilder with dash sanitization

- BuildSubjectDto with class-validator decorators (IsUUID, IsString, IsNotEmpty)
- SubjectBuilder class with build() method generating convention-compliant NATS subjects
- Convenience buildSubject() function equivalent to SubjectBuilder.build()
- Automatic dash removal from companyId for subject compliance
- Unit tests covering validation, dash sanitization, default version, and edge cases"
```

Note: `src/common/dto/.gitkeep` should be removed as the directory now has a real file. Include in commit if needed (or remove separately).

---

## 4. Verification Checklist

| Check | Criteria |
|-------|----------|
| DTO validation decorators | `companyId`: `@IsUUID()`, all others: `@IsString()` + `@IsNotEmpty()` |
| DTO default version | `version: string = '1'` |
| Subject format | `company.{id}.{domain}.{entity}.{action}.v{version}` |
| Dash sanitization | `.replace(/-/g, '')` applied to `companyId` |
| Dashed UUID input | Produces correct dashless subject |
| Dashless UUID input | Produces identical result (idempotent) |
| Standalone function | `buildSubject(dto)` returns same as `new SubjectBuilder().build(dto)` |
| TypeScript compilation | `tsc --noEmit` passes |
| Unit tests pass | All spec tests green |
| File size limits | Both source files ≤200 lines (DTO ~53 lines, builder ~50 lines) |
| Max params | `build(dto)` has 1 param; `buildSubject(dto)` has 1 param |
| Max depth | Zero nesting in build logic |
| Max method lines | `build()` body is 2 lines |
| JSDoc | Class-level, method-level, and field-level JSDoc on all public API |
| No commented code | Zero commented-out code |
| Self-documenting | Clear names: `BuildSubjectDto`, `SubjectBuilder`, `buildSubject`, `companyId`, `domain`, `entity`, `action`, `version` |

---

## 5. What is OUT of Scope (NOT done in this task)

- `src/index.ts` barrel export updates — will be done in a later task when all common types are ready (`export { BuildSubjectDto }`, `export { SubjectBuilder, buildSubject }`).
- `src/common/constants.ts` — magic strings/constants (separate task).
- `src/common/utils/event.factory.ts` — factory function `createEvent<T>()` (separate task).
- `src/common/utils/uuid.utils.ts` — UUIDv7 generation (separate task).
- `src/common/utils/date.utils.ts` — ISO 8601 timestamp helpers (separate task).
- `src/common/errors/` — EventConsumerException (separate task).
- Module files (producer, consumer, outbox, logging) — all separate tasks.
- Integration tests with NATS — the subject builder is pure logic, no NATS dependency.

---

## 6. Code Review Focus Areas (for reviewer)

1. Verify subject format matches `docs/event-messaging-convention.md` section 2 exactly: `company.{company_id}.{domain}.{entity}.{action}.v{version}`.
2. Confirm dash sanitization is applied to `companyId` via `.replace(/-/g, '')`.
3. Verify `buildSubject()` returns same result as `SubjectBuilder.build()`.
4. Check DTO validation: `@IsUUID()` on `companyId`, `@IsString()` + `@IsNotEmpty()` on all string fields.
5. Confirm `version` defaults to `'1'` and is a string (not a number).
6. Verify all tests in `subject.builder.spec.ts` pass.
7. Check no commented-out code exists.
8. Confirm file sizes within limits (source files ≤200 lines).
9. Verify max params, max depth, max method lines rules all satisfied.
