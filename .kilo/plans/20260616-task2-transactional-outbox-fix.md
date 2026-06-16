# Task 2: Transactional Outbox Hook — Fix Plan

## Issues Found

1. **`src/outbox/outbox.service.ts` exceeds the max 200 lines per file rule**
   - Current size: **211 lines**.
   - Project rule: source code files in `src/` must not exceed 200 lines.
   - The file was already at the limit before this task; adding `saveInTransaction` pushed it to 211 lines.

## Proposed Fix

Extract the private logging helper methods from `OutboxService` into a dedicated helper file. This is the lowest-risk refactor and does not change any public API or behavior.

### Step 1: Create `src/outbox/outbox-logging.helpers.ts`

Move the following private methods from `OutboxService` as exported pure functions:

- `logOutboxSaved`
- `toOutboxLogContext`
- `toOutboxErrorLogContext`
- `logProcessorError`

Use single-parameter objects where needed to comply with the max-2-params rule:

```typescript
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { OutboxLogContext, OutboxErrorLogContext, EventLoggerService } from '../logging/event-logger.service';
import { OutboxEntry } from './outbox.types';
import { OutboxErrorContextParams } from './outbox-error-context-params.interface';
import { parseEnvelope } from './outbox.utils';

export function logOutboxSaved(params: {
  event: EventEnvelope<unknown>;
  subject: string;
  logger: EventLoggerService;
}): void {
  const { event, subject, logger } = params;
  logger.logOutboxSaved({
    eventId: event.id,
    eventType: event.type,
    subject,
    attempt: 0,
    correlationId: event.correlation_id,
    traceId: event.trace_id,
  });
}

export function toOutboxLogContext(entry: OutboxEntry): OutboxLogContext {
  const envelope = parseEnvelope(entry);
  return {
    eventId: entry.id,
    eventType: envelope.type,
    subject: entry.subject,
    attempt: entry.attempts + 1,
    correlationId: envelope.correlation_id,
    traceId: envelope.trace_id,
  };
}

export function toOutboxErrorLogContext(params: OutboxErrorContextParams): OutboxErrorLogContext {
  const { entry, attempt, error } = params;
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    ...toOutboxLogContext(entry),
    attempt,
    error: err.message,
    stack: err.stack,
  };
}

export function logProcessorError(params: { error: unknown; logger: EventLoggerService }): void {
  const { error, logger } = params;
  const err = error instanceof Error ? error : new Error(String(error));
  logger.logEventError({
    eventId: 'unknown',
    eventType: 'unknown',
    subject: 'outbox-processor',
    error: err.message,
    stack: err.stack,
  });
}
```

### Step 2: Refactor `src/outbox/outbox.service.ts`

1. Import the new helpers:

```typescript
import {
  logOutboxSaved,
  toOutboxLogContext,
  toOutboxErrorLogContext,
  logProcessorError,
} from './outbox-logging.helpers';
```

2. Remove the four private logging methods from `OutboxService`.
3. Update call sites:
   - `this.logOutboxSaved(event, subject)` → `logOutboxSaved({ event, subject, logger: this.logger })`
   - `this.toOutboxLogContext(entry)` → `toOutboxLogContext(entry)`
   - `this.toOutboxErrorLogContext({ entry, attempt, error })` → `toOutboxErrorLogContext({ entry, attempt, error })`
   - `this.logProcessorError(error)` → `logProcessorError({ error, logger: this.logger })`

Expected result: `outbox.service.ts` should be reduced to approximately **170 lines**, well under the 200-line limit.

### Step 3: Update barrel exports if needed

The new helper file is internal and should **not** be re-exported from `src/outbox/index.ts`.

### Step 4: Verification

Run the following commands and ensure all pass:

```bash
npm run lint
npm run typecheck
npm run test -- --testPathPattern="outbox"
npm run build
```

### Step 5: Commit

Commit the refactor with a meaningful message:

```text
refactor(outbox): extract logging helpers to reduce OutboxService file size
```

## Files to Modify

| File | Action |
|------|--------|
| `src/outbox/outbox-logging.helpers.ts` | Create new file with logging helper functions |
| `src/outbox/outbox.service.ts` | Import helpers, remove private logging methods, update call sites |

## Files NOT to Modify

- Public API surface (`src/outbox/index.ts`) remains unchanged.
- No changes to tests, docs, or other outbox files.
