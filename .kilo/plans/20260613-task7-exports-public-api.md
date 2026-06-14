# Task 7: Exports & Public API — Implementation Plan

## Task

Final review and cleanup of `src/index.ts`; create barrel files for module folders.

## Pre-Analysis

### Current State

- `src/index.ts` (117 lines) — well-organized public API with section headers, but verbose with many direct file-path imports.
- `src/outbox/index.ts` exists — barrel file for the outbox module (20 lines).
- `src/common/errors/index.ts` exists — barrel for error classes (2 lines).
- No barrel files for: `common/envelope/`, `common/utils/`, `common/dto/`, `common/` root, `producer/`, `consumer/`, `logging/`, `request-reply/`.

### Dependency Graph (DAG — no cycles)

```
common (leaf) ← consumed by all
logging (leaf) ← consumed by producer, consumer, outbox, request-reply
producer ← consumed by outbox, request-reply
consumer ← no downstream modules depend on it
outbox ← no downstream modules depend on it
request-reply ← no downstream modules depend on it
```

Cross-module imports verified — no circular dependencies exist. Barrel files will not introduce cycles.

### Symbol Collision Check

All exported symbol names across modules are unique. `export * from` is safe in `src/index.ts`.

## High-Level Approach

1. Create per-directory barrel files (`index.ts`) re-exporting all public symbols from that directory.
2. Create `src/common/index.ts` as an aggregator barrel re-exporting from `constants`, `envelope`, `dto`, `utils`, and `errors`.
3. Rewrite `src/index.ts` to use `export * from` against barrel files, collapsing 117 lines to ~25 lines.
4. Verify zero diagnostics and run test suite.

## Implementation Steps

### Step 1 — Create `src/common/envelope/index.ts`

New barrel file. Re-exports all envelope symbols.

**File**: `src/common/envelope/index.ts`

```typescript
export { EventEnvelope } from './event-envelope.class';
export { EventBase } from './event-base.class';
export { ActorType } from './actor-type.enum';
export { EventContext } from './event-context.interface';
```

### Step 2 — Create `src/common/dto/index.ts`

New barrel file. Single re-export.

**File**: `src/common/dto/index.ts`

```typescript
export { BuildSubjectDto } from './build-subject.dto';
```

### Step 3 — Create `src/common/utils/index.ts`

New barrel file. Re-exports all utility functions from the 6 utility source files (excludes `*.spec.ts`).

**File**: `src/common/utils/index.ts`

```typescript
export { SubjectBuilder, buildSubject } from './subject.builder';
export { generateUuidV7, generateEventId } from './uuid.utils';
export { nowIso } from './date.utils';
export { createEvent } from './event.factory';
export { encodeEvent, decodeEvent } from './serialization.utils';
export {
  sanitizeCompanyId,
  assertValidCompanyId,
  validateSubject,
  sanitizeSubjectPart,
} from './security.utils';
```

### Step 4 — Create `src/common/index.ts`

New aggregator barrel. Re-exports from `constants.ts` and the three sub-barrels created above plus the existing `errors/index.ts`.

**File**: `src/common/index.ts`

```typescript
export * from './constants';
export * from './envelope';
export * from './dto';
export * from './utils';
export * from './errors';
```

### Step 5 — Create `src/producer/index.ts`

New barrel file. Re-exports from producer module, service, and decorators.

**File**: `src/producer/index.ts`

```typescript
export { ProducerService, EmitOptions } from './producer.service';
export {
  ProducerModule,
  JETSTREAM_TOKEN,
  ProducerModuleOptions,
  ProducerModuleAsyncOptions,
} from './producer.module';
export { EmitEvent, EMIT_EVENT_METADATA, EmitEventOptions } from './decorators/emit-event.decorator';
export { EmitEventInterceptor } from './decorators/emit-event-interceptor';
```

### Step 6 — Create `src/consumer/index.ts`

New barrel file. Re-exports from consumer module, services, decorators, and all interfaces.

