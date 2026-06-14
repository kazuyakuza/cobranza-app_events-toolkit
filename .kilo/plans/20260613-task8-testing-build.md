# Task 8: Testing & Build — Implementation Plan

## Pre-Analysis

### Build & Lint Configuration Status: COMPLETE ✅

All build/lint tooling is already configured:

| Tool | Config File | Status |
|------|-----------|--------|
| TypeScript build | `tsconfig.build.json` (extends `tsconfig.json`) | ✅ `tsc -p tsconfig.build.json` |
| TypeScript strict | `tsconfig.json` (strict: true, ES2021) | ✅ |
| Jest | `jest.config.js` (testRegex: `.*\\.spec\\.ts$`) | ✅ |
| ESLint | `.eslintrc.js` (@typescript-eslint/recommended + prettier) | ✅ |
| ESLint ignore | `.eslintignore` | ✅ |
| Prettier | `.prettierrc` (singleQuote, trailingComma, printWidth 120) | ✅ |
| Prettier ignore | `.prettierignore` | ✅ |
| Type checking | `npm run typecheck` (tsc --noEmit) | ✅ |
| Coverage | `npm run test:coverage` (jest --coverage) | ✅ |

**Existing test count: 19 spec files, 192 passing tests.**

### Test Coverage Gap Analysis

**Files WITHOUT tests (priority-ordered):**

| # | File | Priority | Lines | Complexity |
|---|------|----------|-------|------------|
| 1 | `src/common/envelope/event-envelope.class.ts` | CRITICAL | 128 | class-validator decorators, constructor |
| 2 | `src/common/envelope/event-base.class.ts` | HIGH | 24 | abstract class extending EventEnvelope |
| 3 | `src/outbox/outbox.utils.ts` | HIGH | 60 | 7 pure functions |
| 4 | `src/outbox/outbox.service.ts` | HIGH | 195 | complex: processor, retry, DLQ |
| 5 | `src/common/errors/event-consumer.exception.ts` | MEDIUM | 55 | Error subclass + options interface |
| 6 | `src/common/errors/request-reply.exception.ts` | MEDIUM | 51 | Error subclass + options interface |
| 7 | `src/outbox/postgres-outbox.repository.ts` | MEDIUM | 101 | SQL repository (similar to SQLite pattern) |
| 8 | `src/common/dto/build-subject.dto.ts` *(dedicated)* | LOW | 53 | Partially tested in subject.builder.spec.ts |
| 9 | `src/common/envelope/actor-type.enum.ts` | LOW | 24 | Simple enum |
| 10 | `src/common/constants.ts` | LOW | 12 | Simple constants |

### Existing Test Patterns (to follow)

From `subject.builder.spec.ts`, `event.factory.spec.ts`, `uuid.utils.spec.ts`, and `sqlite-outbox.repository.spec.ts`:

- **Jest** with `describe`/`it` blocks
- **class-validator validation**: `plainToInstance()` + `validateSync()` from `class-transformer`/`class-validator`
- **Mocking**: `jest.mock()` for external dependencies (`better-sqlite3`, `winston`)
- **Assertions**: `expect().toBe()`, `expect().toMatch()`, `expect().toThrow()`, `expect().toHaveLength()`
- **Setup**: Inline helper functions (e.g., `createTestEnvelope()`, `buildContext()`)
- **Coverage**: Each describe block tests one method/concern; each it tests one behavior
- **File naming**: `<module>.<unit>.spec.ts` placed alongside source files

---

## Step 1: Create `event-envelope.spec.ts` — CRITICAL

**File**: `src/common/envelope/event-envelope.spec.ts`

**What to test**: EventEnvelope class-validator decorators and constructor behavior.

### Test sections:

#### 1.1 Constructor behavior
- Creates instance with no properties (all fields undefined/empty)
- Creates instance with partial properties via constructor
- Assigns all provided properties correctly

#### 1.2 `id` field validation
- Valid: `evt_<uuidv7>` passes
- Invalid: missing `evt_` prefix fails
- Invalid: empty string fails
- Invalid: non-string fails

#### 1.3 `type` field validation
- Valid: `"payment.proof.uploaded"` passes
- Invalid: empty string fails
- Invalid: non-string fails

#### 1.4 `version` field validation
- Valid: `"1.0.0"` passes
- Invalid: empty string fails
- Invalid: non-string fails

#### 1.5 `produced_at` field validation
- Valid: ISO 8601 timestamp `"2026-01-15T10:30:00.000Z"` passes
- Invalid: non-ISO string `"yesterday"` fails
- Invalid: empty string fails

#### 1.6 `producer` field validation
- Valid: `"payment-service"` passes
- Invalid: empty string fails

