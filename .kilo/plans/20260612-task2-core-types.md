# Plan: Core Types & Envelope

**Task**: Implement `ActorType` enum, `EventEnvelope<T>` base class, and `EventBase<T>` abstract helper.
**Branch**: `feat/initialize-project-core`
**Date**: 2026-06-12
**Context**: Task 2 from TODO — Core Types & Envelope

---

## 1. High-Level Approach

Three files implement the event envelope contract defined in `docs/event-messaging-convention.md` (section 3, section 5):

1. **`ActorType` enum** — string enum matching convention section 5: `client`, `company_user`, `system`, `scheduler`, `external_api`.
2. **`EventEnvelope<T>`** — generic base class with all 13 convention fields decorated with `class-validator` runtime validators. Accepts a single optional partial-properties object in the constructor (max-2-params compliant). Does NOT validate `data` content beyond `@IsObject()` — domain payload validation is the microservice's responsibility.
3. **`EventBase<T>`** — thin abstract class extending `EventEnvelope<T>` that uses `declare abstract` to force concrete subclasses to provide `type` and `version` at compile time. This enforces convention adherence for domain event types (see `brief.md` section 8 example).

All code follows: max depth ≤2, max 2 params, max 50 lines/method, max 200 lines/file, prefer private members, self-documenting names, JSDoc on public API.

---

## 2. Preconditions

- [x] `package.json` exists with `class-validator` and `class-transformer` as peerDependencies (`node_modules` installed).
- [x] `tsconfig.json` exists with `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `strictPropertyInitialization: false`.
- [x] Directory `src/common/envelope/` exists (with `.gitkeep` in `validators/` subdirectory).
- [x] Convention document `docs/event-messaging-convention.md` defines all required fields.

---

## 3. Step-by-Step Implementation

### Step 3.1 — Create `src/common/envelope/actor-type.enum.ts`

**File**: `src/common/envelope/actor-type.enum.ts`

**Content**: TypeScript string enum with JSDoc for each member.

```ts
/**
 * Identifies the actor type that performed an action recorded in an event.
 *
 * Used for audit trails, security tracking, and event provenance
 * across all Cobranza App microservices.
 *
 * See: docs/event-messaging-convention.md — Section 5 (Actor Types)
 */
export enum ActorType {
  /** External client or customer of the platform */
  CLIENT = 'client',

  /** Internal company user such as employee, admin, or operator */
  COMPANY_USER = 'company_user',

  /** Automated system process with no human actor */
  SYSTEM = 'system',

  /** Scheduled job, cron task, or background worker */
  SCHEDULER = 'scheduler',

  /** External third-party API or webhook integration */
  EXTERNAL_API = 'external_api',
}
```

**Validation**: `@IsEnum(ActorType)` will be used in EventEnvelope.

**Lines**: ~20 (well under 200).

---

### Step 3.2 — Create `src/common/envelope/event-envelope.class.ts`

**File**: `src/common/envelope/event-envelope.class.ts`

**Design notes**:

- Generic parameter `T = Record<string, unknown>` for the `data` payload.
- All 13 fields from convention section 3 with `class-validator` decorators.
- `@IsOptional()` on nullable/optional fields (`causation_id`, `trace_id`, `reply_to`).
- `@Matches()` for custom formats: `id` (evt_ prefix) and `produced_at` (ISO 8601 with ms).
- `@IsObject()` on `data` — domain-specific validation is the consumer's responsibility.
- Constructor accepts a single `Partial<EventEnvelope<T>>` object (compliant with max-2-params rule). No constructor body logic needed — `Object.assign` pattern.
- `strictPropertyInitialization: false` allows fields without initializers.

**Content**:

```ts
import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsObject,
  IsISO8601,
} from 'class-validator';
import { ActorType } from './actor-type.enum';

/**
 * Standard event envelope for all NATS JetStream messages in the Cobranza App platform.
 *
 * Every published and consumed event MUST conform to this structure.
 * Microservices extend this class (or {@link EventBase}) to define
 * domain-specific event types with validated data payloads.
 *
 * @typeParam T - The domain-specific business payload type.
 *                Defaults to `Record<string, unknown>` when not specified.
 *
 * @see docs/event-messaging-convention.md — Section 3 (Event Envelope)
 */
