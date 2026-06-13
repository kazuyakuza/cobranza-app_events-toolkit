# Task 5 — Error Handling &amp; Logging: Implementation Plan

## Pre-Analysis

### Current State
- Branch: `feat/initialize-project-core`
- `src/common/errors/` exists with `.gitkeep` only — no error classes yet
- `src/logging/` exists with `.gitkeep` only — no logger service yet
- `src/index.ts` has only `export {};` — minimal barrel
- All common infrastructure (envelope, DTOs, utils, constants) is already implemented
- Testing infrastructure (jest, `*.spec.ts` pattern) is in place
- `winston` ^3.0.0 is a direct dependency in `package.json`
- `@nestjs/common` is a peer dependency (needed for `@Injectable()` decorator)

### Task Deliverables (from TODO)
1. `src/common/errors/event-consumer.exception.ts` — custom exception class
2. `src/common/errors/index.ts` — barrel export
3. `src/logging/event-logger.service.ts` — Winston-based logging service
4. `src/index.ts` — complete with all existing public API exports

### Code Rules Compliance Checklist
- Max 200 lines per file in src/
- Max 50 lines per method body
- Max 2 levels of indentation
- Max 2 parameters per method
- Prefer private members — public only when necessary
- Self-documenting code (clear names over comments)
- No commented-out code
- Single-section boolean conditions

### Architecture Context
- `EventConsumerException`: thrown by consumers → caught by `JetStreamConsumerService` → forwarded to DLQ subject. DLQ pattern: `dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}` (per `docs/event-messaging-convention.md` §4.3)
- `EventLoggerService`: wraps Winston, Strategy Pattern via DI, structured JSON logging with trace IDs, correlation IDs, event IDs (per `architecture.md` §7 and §3)
- Public API (from `architecture.md` §6): exports for modules, services, core classes, DTOs, utils, decorators, errors, and logger. Only items that exist are exported.

---

## Step 1: Create EventConsumerException

**File**: `src/common/errors/event-consumer.exception.ts`

### Design Rationale
- Extends native `Error` (not NestJS-specific) — consumers throw it, `JetStreamConsumerService` catches it
- Carries context needed for DLQ routing: `eventId`, `eventType`, `correlationId`, and underlying cause
- Constructor accepts a single options object (max-2-params rule compliance)

### Code

```typescript
/**
 * Thrown by event consumers when message processing fails and the message
 * should be routed to the Dead Letter Queue (DLQ).
 *
 * JetStreamConsumerService catches this exception and forwards the failed
 * message to the corresponding DLQ subject:
 *   dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}
 *
 * @see docs/event-messaging-convention.md — Section 4.3 (Dead Letter Queue)
 */
export class EventConsumerException extends Error {
  /** Event ID of the message that failed processing. */
  readonly eventId: string;

  /** Event type (dot-notation) of the message that failed processing. */
  readonly eventType: string;

  /** Correlation ID for tracing the failed request chain. Optional. */
  readonly correlationId?: string;

  /**
   * Creates an EventConsumerException with DLQ routing context.
   *
   * @param options - Exception options including event metadata and the underlying cause.
   */
  constructor(options: EventConsumerExceptionOptions) {
    super(options.message);
    this.name = 'EventConsumerException';
    this.eventId = options.eventId;
    this.eventType = options.eventType;
    this.correlationId = options.correlationId;
    this.cause = options.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EventConsumerException);
    }
  }
}

/** Options for constructing an {@link EventConsumerException}. */
export interface EventConsumerExceptionOptions {
  /** Human-readable error message describing the failure. */
  message: string;
  /** Event ID of the message that failed processing. */
  eventId: string;
  /** Event type (dot-notation) of the message that failed processing. */
  eventType: string;
  /** Correlation ID for tracing the failed request chain. Optional. */
  correlationId?: string;
  /** The underlying error that caused the failure. Optional. */
  cause?: Error;
}
```

### Rule Compliance Verification
- **Lines**: ~50 (under 200 ✅)
- **Max depth**: 1 (constructor body at depth 1, `if` at depth 2 ✅)
- **Max params**: 1 (`options`) ✅
- **Self-documenting**: JSDoc on class and all members ✅
- **No commented code**: ✅

---

## Step 2: Create Error Barrel