#### 1.7 `company_id` field validation
- Valid: UUIDv4 `"550e8400-e29b-41d4-a716-446655440000"` passes
- Invalid: non-UUID `"my-company"` fails

#### 1.8 `actor_type` field validation
- Valid: `ActorType.SYSTEM` passes
- Valid: `ActorType.CLIENT` passes
- Invalid: `"nonexistent"` fails
- Invalid: non-enum value fails

#### 1.9 `actor_id` field validation
- Valid: `"user-123"` passes
- Invalid: empty string fails

#### 1.10 `correlation_id` field validation
- Valid: UUIDv4 passes
- Invalid: non-UUID fails

#### 1.11 `causation_id` field (optional)
- Undefined passes
- Valid UUID passes
- Non-UUID fails (IsUUID validator still active when present)

#### 1.12 `trace_id` field (optional)
- Undefined passes
- Valid string passes

#### 1.13 `reply_to` field (optional)
- Undefined passes
- Valid string passes

#### 1.14 `data` field validation
- Valid: `{ amount: 100 }` (object) passes
- Invalid: `"not-an-object"` fails
- Valid: empty object `{}` passes

**Imports**: `validateSync` from `class-validator`, `plainToInstance` from `class-transformer`, `EventEnvelope`, `ActorType`

**Estimated lines**: ~155 lines

---

## Step 2: Create `event-base.spec.ts` — HIGH

**File**: `src/common/envelope/event-base.spec.ts`

**What to test**: EventBase abstract class inheritance and compile-time enforcement.

### Test sections:

#### 2.1 Extends EventEnvelope
- Concrete subclass is instance of EventEnvelope
- Concrete subclass is instance of EventBase

#### 2.2 Abstract type/version enforcement
- Concrete subclass must define `type` and `version`
- Instantiated subclass has correct type and version values

#### 2.3 Constructor inheritance
- Passing properties to constructor populates EventBase fields
- EventEnvelope fields (id, company_id, etc.) are accessible

#### 2.4 Generic data type
- EventBase\<T\> preserves data type through class hierarchy
- Data field accessible with correct type

#### 2.5 Validation inheritance
- Class-validator decorators from EventEnvelope work on EventBase subclass
- Invalid fields on EventBase subclass produce validation errors

**Imports**: `EventBase`, `EventEnvelope`, `ActorType`, `validateSync`, `plainToInstance`

**Estimated lines**: ~75 lines

---

## Step 3: Create `build-subject.dto.spec.ts` — LOW

**File**: `src/common/dto/build-subject.dto.spec.ts`

**What to test**: BuildSubjectDto validation in isolation (supplements existing tests in `subject.builder.spec.ts`).

### Test sections:

#### 3.1 Valid inputs
- Dashed UUID companyId passes
- Dashless UUID companyId passes
- All valid domain/entity/action/version pass
- Version defaults to `'1'`

#### 3.2 Invalid companyId
- Non-UUID string fails
- Wrong UUID format (too short) fails
- Empty string fails

#### 3.3 Invalid domain/entity/action
- Empty string for each fails individually
- Whitespace-only strings fail (IsNotEmpty)
- Missing fields fail

#### 3.4 Edge cases
- Version as numeric string `"2"` passes
- Domain with hyphens `"my-domain"` passes
- Action with hyphens passes

**Imports**: `BuildSubjectDto`, `plainToInstance`, `validateSync`

**Estimated lines**: ~90 lines

---

## Step 4: Create `outbox.utils.spec.ts` — HIGH

**File**: `src/outbox/outbox.utils.spec.ts`

**What to test**: All 7 pure utility functions used by OutboxService.

### Test sections:

#### 4.1 `buildDlqSubject`
- Prefixes `"company.abc.payment.proof.uploaded.v1"` → `"dlq.company.abc.payment.proof.uploaded.v1"`
- Works with any subject string

#### 4.2 `parseEnvelope`
- Parses JSON eventData string to EventEnvelope object
- Preserves all fields after round-trip serialization

#### 4.3 `extractErrorMessage`
- Returns `Error.message` for Error instance
- Returns `String(value)` for non-Error values
- Returns string for primitive values (number, boolean)

#### 4.4 `calculateBackoff`
- Attempt 1 with base 1000 → 1000ms
- Attempt 2 with base 1000 → 2000ms
- Attempt 3 with base 1000 → 4000ms
- Attempt 4 with base 2000 → 16000ms

#### 4.5 `delay`
- Returns a Promise\<void\>
- Resolves after specified time (use jest fake timers)

#### 4.6 `buildDlqPayload`
- Builds payload with originalSubject, originalEvent, error details
- Includes attempts count (entry.attempts + 1)
- Includes failedAt ISO timestamp
- Handles non-Error lastError gracefully