**File**: `src/consumer/index.ts`

```typescript
export { ConsumerService, EventHandler } from './consumer.service';
export { JetStreamConsumerService } from './jetstream-consumer.service';
export {
  ConsumerModule,
  CONSUMER_MODULE_OPTIONS,
  ConsumerModuleOptions,
  ConsumerModuleAsyncOptions,
} from './consumer.module';
export { OnEvent, ON_EVENT_METADATA, OnEventOptions } from './decorators/on-event.decorator';
export { OnEventExplorer } from './decorators/on-event.explorer';
export {
  ON_EVENT_EXPLORER_DEPS_TOKEN,
  OnEventExplorerDeps,
} from './decorators/on-event-explorer-deps.interface';
export { DispatchOptions } from './dispatch-options.interface';
export {
  SubscribeOptions,
  ConsumerSubscribeOpts,
  defaultDlqSubjectBuilder,
  envelopeToContext,
} from './subscribe-options.interface';
export { JetStreamConsumerDeps, JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
```

### Step 7 — Create `src/logging/index.ts`

New barrel file. Single source file re-export.

**File**: `src/logging/index.ts`

```typescript
export {
  EventLoggerService,
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from './event-logger.service';
```

### Step 8 — Create `src/request-reply/index.ts`

New barrel file. Re-exports from service and types.

**File**: `src/request-reply/index.ts`

```typescript
export { RequestReplyService } from './request-reply.service';
export {
  RequestReplyConfig,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  RequestReplyDeps,
  NATS_CONNECTION_TOKEN,
  REQUEST_REPLY_CONFIG_TOKEN,
  REQUEST_REPLY_DEPS_TOKEN,
  resolveRequestReplyConfig,
} from './request-reply.types';
```

### Step 9 — Rewrite `src/index.ts`

Replace all individual file-path exports with `export * from` barrel imports. Root-level files (`events-toolkit.module.ts`, `events-toolkit-options.interface.ts`) kept as named exports since they aren't in a subfolder.

**File**: `src/index.ts` (overwrite)

```typescript
// ── Common ──
export * from './common';

// ── Logging ──
export * from './logging';

// ── Producer ──
export * from './producer';

// ── Consumer ──
export * from './consumer';

// ── Request-Reply ──
export * from './request-reply';

// ── Outbox ──
export * from './outbox';

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

Lines reduced: 117 → 25.

### Step 10 — Verify Diagnostics

Run VS Code diagnostics and TypeScript compilation check.

```bash
npx tsc --noEmit
```

### Step 11 — Run Tests

```bash
npx jest --passWithNoTests
```

### Step 12 — Update `.agent/project-structure.md`

Add barrel file notations to the comments for each folder that now has an `index.ts`.

## Files Created (8)

| File | Purpose |
|------|---------|
| `src/common/envelope/index.ts` | Barrel for EventEnvelope, EventBase, ActorType, EventContext |
| `src/common/dto/index.ts` | Barrel for BuildSubjectDto |
| `src/common/utils/index.ts` | Barrel for all utility functions |
| `src/common/index.ts` | Aggregator barrel for all common/ sub-modules |
| `src/producer/index.ts` | Barrel for producer module, service, decorators |
| `src/consumer/index.ts` | Barrel for consumer module, services, decorators, interfaces |
| `src/logging/index.ts` | Barrel for EventLoggerService and all log context types |
| `src/request-reply/index.ts` | Barrel for RequestReplyService and type definitions |

## Files Modified (2)

| File | Change |
|------|--------|
| `src/index.ts` | Replace 117-line verbose exports with `export * from` barrel imports (~25 lines) |
| `.agent/project-structure.md` | Add barrel file notations |

## Verification Checklist

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npx jest --passWithNoTests` passes
- [ ] No circular dependency warnings
- [ ] All symbols previously exported from `src/index.ts` still accessible through barrel chain
- [ ] Project structure file updated