**File**: `src/common/errors/index.ts`

### Code

```typescript
export { EventConsumerException, EventConsumerExceptionOptions } from './event-consumer.exception';
```

### Rule Compliance Verification
- **Lines**: 1 ✅
- **Single export statement** — clear intent ✅

---

## Step 3: Create EventLoggerService

**File**: `src/logging/event-logger.service.ts`

### Design Rationale
- NestJS `@Injectable()` service — lives in DI container
- Wraps Winston `Logger` with structured JSON output
- Strategy Pattern: accepts custom transports and level via constructor options
- Default: `Console` transport at `info` level with `json` format
- Four log methods, each taking a context object (1 param)
- Separate interfaces for standard event logs and error event logs

### Code

```typescript
import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

/**
 * Structured logging service for all event operations across the platform.
 *
 * Wraps Winston to provide consistent, queryable JSON logs for:
 * - Event publishing (logEventEmitted)
 * - Event consumption (logEventConsumed)
 * - Consumer processing errors (logEventError)
 * - Dead Letter Queue routing (logEventDlq)
 *
 * Accepts custom Winston transports via constructor options,
 * enabling microservices to integrate with existing logging infrastructure.
 */
@Injectable()
export class EventLoggerService {
  private readonly logger: winston.Logger;

  /**
   * Creates an EventLoggerService with optional custom Winston configuration.
   *
   * @param options - Optional Winston transports and log level. Defaults to Console transport at `info` level.
   */
  constructor(options?: EventLoggerOptions) {
    this.logger = this.createLogger(options);
  }

  /**
   * Logs a successfully published event.
   *
   * @param context - Event metadata to include in the log entry.
   */
  logEventEmitted(context: EventLogContext): void {
    this.logger.info('Event emitted', { ...context });
  }

  /**
   * Logs a successfully consumed and processed event.
   *
   * @param context - Event metadata to include in the log entry.
   */
  logEventConsumed(context: EventLogContext): void {
    this.logger.info('Event consumed', { ...context });
  }

  /**
   * Logs a consumer processing error that will be routed to DLQ.
   *
   * @param context - Event metadata plus error details.
   */
  logEventError(context: EventErrorLogContext): void {
    this.logger.error('Event processing error', { ...context });
  }

  /**
   * Logs an event that has been forwarded to the Dead Letter Queue.
   *
   * @param context - Event metadata plus error details.
   */
  logEventDlq(context: EventErrorLogContext): void {
    this.logger.warn('Event routed to DLQ', { ...context });
  }

  /**
   * Creates a Winston logger instance from the provided options.
   *
   * Falls back to Console transport at `info` level with JSON format
   * when no options are provided.
   */
  private createLogger(options?: EventLoggerOptions): winston.Logger {
    const transports = options?.transports ?? [new winston.transports.Console()];
    const level = options?.level ?? 'info';
    return winston.createLogger({
      level,
      format: winston.format.json(),
      transports,
    });
  }
}

/** Configuration options for {@link EventLoggerService}. */
export interface EventLoggerOptions {
  /** Winston transports. Defaults to Console if not provided. */
  transports?: winston.transport[];
  /** Minimum log level. Defaults to `'info'`. */
  level?: string;
}

/** Metadata context for standard event log entries. */
export interface EventLogContext {
  /** Unique event identifier. */
  eventId: string;
  /** Event type in dot-notation. */
  eventType: string;
  /** NATS subject the event was published/consumed on. */
  subject: string;
  /** Correlation ID for request chain tracing. Optional. */
  correlationId?: string;
  /** OpenTelemetry trace ID. Optional. */
  traceId?: string;
}

/** Metadata context for error and DLQ event log entries. */
export interface EventErrorLogContext extends EventLogContext {
  /** Error message describing the failure. */
  error: string;
  /** Stack trace of the underlying error. Optional. */
  stack?: string;
}
```

### Rule Compliance Verification
- **Lines**: ~120 (under 200 ✅)
- **Method line counts**: all 1-4 lines each (under 50 ✅)
- **Max depth**: 1-2 (methods at depth 1, body at depth 2 max ✅)
- **Max params**: 1 per method (`context` or `options`) ✅
- **Private members**: `logger` and `createLogger` are private ✅
- **Self-documenting**: JSDoc on class and all methods ✅
- **Single-section conditions**: `options?.transports ?? [...]` is a single expression ✅
- **No commented code**: ✅