#### 4.7 `createDlqEnvelope`
- Creates EventEnvelope with properties from source envelope
- Sets data to dlqPayload
- Generates new produced_at timestamp

**Imports**: `buildDlqSubject`, `parseEnvelope`, `extractErrorMessage`, `calculateBackoff`, `delay`, `buildDlqPayload`, `createDlqEnvelope`, `EventEnvelope`, `ActorType`

**Estimated lines**: ~125 lines

---

## Step 5: Create `outbox.service.spec.ts` — HIGH

**File**: `src/outbox/outbox.service.spec.ts`

**What to test**: OutboxService save, processor lifecycle, retry logic, DLQ routing.

**Mock strategy**: Mock `repository` (OutboxRepository), `producerService` (ProducerService), and `logger` (EventLoggerService).

### Test sections:

#### 5.1 `saveToOutbox`
- Calls repository.save with correct event and subject
- Calls logger.logOutboxSaved with correct context

#### 5.2 `startProcessor` / `stopProcessor`
- startProcessor creates interval timer when enabled
- startProcessor does nothing when already started
- startProcessor does nothing when disabled (options.enabled=false)
- stopProcessor clears interval when running
- stopProcessor does nothing when not started

#### 5.3 `onModuleDestroy`
- Calls stopProcessor on module destroy

#### 5.4 Processing — success path
- Polls repository.getPending and publishes each entry
- Marks entry as sent after successful publish
- Logs success with correct context

#### 5.5 Processing — retry path
- On publish failure: increments attempt count via markAsFailed
- On publish failure: calls delay with backoff time
- Logs failure before retrying

#### 5.6 Processing — DLQ routing
- When attempts exceed maxRetries, routes to DLQ
- DLQ subject is built via dlqSubjectBuilder
- DLQ envelope created and published
- Entry marked as sent after DLQ routing
- Logs DLQ routing

#### 5.7 Processing — concurrency guard
- Skips processing if already processing (isProcessing flag)

**Estimated lines**: ~175 lines

---

## Step 6: Create `events-errors.spec.ts` — MEDIUM

**File**: `src/common/errors/events-errors.spec.ts`

**What to test**: Both `EventConsumerException` and `RequestReplyException` in one file (identical patterns).

### Test sections:

#### 6.1 EventConsumerException
- Sets name to `'EventConsumerException'`
- Stores eventId, eventType, correlationId, cause from options
- correlationId and cause are optional (undefined when omitted)
- Extends Error (instanceof check)
- Has stack trace (captureStackTrace)
- message comes from options.message

#### 6.2 RequestReplyException
- Sets name to `'RequestReplyException'`
- Stores eventId, eventType, correlationId, cause from options
- Extends Error (instanceof check)
- Has stack trace

**Imports**: `EventConsumerException`, `EventConsumerExceptionOptions`, `RequestReplyException`, `RequestReplyExceptionOptions`

**Estimated lines**: ~65 lines

---

## Step 7: Verify Build & Lint

**Commands to run after all test files created:**

```powershell
# Verify build (excludes spec files)
npm run build

# Verify type checking
npm run typecheck

# Run all tests (expected: 25 spec files, >250 tests)
npm test

# Run coverage
npm run test:coverage

# Run linting
npm run lint

# Run formatting check
npm run format:check
```

---

## Summary of Changes

| Action | File | Priority | Est. Lines |
|--------|------|----------|------------|
| Create | `src/common/envelope/event-envelope.spec.ts` | CRITICAL | ~155 |
| Create | `src/common/envelope/event-base.spec.ts` | HIGH | ~75 |
| Create | `src/common/dto/build-subject.dto.spec.ts` | LOW | ~90 |
| Create | `src/outbox/outbox.utils.spec.ts` | HIGH | ~125 |
| Create | `src/outbox/outbox.service.spec.ts` | HIGH | ~175 |
| Create | `src/common/errors/events-errors.spec.ts` | MEDIUM | ~65 |
| Verify | Build, lint, format, typecheck | VERIFICATION | N/A |

**Total new spec files**: 6
**Total estimated new test lines**: ~685
**Expected total spec files**: 25 (19 existing + 6 new)
**Expected total tests**: 250+ (192 existing + ~60 new test cases)

### Code Guidelines Compliance

- All spec files ≤ 200 lines ✅ (largest: ~175 lines for outbox.service.spec.ts)
- Test methods follow existing patterns: one `it` per behavior
- Self-documenting test names in `describe`/`it` blocks
- Mocks use `jest.fn()` and `jest.mock()` consistently with existing patterns
- No new source code files — test-only additions
