# Task 5: Final Polish & Configuration — Implementation Plan

**Plan Date**: 2026-06-14
**Task**: Design & implement unified `EventsToolkitModule` + security helpers
**Branch**: `feat/outbox-logging-polish-finalization`

---

## Pre-Analysis

### Current State

| Module | Status | Pattern |
|--------|--------|---------|
| `ProducerModule` | Complete | `forRoot(options)` + `forRootAsync(asyncOptions)`, global |
| `ConsumerModule` | Complete | `forRoot(options)` + `forRootAsync(asyncOptions)`, global |
| `OutboxModule` | Complete | `forRoot(options)` + `forRootAsync(asyncOptions)`, global, SQLite + PostgreSQL |
| `EventLoggerService` | Complete | Injectable, optional `EventLoggerOptions` constructor param |
| `buildDlqSubject` | Complete | Exists in `src/outbox/outbox.utils.ts` |
| `OutboxService.OnModuleDestroy` | Complete | Graceful processor shutdown |
| Unified module | **Missing** | No `EventsToolkitModule` exists |
| Security utils | **Missing** | No sanitization/validation utilities |

### Design Constraints (from `.agent/RULES.md`)

- Max 200 lines per file (ideally ≤125 excluding blanks/comments/imports)
- Max 50 lines per method
- Max 2 params per method (use param objects)
- Max 2 levels of indentation
- Prefer private members, self-documenting code, no commented code

---

## High-Level Approach

1. **Split concerns**: Options interfaces in `src/events-toolkit-options.interface.ts`, module class in `src/events-toolkit.module.ts`. Both files stay under 125 lines of code.
2. **Unified NATS resolution**: `EventsToolkitModule.forRoot` resolves NATS connection once from `nats.servers` or `nats.connection`, shares JetStream with Producer and Consumer sub-modules.
3. **Composition via imports**: Module `imports` ProducerModule, ConsumerModule (conditionally), OutboxModule (conditionally). Re-exports their public services.
4. **Centralized logging**: Overrides `EventLoggerService` provider with user-configured transports/level.
5. **Graceful shutdown**: Registers `OnModuleDestroy` to close the NATS connection if the module created it (not if user-provided).
6. **Security utilities**: New `src/common/utils/security.utils.ts` with `sanitizeCompanyId`, `validateSubject`, `assertValidCompanyId`, `sanitizeSubjectPart`.
7. **Barrel exports**: Update `src/index.ts` to export new module, options interfaces, and security utils.
8. **Project structure**: Update `.agent/project-structure.md`.

---

## Detailed Steps

### Step 1: Create `src/events-toolkit-options.interface.ts`

**File**: `src/events-toolkit-options.interface.ts` (NEW)

**Content specification**:

```ts
import { NatsConnection } from 'nats';
import { OutboxServiceOptions } from './outbox/outbox-service-options.interface';
import { EntityManagerLike } from './outbox/outbox.types';
import { Type, DynamicModule, ForwardReference } from '@nestjs/common';
import * as winston from 'winston';

/** NATS connection configuration for EventsToolkitModule. */
export interface EventsToolkitNatsOptions {
  /** Array of NATS server URLs (e.g. ['nats://localhost:4222']). Creates a new connection. */
  servers?: string | string[];
  /** Pre-existing NATS connection. Takes precedence over `servers`. Module won't close it. */
  connection?: NatsConnection;
}

/** Outbox persistence configuration. */
export interface EventsToolkitOutboxOptions {
  /** Backend type: 'sqlite' for file-based, 'postgres' for existing DB gateway. */
  type: 'sqlite' | 'postgres';
  /** Path to SQLite database file. Default: ':memory:'. */
  sqlitePath?: string;
  /** PostgreSQL TypeORM-like entity manager. Required when type is 'postgres'. */
  postgres?: { entityManager: EntityManagerLike };
  /** Background processor tuning. */
  serviceOptions?: OutboxServiceOptions;
}

/** Logging configuration passed to EventLoggerService. */
export interface EventsToolkitLoggingOptions {
  /** Minimum Winston log level. Default: 'info'. */
  level?: string;
  /** Custom Winston transports. Default: Console transport. */
  transports?: winston.transport[];
}

/** Consumer subsystem toggle and options. */
export interface EventsToolkitConsumerOptions {
  /** Enable JetStream consumer. Default: true. */
  enable?: boolean;
  /** Custom DLQ subject builder for consumer errors. Default: prepends 'dlq.'. */
  dlqSubjectBuilder?: (subject: string) => string;
}

/** Top-level options for EventsToolkitModule.forRoot. */
export interface EventsToolkitModuleOptions {
  nats: EventsToolkitNatsOptions;
  outbox?: EventsToolkitOutboxOptions;
  logging?: EventsToolkitLoggingOptions;
  consumer?: EventsToolkitConsumerOptions;
}

/** Asynchronous options for EventsToolkitModule.forRootAsync. */
export interface EventsToolkitModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: (...args: unknown[]) => Promise<EventsToolkitModuleOptions> | EventsToolkitModuleOptions;
  inject?: Array<string | symbol | Type<unknown>>;
}
```