export class EventEnvelope<T = Record<string, unknown>> {
  /**
   * Unique event identifier.
   * Format: UUIDv7 prefixed with `evt_` for human-readable event tracing.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^evt_/)
  id!: string;

  /**
   * Event type in dot-notation matching the action part of the NATS subject.
   * Example: `payment.proof.uploaded`
   */
  @IsString()
  @IsNotEmpty()
  type!: string;

  /**
   * Schema version of this event envelope and payload.
   * Semver format recommended: `1.0.0`
   */
  @IsString()
  @IsNotEmpty()
  version!: string;

  /**
   * ISO 8601 UTC timestamp with milliseconds marking when the event was produced.
   * Format: `YYYY-MM-DDTHH:mm:ss.sssZ`
   */
  @IsString()
  @IsNotEmpty()
  @IsISO8601({ strict: true })
  produced_at!: string;

  /**
   * Name of the microservice that produced this event.
   * Use kebab-case: `payment-service`, `debt-service`
   */
  @IsString()
  @IsNotEmpty()
  producer!: string;

  /**
   * Company UUID with dashes — mandatory for tenant isolation.
   * Format: `550e8400-e29b-41d4-a716-446655440000`
   */
  @IsUUID('4')
  company_id!: string;

  /**
   * Type of actor who performed the action recorded in this event.
   */
  @IsEnum(ActorType)
  actor_type!: ActorType;

  /**
   * Unique identifier of the actor (user_id, client_id, etc.)
   */
  @IsString()
  @IsNotEmpty()
  actor_id!: string;

  /**
   * Identifier shared across all events in a single request/transaction chain.
   * Used for distributed tracing and idempotency.
   */
  @IsUUID('4')
  correlation_id!: string;

  /**
   * Event ID that directly triggered this event (event sourcing chain).
   * Optional — only set when this event is a direct consequence of another.
   */
  @IsOptional()
  @IsUUID('4')
  causation_id?: string;

  /**
   * OpenTelemetry trace ID for cross-service observability.
   * Optional but recommended for production tracing.
   */
  @IsOptional()
  @IsString()
  trace_id?: string;

  /**
   * NATS subject for async request-reply response routing.
   * Optional — only set for request-reply pattern events.
   */
  @IsOptional()
  @IsString()
  reply_to?: string;

  /**
   * Domain-specific business payload.
   * Each microservice validates its own data structure.
   */
  @IsObject()
  data!: T;

  /**
   * Constructs an EventEnvelope with optional partial field initialization.
   *
   * @param properties - Partial envelope fields to initialize.
   *                     Useful for factory functions and plain-to-instance transformation.
   */
  constructor(properties?: Partial<EventEnvelope<T>>) {
    if (properties) {
      Object.assign(this, properties);
    }
  }
}
```

**Lines**: ~145 (with JSDoc, under 200 limit).

**Design decisions**:

- `id` uses `@Matches(/^evt_/)` — matches convention's "prefix evt_ recommended" rule. Does NOT enforce full UUIDv7 pattern here (the factory will generate valid IDs).
- `produced_at` uses `@IsISO8601({ strict: true })` — validates strict ISO 8601 format with milliseconds, matching convention format exactly.
- `company_id` uses `@IsUUID('4')` which validates UUID v4 format with dashes (convention uses dashed UUIDs in envelopes).
- `data` uses `@IsObject()` — no `@ValidateNested()` because `T` is generic and concrete type is unknown at this level.
- Constructor uses `Partial<EventEnvelope<T>>` — single parameter, compliant with max-2-params rule.

---

### Step 3.3 — Create `src/common/envelope/event-base.class.ts`

**File**: `src/common/envelope/event-base.class.ts`

**Design notes**:

- Abstract class extending `EventEnvelope<T>`.
- Uses `declare abstract` to override `type` and `version` as abstract at compile time.
- Forces subclass to provide concrete values — TypeScript compiler errors if omitted.
- No runtime code emitted for the `declare abstract` overrides.
- Minimal file (~10 lines).

**Content**:

```ts
import { EventEnvelope } from './event-envelope.class';