---

## Step 4: Create EventLoggerService Unit Test

**File**: `src/logging/event-logger.service.spec.ts`

### Design Rationale
- Follow existing test patterns (colocated `*.spec.ts`, Jest with ts-jest)
- Mock Winston to avoid actual logging during tests
- Verify each log method calls the correct Winston level with correct data

### Code

```typescript
import * as winston from 'winston';
import { EventLoggerService } from './event-logger.service';

const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  })),
  format: { json: jest.fn(() => 'mocked-json-format') },
  transports: { Console: jest.fn() },
}));

describe('EventLoggerService', () => {
  const eventContext = {
    eventId: 'evt_test-123',
    eventType: 'payment.proof.uploaded',
    subject: 'company.abc.payment.proof.uploaded.v1',
    correlationId: 'corr-456',
    traceId: 'trace-789',
  };

  const errorContext = {
    ...eventContext,
    error: 'Validation failed',
    stack: 'Error: Validation failed\n    at ...',
  };

  beforeEach(() => {
    mockInfo.mockClear();
    mockWarn.mockClear();
    mockError.mockClear();
  });

  describe('constructor', () => {
    it('creates a Winston logger with default Console transport', () => {
      new EventLoggerService();
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          transports: expect.any(Array),
        }),
      );
    });

    it('creates a Winston logger with custom transports', () => {
      const customTransport = new winston.transports.Console();
      new EventLoggerService({ transports: [customTransport], level: 'debug' });
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          transports: [customTransport],
        }),
      );
    });
  });

  describe('logEventEmitted', () => {
    it('logs at info level with event context', () => {
      const service = new EventLoggerService();
      service.logEventEmitted(eventContext);
      expect(mockInfo).toHaveBeenCalledWith('Event emitted', eventContext);
    });
  });

  describe('logEventConsumed', () => {
    it('logs at info level with event context', () => {
      const service = new EventLoggerService();
      service.logEventConsumed(eventContext);
      expect(mockInfo).toHaveBeenCalledWith('Event consumed', eventContext);
    });
  });

  describe('logEventError', () => {
    it('logs at error level with error context including stack', () => {
      const service = new EventLoggerService();
      service.logEventError(errorContext);
      expect(mockError).toHaveBeenCalledWith('Event processing error', errorContext);
    });
  });

  describe('logEventDlq', () => {
    it('logs at warn level with error context', () => {
      const service = new EventLoggerService();
      service.logEventDlq(errorContext);
      expect(mockWarn).toHaveBeenCalledWith('Event routed to DLQ', errorContext);
    });
  });
});
```

### Rule Compliance Verification
- Test file — not subject to `src/` code limits (but well under 200 lines regardless)
- Follows existing spec patterns (describe/it blocks) ✅

---

## Step 5: Remove .gitkeep Files

Remove the `.gitkeep` placeholder files since the directories now contain real source files.

**Files to delete**:
- `src/common/errors/.gitkeep`
- `src/logging/.gitkeep`

---

## Step 6: Update src/index.ts — Complete Public API Exports

**File**: `src/index.ts`

### Current Content
```typescript
export {};
```

### New Content

```typescript
// ── Constants ──
export { EVENT_ID_PREFIX, LIBRARY_VERSION, DEFAULT_SUBJECT_VERSION } from './common/constants';

// ── Envelope ──
export { EventEnvelope } from './common/envelope/event-envelope.class';
export { EventBase } from './common/envelope/event-base.class';
export { ActorType } from './common/envelope/actor-type.enum';

// ── DTOs ──
export { BuildSubjectDto } from './common/dto/build-subject.dto';

// ── Utils ──
export { SubjectBuilder, buildSubject } from './common/utils/subject.builder';
export { generateUuidV7, generateEventId } from './common/utils/uuid.utils';
export { nowIso } from './common/utils/date.utils';

// ── Errors ──
export { EventConsumerException, EventConsumerExceptionOptions } from './common/errors/event-consumer.exception';

// ── Logging ──
export { EventLoggerService, EventLoggerOptions, EventLogContext, EventErrorLogContext } from './logging/event-logger.service';
```