**Line budget**: ~70 lines total (~35 code lines excluding blanks/comments/imports). ✓ Within limits.

---

### Step 2: Create `src/events-toolkit.module.ts`

**File**: `src/events-toolkit.module.ts` (NEW)

**Design**:

The module composes existing sub-modules via NestJS `imports`. Key design points:

1. **NATS resolution**: If `nats.servers` is provided, `nats.connect(servers)` creates a new connection. If `nats.connection` is provided, use it directly. JetStream is obtained via `connection.jetstream()`.
2. **ProducerModule integration**: Always imported. Receives the resolved JetStream client.
3. **ConsumerModule integration**: Conditionally imported (default: enabled). Receives JetStream + dlqSubjectBuilder.
4. **OutboxModule integration**: Conditionally imported (only if `options.outbox` is defined). Receives type, sqlitePath, postgres entityManager, serviceOptions.
5. **EventLoggerService override**: Provided with custom transports/level from `options.logging`. This overrides the default providers in ProducerModule/ConsumerModule via NestJS DI precedence.
6. **Graceful shutdown**: `OnModuleDestroy` hook on the module class. Closes the NATS connection ONLY if the module created it (tracked via boolean flag). OutboxService already handles its own shutdown.

**Content specification**:

```ts
import { DynamicModule, Module, OnModuleDestroy, Provider } from '@nestjs/common';
import { NatsConnection, connect } from 'nats';
import { JetStreamClient } from 'nats';
import { ProducerModule, JETSTREAM_TOKEN } from './producer/producer.module';
import { ConsumerModule, ConsumerModuleOptions } from './consumer/consumer.module';
import { OutboxModule, OutboxModuleOptions } from './outbox/outbox.types';
import { EventLoggerService } from './logging/event-logger.service';
import { ProducerService } from './producer/producer.service';
import { ConsumerService } from './consumer/consumer.service';
import { OutboxService } from './outbox/outbox.service';
import {
  EventsToolkitModuleOptions,
  EventsToolkitModuleAsyncOptions,
} from './events-toolkit-options.interface';

const EVENTS_TOOLKIT_MODULE_OPTIONS = 'EVENTS_TOOLKIT_MODULE_OPTIONS';

@Module({})
export class EventsToolkitModule implements OnModuleDestroy {
  private static ownedConnection: NatsConnection | null = null;

  static forRoot(options: EventsToolkitModuleOptions): DynamicModule {
    const resolved = resolveConnection(options);
    const imports = buildImports(options, resolved.jetStream);
    const loggingProvider = buildLoggingProvider(options);

    return {
      module: EventsToolkitModule,
      imports,
      providers: [loggingProvider],
      exports: [ProducerService, ConsumerService, OutboxService, EventLoggerService],
    };
  }

  static forRootAsync(asyncOptions: EventsToolkitModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: EVENTS_TOOLKIT_MODULE_OPTIONS,
      useFactory: async (...args: unknown[]): Promise<EventsToolkitModuleOptions> =>
        asyncOptions.useFactory(...args),
      inject: asyncOptions.inject ?? [],
    };

    const jetStreamProvider: Provider = {
      provide: JETSTREAM_TOKEN,
      useFactory: async (opts: EventsToolkitModuleOptions) => {
        const resolved = resolveConnection(opts);
        return resolved.jetStream;
      },
      inject: [EVENTS_TOOLKIT_MODULE_OPTIONS],
    };

    return {
      module: EventsToolkitModule,
      imports: [...(asyncOptions.imports ?? [])],
      providers: [optionsProvider, jetStreamProvider],
      exports: [],
    };
  }

  onModuleDestroy(): void {
    if (EventsToolkitModule.ownedConnection) {
      EventsToolkitModule.ownedConnection.close();
      EventsToolkitModule.ownedConnection = null;
    }
  }
}
```

**Note on `forRootAsync`**: The async variant imports ProducerModule, ConsumerModule, and OutboxModule with their own `forRootAsync` methods using the same JetStream token. This requires a coordinating approach — the simplest implementation uses ProducerModule.forRootAsync, ConsumerModule.forRootAsync, and OutboxModule.forRootAsync in the `imports` of the returned DynamicModule, each resolving from the module options.

**Line budget**: ~120 lines total (~95 code lines excluding blanks/comments). ✓ Within 125 ideal.  

**Detailed sub-steps**:

1. **`resolveConnection`** helper (private, ~15 lines):
   - If `options.nats.connection` → use it, set `ownedConnection = null`.
   - Else if `options.nats.servers` → `await connect({ servers })`, store in `ownedConnection`.
   - Get `jetStream` via `connection.jetstream()`.
   - Return `{ connection, jetStream }`.

2. **`buildImports`** helper (private, ~20 lines):
   - Always add `ProducerModule.forRoot({ jetStream })`.
   - If consumer enabled (default true) → add `ConsumerModule.forRoot({ jetStream, dlqSubjectBuilder })`.
   - If outbox defined → map to `OutboxModuleOptions` and add `OutboxModule.forRoot(...)`.
   - Return imports array.

3. **`buildLoggingProvider`** helper (private, ~8 lines):
   - If `options.logging` → `useFactory` with injected `EventLoggerOptions`.
   - Else → `useClass: EventLoggerService` (default).

4. **`mapOutboxOptions`** helper (private, ~10 lines):
   - Maps `EventsToolkitOutboxOptions` to `OutboxModuleOptions`.
   - `sqlitePath` → `sqlite: { dbPath }`.
   - `postgres` → `postgres: { entityManager }`.

---

### Step 3: Create `src/common/utils/security.utils.ts`

**File**: `src/common/utils/security.utils.ts` (NEW)

**Content specification**:

```ts
/** Regex matching dashless UUID format (32 hex chars). */
const DASHLESS_UUID_PATTERN = /^[0-9a-f]{32}$/i;

/** Regex matching dashed UUID format. */
const DASHED_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Regex matching a valid NATS subject per the event-messaging convention. */
const SUBJECT_PATTERN = /^company\.[0-9a-f]{32}\.[a-z][a-z0-99-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.v[0-9]+$/;

/** Regex for safe subject parts: lowercase alphanumeric + hyphens, no dots, no wildcards. */
const SAFE_SUBJECT_PART_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Normalizes a company ID to dashless lowercase format.
 *
 * Accepts both dashed and dashless UUIDs, strips whitespace and dashes,
 * and validates the resulting string is a 32-character hex UUID.
 *
 * @param companyId - Raw company ID from user input.
 * @returns Normalized dashless lowercase UUID.
 * @throws {Error} If the input is not a valid UUID.
 */
export function sanitizeCompanyId(companyId: string): string {
  const normalized = companyId.trim().toLowerCase().replace(/-/g, '');
  if (!DASHLESS_UUID_PATTERN.test(normalized)) {
    throw new Error(`Invalid company ID: "${companyId}" is not a valid UUID`);
  }
  return normalized;
}

/**
 * Asserts that a company ID is a valid UUID (dashed or dashless).
 *
 * Use this as a guard before processing events or building subjects.
 *
 * @param companyId - Company ID to validate.
 * @throws {Error} If not a valid UUID.
 */
export function assertValidCompanyId(companyId: string): void {
  const trimmed = companyId.trim();
  const isValid = DASHED_UUID_PATTERN.test(trimmed) || DASHLESS_UUID_PATTERN.test(trimmed);
  if (!isValid) {
    throw new Error(`Invalid company ID: "${companyId}" is not a valid UUID`);
  }
}

/**
 * Validates that a subject string conforms to the event-messaging convention.
 *
 * Expected format: `company.{dashless_uuid}.{domain}.{entity}.{action}.v{version}`
 *
 * @param subject - The NATS subject to validate.
 * @returns `true` if the subject matches the convention pattern.
 */
export function validateSubject(subject: string): boolean {
  return SUBJECT_PATTERN.test(subject);
}

/**
 * Sanitizes a subject part (domain, entity, action) to prevent injection.
 *
 * Removes dots, spaces, and special characters, keeping only lowercase
 * alphanumeric characters and hyphens. Throws if the result is empty.
 *
 * @param part - Raw subject part from user input.
 * @returns Sanitized lowercase string safe for use in NATS subjects.
 * @throws {Error} If the sanitized result is empty.
 */
export function sanitizeSubjectPart(part: string): string {
  const sanitized = part
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (sanitized.length === 0) {
    throw new Error(`Invalid subject part: "${part}" produced an empty string after sanitization`);
  }
  return sanitized;
}
```

**Line budget**: ~90 lines total (~60 code lines). ✓ Well within limits.

**Design notes**:
- `sanitizeCompanyId` normalizes to dashless format, matching what `SubjectBuilder.build()` expects (it strips dashes internally).
- `sanitizeSubjectPart` prevents NATS subject injection by stripping dots (which are subject token separators), wildcards (`*`, `>`), and other dangerous characters.
- `assertValidCompanyId` is a pure validation guard — no transformation, just a throw if invalid.
- `validateSubject` provides boolean validation for consumers that need to check incoming subjects.
- The SUBJECT_PATTERN is stricter than just checking format — it enforces lowercase domain/entity/action and a leading lowercase letter.
- **Note**: There's a typo in SUBJECT_PATTERN with `[a-z0-99-]` — it should be `[a-z0-9-]`. Will correct in implementation.

