# Fix Plan: Task 2 — Outbox Service Code Review

**Task**: Task 2 — Outbox Service (Step 4.3 Code Review fixes)
**Date**: 2026-06-13
**Branch**: feat/outbox-logging-polish-finalization
**Project**: cobranza-apps/events-toolkit

---

## Summary

The OutboxService implementation is functionally well-structured but has **rule violations** and a **critical retry correctness bug** caused by the repository layer. This plan fixes all identified issues.

---

## Issues Found

### 1. Multi-section boolean condition in `OutboxService.startProcessor`
- **File**: `src/outbox/outbox.service.ts`
- **Rule**: Single-section boolean conditions
- **Issue**: `if (!this.options.enabled || this.hasProcessorStarted())` combines two boolean sections with `||`.
- **Fix**: Extract to a private `shouldStartProcessor()` helper method.

### 2. Method exceeds max 2 parameters
- **File**: `src/outbox/outbox.service.ts`
- **Rule**: Max arguments per method
- **Issue**: `toOutboxErrorLogContext(entry, attempt, error)` accepts 3 parameters.
- **Fix**: Introduce `OutboxErrorContextParams` interface in a new file and accept a single params object.

### 3. Factory function exceeds max 2 parameters
- **File**: `src/outbox/outbox.module.ts`
- **Rule**: Max arguments per function
- **Issue**: The `depsProvider.useFactory` in both `forRoot` and `forRootAsync` accepts 4 injected parameters.
- **Fix**: Split into two intermediate pair providers, following the pattern already used in `ConsumerModule`.

### 4. Processor lock not released on repository failure
- **File**: `src/outbox/outbox.service.ts`
- **Issue**: `processPendingEvents` resets `isProcessing` only after the loop. If `repository.getPending()` throws, `isProcessing` stays `true` forever and the processor stops handling events.
- **Fix**: Wrap the processing body in `try/finally` to guarantee `isProcessing` is reset.

### 5. Retry logic is broken because `markAsFailed` sets status to `failed`
- **Files**: `src/outbox/sqlite-outbox.repository.ts`, `src/outbox/postgres-outbox.repository.ts`
- **Issue**: `UPDATE_FAILED_SQL` sets `status = 'failed'`. Because `getPending` filters on `status = 'pending'`, failed entries are never retried and never reach DLQ through the scheduled processor.
- **Fix**: Keep `status = 'pending'` in `UPDATE_FAILED_SQL` so the entry remains eligible for retry until it is routed to DLQ and marked as `sent`.

### 6. Line-count risk in `outbox.service.ts`
- **File**: `src/outbox/outbox.service.ts`
- **Issue**: The file is at 199 lines. Adding the helper method and `try/finally` would push it over the 200-line hard limit.
- **Fix**: Remove JSDoc comments from all private methods (keep class and public API docs) to comply with the self-documenting code rule and free enough lines.

---

## Detailed Changes

### A. `src/outbox/outbox.service.ts`

1. Replace the boolean condition in `startProcessor`:

```typescript
  startProcessor(): void {
    if (!this.shouldStartProcessor()) {
      return;
    }
    this.processorIntervalId = setInterval(() => {
      this.processPendingEvents().catch((error: unknown) => this.logProcessorError(error));
    }, this.options.processorIntervalMs);
  }
```

2. Add the helper method:

```typescript
  private shouldStartProcessor(): boolean {
    if (!this.options.enabled) {
      return false;
    }
    return !this.hasProcessorStarted();
  }
```

3. Guard `isProcessing` reset with `try/finally`:

```typescript
  private async processPendingEvents(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      const entries = await this.repository.getPending(PENDING_BATCH_SIZE);
      for (const entry of entries) {
        await this.processSingleEntry(entry);
      }
    } finally {
      this.isProcessing = false;
    }
  }
```

4. Remove JSDoc blocks from all `private` methods. Keep JSDoc for the class and for the public methods (`saveToOutbox`, `startProcessor`, `stopProcessor`, `onModuleDestroy`).

5. Update `toOutboxErrorLogContext` to accept a single params object and import `OutboxErrorContextParams`:

```typescript
import { OutboxErrorContextParams } from './outbox-error-context-params.interface';

// ...

  private toOutboxErrorLogContext(params: OutboxErrorContextParams): OutboxErrorLogContext {
    const { entry, attempt, error } = params;
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ...this.toOutboxLogContext(entry),
      attempt,
      error: err.message,
      stack: err.stack,
    };
  }
```

6. Update call sites:

```typescript
// inside onPublishError
this.logger.logOutboxFailed(this.toOutboxErrorLogContext({ entry, attempt: nextAttempt, error }));

// inside routeToDlq
this.logger.logOutboxDlq(this.toOutboxErrorLogContext({ entry, attempt: entry.attempts + 1, error: lastError }));
```

### B. New file: `src/outbox/outbox-error-context-params.interface.ts`

```typescript
import { OutboxEntry } from './outbox.types';

/** Parameters for building an outbox error log context. */
export interface OutboxErrorContextParams {
  /** Outbox entry being processed. */
  entry: OutboxEntry;
  /** Current delivery attempt number. */
  attempt: number;
  /** Error that occurred during processing. */
  error: unknown;
}
```

This file is internal and does not need to be re-exported from barrel files.

### C. `src/outbox/outbox.module.ts`

1. Add two provider tokens and type aliases near the top of the file:

```typescript
const OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN = 'OUTBOX_SERVICE_BASE_DEPS_PAIR';
const OUTBOX_SERVICE_CONFIG_PAIR_TOKEN = 'OUTBOX_SERVICE_CONFIG_PAIR';

type OutboxServiceBaseDepsPair = Pick<OutboxServiceDeps, 'producerService' | 'logger'>;
type OutboxServiceConfigPair = Pick<OutboxServiceDeps, 'repository' | 'options'>;
```