### Rationale
- Exports everything that currently exists in `src/` plus the two new modules
- Does NOT export unimplemented modules (producer, consumer, outbox, request-reply) — those will be added in their respective implementation tasks
- Exports logger interfaces (`EventLoggerOptions`, `EventLogContext`, `EventErrorLogContext`) for TypeScript consumers who need to type their custom transports or log context objects
- Follows the export structure from `architecture.md` §6, with section header comments for readability

### Rule Compliance Verification
- **Lines**: ~23 (under 200 ✅)
- **No code, only exports** — no indentation, no methods, no conditions to check
- **No commented code**: ✅ (section comments are documentation, not commented-out code)

---

## Step 7: Build Verification

### Commands
```powershell
npm run build
```

### Expected Result
- TypeScript compilation succeeds without errors
- All 4 new files are compiled to `dist/`
- `dist/index.d.ts` includes all 12+ exported symbols

### Failure Recovery
- If build fails, check for missing imports or type errors
- Verify `@nestjs/common` is available (peer dependency — must be installed via `npm install`)
- Verify `winston` is installed (direct dependency)

---

## Step 8: Test Verification

### Commands
```powershell
npm test
```

### Expected Result
- All existing tests pass (subject.builder.spec, date.utils.spec, uuid.utils.spec)
- New EventLoggerService test passes (all 6 test cases)

### Failure Recovery
- If test mock fails, verify Winston import path and mock structure
- Check that `jest.mock('winston', ...)` factory matches the actual Winston API shape

---

## Step 9: Git Commit

### Commands
```powershell
git add src/common/errors/event-consumer.exception.ts src/common/errors/index.ts src/logging/event-logger.service.ts src/logging/event-logger.service.spec.ts src/index.ts
git rm src/common/errors/.gitkeep src/logging/.gitkeep
git commit -m "feat: add EventConsumerException, EventLoggerService, and complete public API barrel"
```

### Commit Message Rationale
- `feat:` prefix — new functionality added
- Describes all three deliverables concisely

---

## Step 10: Code Review Checklist

Reviewer should verify:

### EventConsumerException
- [ ] Extends `Error` with proper `name` override
- [ ] All DLQ-routing context fields present (`eventId`, `eventType`, `correlationId`, `cause`)
- [ ] Constructor uses single options object (max-2-params rule)
- [ ] `Error.captureStackTrace` called for proper stack traces
- [ ] JSDoc present on class, constructor, and all properties

### EventLoggerService
- [ ] `@Injectable()` decorator present
- [ ] Winston `Logger` wrapped with `createLogger` private method
- [ ] Default transports/level when no options provided
- [ ] All four log methods present with correct Winston level calls
- [ ] Each method has exactly 1 parameter (context object)
- [ ] Interfaces exported: `EventLoggerOptions`, `EventLogContext`, `EventErrorLogContext`
- [ ] No methods exceed 50 lines (none exceed 5 lines)
- [ ] No nesting exceeds 2 levels

### index.ts
- [ ] All existing modules exported (constants, envelope, DTOs, utils)
- [ ] New modules exported (errors, logging)
- [ ] Unimplemented modules NOT exported (no broken imports)
- [ ] Logger interfaces exported for consumer TypeScript usage

### Tests
- [ ] All existing tests pass (no regressions)
- [ ] EventLoggerService test covers all 4 log methods
- [ ] EventLoggerService test covers default and custom transport creation
- [ ] Winston is properly mocked (no real console output during tests)

### Build
- [ ] `npm run build` succeeds
- [ ] `dist/` contains `.js` and `.d.ts` for all new files

---

## Summary

| File | Action | Lines | Purpose |
|------|--------|-------|---------|
| `src/common/errors/event-consumer.exception.ts` | Create | ~50 | Exception for consumer DLQ routing |
| `src/common/errors/index.ts` | Create | ~1 | Barrel export |
| `src/logging/event-logger.service.ts` | Create | ~120 | Winston-based structured event logger |
| `src/logging/event-logger.service.spec.ts` | Create | ~90 | Unit tests for logger service |
| `src/common/errors/.gitkeep` | Delete | — | Replaced by real files |
| `src/logging/.gitkeep` | Delete | — | Replaced by real files |
| `src/index.ts` | Update | ~23 | Complete public API barrel exports |