---

### Step 4: Update `src/index.ts`

**File**: `src/index.ts` (MODIFY)

**Actions**:
1. Add exports for the new unified module:
   ```ts
   // ── Events Toolkit (Unified) ──
   export { EventsToolkitModule } from './events-toolkit.module';
   export {
     EventsToolkitModuleOptions,
     EventsToolkitModuleAsyncOptions,
     EventsToolkitNatsOptions,
     EventsToolkitOutboxOptions,
     EventsToolkitLoggingOptions,
     EventsToolkitConsumerOptions,
   } from './events-toolkit-options.interface';
   ```

2. Add exports for security utilities:
   ```ts
   export {
     sanitizeCompanyId,
     assertValidCompanyId,
     validateSubject,
     sanitizeSubjectPart,
   } from './common/utils/security.utils';
   ```

**Line budget**: ~20 lines added to existing ~70-line file. Total ~90 lines. ✓

---

### Step 5: Update `.agent/project-structure.md`

**File**: `.agent/project-structure.md` (MODIFY)

**Actions**:
1. Add to `# Folders in src/`:
   ```
   - common/utils/ - SubjectBuilder, EventFactory, UUID, date, serialization, and security utilities
   ```
   (Wait — `common/utils/` already exists. Check current entry.)
   
   Current entry: `- common/utils/ - SubjectBuilder, EventFactory, UUID and date utilities`
   
   Update to: `- common/utils/ - SubjectBuilder, EventFactory, UUID, date, serialization, and security utilities`

2. The new files `events-toolkit.module.ts` and `events-toolkit-options.interface.ts` are at `src/` root, not in a subfolder. Add:
   ```
   - (root files) - events-toolkit.module.ts (unified module), events-toolkit-options.interface.ts (configuration types)
   ```
   
   Or follow the existing pattern for root-level files: there's no explicit entry for `src/index.ts`, so root-level modules may not need explicit entries. The brief.md already documents the structure. Minimal change: just update `common/utils/` description.

**Minimal update**: Only update `common/utils/` description to reflect new security utils. The new module files at `src/` root level don't require a folder entry.

---

### Step 6: Code Review Preparation

After implementation, verify:
1. `EventsToolkitModule.forRoot` composes all sub-modules correctly.
2. `forRootAsync` pattern matches existing async modules.
3. NATS connection lifecycle: created connections are closed, user-provided connections are untouched.
4. Security utils handle edge cases: empty strings, invalid UUIDs, special characters, injection attempts.
5. All new exports appear in `src/index.ts`.
6. No files exceed line limits.
7. All methods stay under 2 params and 50 lines.
8. No commented-out code.
9. Private helpers marked as `private`.

---

### Step 7: Unit Tests (Optional — if time permits)

Test files to create:
- `src/common/utils/security.utils.spec.ts` — test all 4 functions with valid/invalid/edge inputs
- `src/events-toolkit.module.spec.ts` — test module registration and option resolution

---

## Summary of Changes

| Action | File | Type |
|--------|------|------|
| CREATE | `src/events-toolkit-options.interface.ts` | New interface definitions |
| CREATE | `src/events-toolkit.module.ts` | New unified module class |
| CREATE | `src/common/utils/security.utils.ts` | New security/sanitization utilities |
| MODIFY | `src/index.ts` | Add barrel exports |
| MODIFY | `.agent/project-structure.md` | Update `common/utils/` description |

**Total new files**: 3
**Total modified files**: 2
**No deletions**.

---

## Verification Checklist

- [ ] `EventsToolkitModule.forRoot` accepts `{ nats, outbox?, logging?, consumer? }` and returns `DynamicModule`
- [ ] `EventsToolkitModule.forRootAsync` follows same `useFactory` pattern as `ProducerModule.forRootAsync`
- [ ] NATS connection created from `nats.servers` is closed on `OnModuleDestroy`
- [ ] Pre-existing `nats.connection` is NOT closed on `OnModuleDestroy`
- [ ] OutboxModule imported conditionally only when `options.outbox` is defined
- [ ] ConsumerModule respects `consumer.enable` flag
- [ ] `EventLoggerService` overridden with custom transports/level when `options.logging` defined
- [ ] `sanitizeCompanyId` normalizes UUID and throws on invalid input
- [ ] `assertValidCompanyId` validates both dashed and dashless UUIDs
- [ ] `validateSubject` correctly matches convention pattern
- [ ] `sanitizeSubjectPart` strips injection characters (dots, wildcards, etc.)
- [ ] All new exports present in `src/index.ts`
- [ ] No files exceed 200 lines total or 125 code lines
- [ ] No methods exceed 50 lines
- [ ] Max 2 params per method
- [ ] All existing module functionality preserved