/**
 * Abstract base for domain-specific event types.
 *
 * Extends {@link EventEnvelope} and enforces at compile time that every
 * concrete event type MUST define its own `type` and `version` properties.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @example
 * ```ts
 * class PaymentProofUploadedEvent extends EventBase<PaymentProofData> {
 *   readonly type = 'payment.proof.uploaded';
 *   readonly version = '1.0.0';
 * }
 * ```
 */
export abstract class EventBase<T = Record<string, unknown>> extends EventEnvelope<T> {
  declare abstract type: string;
  declare abstract version: string;
}
```

**Lines**: ~25 (with JSDoc).

**Why `declare abstract`**: TypeScript allows `declare abstract` overrides in derived classes to make a base class property abstract without emitting any JavaScript. This gives compile-time enforcement without runtime overhead.

---

### Step 3.4 — Build Verification

Run type-check and build to confirm no compilation errors:

```powershell
# TypeScript type check (no emit)
npx tsc --noEmit

# Full build
npx tsc -p tsconfig.build.json
```

Or use npm scripts:

```powershell
npm run typecheck
npm run build
```

Expected: zero errors from `src/common/envelope/*.ts` files.

Validate with lint:

```powershell
npm run lint
```

---

### Step 3.5 — Git Commit

After all three files are created and build passes:

```powershell
git add src/common/envelope/actor-type.enum.ts src/common/envelope/event-envelope.class.ts src/common/envelope/event-base.class.ts
git commit -m "feat: add core event envelope types and ActorType enum

- ActorType enum with 5 actor categories (client, company_user, system, scheduler, external_api)
- EventEnvelope<T> base class with class-validator decorators for all 13 convention fields
- EventBase<T> abstract helper enforcing type/version at compile time
- Full JSDoc on public API per convention document"
```

---

## 4. Verification Checklist

| Check | Criteria |
|-------|----------|
| All convention fields present | 13 fields in EventEnvelope match `docs/event-messaging-convention.md` section 3 |
| Required vs optional | `causation_id`, `trace_id`, `reply_to` have `@IsOptional()` |
| Validation decorators | Each field has at least one `class-validator` decorator |
| ActorType enum values | All 5 values from convention section 5 |
| TypeScript compilation | `tsc --noEmit` passes with zero errors |
| File size limits | All files ≤200 lines |
| Max params | Constructor has 1 param |
| Max depth | No nesting beyond 2 levels |
| JSDoc | Class-level and field-level JSDoc on public API |
| No commented code | Zero commented-out code blocks |
| Self-documenting | Clear, descriptive names without explanatory inline comments |

---

## 5. What is OUT of Scope (NOT done in this task)

- `src/common/constants.ts` — magic strings/constants (separate task)
- `src/common/envelope/validators/` — custom class-validator decorators (separate task)
- `src/common/utils/event.factory.ts` — factory function `createEvent<T>()` (separate task)
- `src/common/utils/uuid.utils.ts` — UUIDv7 generation (separate task)
- `src/common/utils/date.utils.ts` — ISO 8601 timestamp helpers (separate task)
- `src/common/dto/build-subject.dto.ts` — BuildSubjectDto (separate task)
- `src/common/utils/subject.builder.ts` — SubjectBuilder (separate task)
- `src/common/errors/` — EventConsumerException (separate task)
- Module files (producer, consumer, outbox, logging) — all separate tasks
- Barrel exports in `src/index.ts` — will be updated in a later task when all common types are ready
- Unit tests — test infrastructure setup is a separate task
- No `class-transformer` `@Type()` decorator needed on `data` since validation happens at the concrete event type level

---

## 6. Code Review Focus Areas (for reviewer)

1. Verify all 13 convention fields are present and correctly marked required/optional.
2. Check `@Matches()` regex for `id` (`/^evt_/`) and `@IsISO8601({ strict: true })` for `produced_at` are correct.
3. Verify `declare abstract` pattern in EventBase works correctly with `tsc --noEmit`.
4. Check constructor parameter count (must be ≤2).
5. Confirm no nesting exceeds 2 levels.
6. Verify JSDoc references `docs/event-messaging-convention.md` correctly.
7. Confirm `@IsUUID('4')` is the right version for company_id and correlation_id (convention uses UUID v4 format with dashes in the envelope JSON).