2. In `forRoot`, replace the single `depsProvider` with three 2-parameter providers:

```typescript
    const baseDepsPairProvider: Provider = {
      provide: OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN,
      useFactory: (producerService: ProducerService, logger: EventLoggerService): OutboxServiceBaseDepsPair => ({
        producerService,
        logger,
      }),
      inject: [ProducerService, EventLoggerService],
    };

    const configPairProvider: Provider = {
      provide: OUTBOX_SERVICE_CONFIG_PAIR_TOKEN,
      useFactory: (repository: OutboxRepository, options: OutboxServiceOptions): OutboxServiceConfigPair => ({
        repository,
        options,
      }),
      inject: [OUTBOX_REPOSITORY_TOKEN, OUTBOX_SERVICE_OPTIONS_TOKEN],
    };

    const depsProvider: Provider = {
      provide: OUTBOX_SERVICE_DEPS_TOKEN,
      useFactory: (base: OutboxServiceBaseDepsPair, config: OutboxServiceConfigPair): OutboxServiceDeps => ({
        ...base,
        ...config,
      }),
      inject: [OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN, OUTBOX_SERVICE_CONFIG_PAIR_TOKEN],
    };
```

3. Add `baseDepsPairProvider` and `configPairProvider` to the `providers` array in `forRoot`:

```typescript
      providers: [
        { provide: OUTBOX_REPOSITORY_TOKEN, useValue: repository },
        serviceOptionsProvider,
        baseDepsPairProvider,
        configPairProvider,
        depsProvider,
        OutboxService,
      ],
```

4. Repeat steps 2 and 3 in `forRootAsync`:

```typescript
    const baseDepsPairProvider: Provider = {
      provide: OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN,
      useFactory: (producerService: ProducerService, logger: EventLoggerService): OutboxServiceBaseDepsPair => ({
        producerService,
        logger,
      }),
      inject: [ProducerService, EventLoggerService],
    };

    const configPairProvider: Provider = {
      provide: OUTBOX_SERVICE_CONFIG_PAIR_TOKEN,
      useFactory: (repository: OutboxRepository, options: OutboxServiceOptions): OutboxServiceConfigPair => ({
        repository,
        options,
      }),
      inject: [OUTBOX_REPOSITORY_TOKEN, OUTBOX_SERVICE_OPTIONS_TOKEN],
    };

    const depsProvider: Provider = {
      provide: OUTBOX_SERVICE_DEPS_TOKEN,
      useFactory: (base: OutboxServiceBaseDepsPair, config: OutboxServiceConfigPair): OutboxServiceDeps => ({
        ...base,
        ...config,
      }),
      inject: [OUTBOX_SERVICE_BASE_DEPS_PAIR_TOKEN, OUTBOX_SERVICE_CONFIG_PAIR_TOKEN],
    };
```

```typescript
      providers: [
        moduleOptionsProvider,
        repositoryProvider,
        serviceOptionsProvider,
        baseDepsPairProvider,
        configPairProvider,
        depsProvider,
        OutboxService,
      ],
```

### D. `src/outbox/sqlite-outbox.repository.ts`

Change `UPDATE_FAILED_SQL` to keep the entry pending for retry:

```typescript
const UPDATE_FAILED_SQL = `
  UPDATE outbox
  SET status = 'pending', attempts = attempts + 1, last_error = @last_error, updated_at = @updated_at
  WHERE id = @id
`;
```

### E. `src/outbox/postgres-outbox.repository.ts`

Change `UPDATE_FAILED_SQL` to keep the entry pending for retry:

```typescript
const UPDATE_FAILED_SQL = `
  UPDATE outbox SET status = 'pending', attempts = attempts + 1, last_error = $2, updated_at = $3 WHERE id = $1
`;
```

### F. `src/outbox/outbox.types.ts`

Clarify the contract of `markAsFailed` so future implementations do not introduce the same bug:

```typescript
  /**
   * Records a failed attempt, incrementing the attempt counter while keeping
   * the entry in `pending` status so the processor can retry it.
   */
  markAsFailed(id: string, error: string): Promise<void>;
```

---

## Verification

After applying the fixes, run the standard verification commands:

```bash
npm run typecheck
npm run build
npm run lint:fix
npm run format
npm test
```

Pay special attention to:
- `OutboxService` unit tests for processor lifecycle and retry behavior.
- `outbox.module.spec.ts` for module registration.
- `sqlite-outbox.repository.spec.ts` to confirm the new `markAsFailed` contract.

---

## Constraints Verification After Fixes

| Constraint | Status | Evidence |
|-----------|--------|----------|
| Max 200 lines per src file | ✅ | `outbox.service.ts` reduced by removing private JSDoc; `outbox.module.ts` stays under 200. |
| Max 50 lines per method | ✅ | All methods remain short; longest is `routeToDlq` (~22 lines). |
| Max 2 levels of indentation | ✅ | New `try/finally` does not exceed 2 levels. |
| Max 2 parameters per method/function | ✅ | `toOutboxErrorLogContext` takes a params object; `depsProvider` factories take 2 parameters. |
| Prefer private members | ✅ | Only public API remains public. |
| Self-documenting code | ✅ | Private JSDoc removed; names remain descriptive. |
| No commented-out code | ✅ | No commented-out code introduced. |
| Single-section boolean conditions | ✅ | `startProcessor` uses `shouldStartProcessor()` helper. |
| Retry logic correctness | ✅ | Failed entries remain `pending`; exponential backoff applies across polls. |
| DLQ routing on final failure | ✅ | `routeToDlq` marks entry `sent` after DLQ publish. |
| Graceful shutdown | ✅ | `onModuleDestroy` stops the processor interval. |
