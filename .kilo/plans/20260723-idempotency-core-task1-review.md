# Idempotency Core Module — Task 1 Code Review Fix Plan

**Review date:** 2026-07-23
**TODO file:** `.agent/todos/20260722/20260722-todo-2.md`
**Implementation plan:** `.kilo/plans/20260723-idempotency-core-task1.md`

## Summary

The implementation follows the high-level plan and mirrors the outbox module pattern, but it contains several rule violations (max method length, max nesting depth, max parameters, single-section boolean conditions) and one plan-adherence deviation in the async module wiring. The SQLite repository spec also deviates from the plan by mocking the database instead of using a real `:memory:` instance.

## Issues Found

### 1. Plan adherence — async idempotency is always wired with a memory fallback

- **File:** `src/events-toolkit.module.ts`
- **Lines:** 145-153, 186-197
- **Problem:** The plan explicitly states: *"Default when `opts.idempotency` undefined: skip (do not default to memory — avoid surprising users)."* The implementation always imports `IdempotencyModule.forRootAsync` and returns `{ type: 'memory' }` when idempotency is not configured or disabled.
- **Fix:** Because `buildAsyncImports` is synchronous and cannot await the async options factory, conditional module import cannot be decided at module-build time. The plan must be reconciled with this architecture constraint. Choose one of:
  1. Update the plan to accept that the async path always wires idempotency with a memory fallback (document the behavior).
  2. Redesign the async wiring so `buildAsyncImports` receives a synchronous opt-in flag, or so the module is added by the user manually.

### 2. Rule violation — `IdempotencyService.executeIfNotProcessed` has 3 parameters

- **File:** `src/idempotency/idempotency.service.ts`
- **Lines:** 53-57
- **Problem:** `max-arguments-per-method` limits methods to 2 parameters.
- **Fix:** Create a params interface and reduce to a single parameter.

```ts
// src/idempotency/execute-if-not-processed-params.interface.ts
import { AnyEventEnvelope } from '../common/envelope/envelope-types';

export interface ExecuteIfNotProcessedParams<T> {
  event: AnyEventEnvelope<unknown>;
  handler: () => Promise<T>;
  ttlSeconds?: number;
}
```

```ts
// src/idempotency/idempotency.service.ts
import { ExecuteIfNotProcessedParams } from './execute-if-not-processed-params.interface';

async executeIfNotProcessed<T>(params: ExecuteIfNotProcessedParams<T>): Promise<T | undefined> {
  if (await this.isDuplicate(params.event)) {
    return undefined;
  }
  const result = await params.handler();
  await this.markAsProcessed(params.event, params.ttlSeconds);
  return result;
}
```

### 3. Rule violation — `IdempotencyModule.forRoot` method body exceeds 50 lines

- **File:** `src/idempotency/idempotency.module.ts`
- **Lines:** 56-109
- **Problem:** The method body is approximately 52 lines.
- **Fix:** Extract provider creation into private static helpers.

```ts
private static buildServiceOptionsProvider(options: IdempotencyModuleOptions): Provider {
  return {
    provide: IDEMPOTENCY_SERVICE_OPTIONS_TOKEN,
    useValue: options.serviceOptions ?? {},
  };
}

private static buildBaseDepsPairProvider(): Provider {
  return {
    provide: IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN,
    useFactory: (logger: EventLoggerService): IdempotencyServiceBaseDepsPair => ({ logger }),
    inject: [EventLoggerService],
  };
}

private static buildConfigPairProvider(): Provider {
  return {
    provide: IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN,
    useFactory: (
      repository: IdempotencyRepository,
      serviceOpts: IdempotencyServiceOptions,
    ): IdempotencyServiceConfigPair => ({ repository, options: serviceOpts }),
    inject: [IDEMPOTENCY_REPOSITORY_TOKEN, IDEMPOTENCY_SERVICE_OPTIONS_TOKEN],
  };
}

private static buildDepsProvider(): Provider {
  return {
    provide: IDEMPOTENCY_SERVICE_DEPS_TOKEN,
    useFactory: (base: IdempotencyServiceBaseDepsPair, config: IdempotencyServiceConfigPair): IdempotencyServiceDeps => ({
      ...base,
      ...config,
    }),
    inject: [IDEMPOTENCY_SERVICE_BASE_DEPS_PAIR_TOKEN, IDEMPOTENCY_SERVICE_CONFIG_PAIR_TOKEN],
  };
}
```

Then `forRoot` calls these helpers.

### 4. Rule violation — `IdempotencyModule.forRootAsync` method body exceeds 50 lines

- **File:** `src/idempotency/idempotency.module.ts`
- **Lines:** 119-188
- **Problem:** The method body is approximately 69 lines.
- **Fix:** Apply the same private static helpers from issue 3, adding async variants for `moduleOptionsProvider`, `repositoryProvider`, and `serviceOptionsProvider`.

```ts
private static buildModuleOptionsProvider(asyncOptions: IdempotencyModuleAsyncOptions): Provider {
  return {
    provide: IDEMPOTENCY_MODULE_OPTIONS_TOKEN,
    useFactory: async (...args: unknown[]): Promise<IdempotencyModuleOptions> => asyncOptions.useFactory(...args),
    inject: asyncOptions.inject ?? [],
  };
}

private static buildRepositoryProvider(): Provider {
  return {
    provide: IDEMPOTENCY_REPOSITORY_TOKEN,
    useFactory: (moduleOptions: IdempotencyModuleOptions): IdempotencyRepository => resolveRepository(moduleOptions),
    inject: [IDEMPOTENCY_MODULE_OPTIONS_TOKEN],
  };
}

private static buildAsyncServiceOptionsProvider(): Provider {
  return {
    provide: IDEMPOTENCY_SERVICE_OPTIONS_TOKEN,
    useFactory: (moduleOptions: IdempotencyModuleOptions): IdempotencyServiceOptions =>
      moduleOptions.serviceOptions ?? {},
    inject: [IDEMPOTENCY_MODULE_OPTIONS_TOKEN],
  };
}
```

### 5. Rule violation — `resolveRepository` exceeds 2 nesting levels

- **File:** `src/idempotency/idempotency.module.ts`
- **Lines:** 23-35
- **Problem:** The `if (!options.postgres?.entityManager)` block is nested inside `if (options.type === 'postgres')`, creating a 3rd nesting level.
- **Fix:** Extract the postgres branch into a module-level helper.

```ts
function resolveRepository(options: IdempotencyModuleOptions): IdempotencyRepository {
  if (options.type === 'postgres') {
    return resolvePostgresRepository(options.postgres);
  }
  if (options.type === 'memory') {
    return new MemoryIdempotencyRepository();
  }
  const dbPath = options.sqlite?.dbPath ?? ':memory:';
  return new SqliteIdempotencyRepository(dbPath);
}

function resolvePostgresRepository(postgres?: IdempotencyModuleOptions['postgres']): IdempotencyRepository {
  if (!postgres?.entityManager) {
    throw new Error('IdempotencyModule with type "postgres" requires options.postgres.entityManager');
  }
  return new PostgresIdempotencyRepository(postgres.entityManager);
}
```

### 6. Rule violation — `MemoryIdempotencyRepository.isProcessed` exceeds 2 nesting levels

- **File:** `src/idempotency/memory-idempotency.repository.ts`
- **Lines:** 18-27
- **Problem:** Two nested `if` statements produce a 3rd nesting level.
- **Fix:** Extract the validity check into a helper.

```ts
async isProcessed(key: string): Promise<boolean> {
  const entry = this.store.get(key);
  return this.isStoredAndValid(entry);
}

private isStoredAndValid(entry: MemoryEntry | undefined): boolean {
  if (entry === undefined) {
    return false;
  }
  return !this.isExpired(entry);
}
```

### 7. Rule violation — multi-section boolean condition in `buildSyncImports`

- **File:** `src/events-toolkit.module.ts`
- **Line:** 124
- **Problem:** `if (options.idempotency && options.idempotency.enabled !== false)` combines two sections.
- **Fix:** Extract into a helper.

```ts
function shouldWireIdempotency(idempotency?: EventsToolkitIdempotencyOptions): boolean {
  return idempotency !== undefined && idempotency.enabled !== false;
}

if (shouldWireIdempotency(options.idempotency)) {
  imports.push(IdempotencyModule.forRoot(buildIdempotencyModuleOptions(options.idempotency)));
}
```

### 8. Rule violation — multi-section boolean condition in `buildIdempotencyAsyncImport`

- **File:** `src/events-toolkit.module.ts`
- **Line:** 190
- **Problem:** `if (!opts.idempotency || opts.idempotency.enabled === false)` combines two sections.
- **Fix:** Extract into a helper.

```ts
function isIdempotencyDisabled(idempotency?: EventsToolkitIdempotencyOptions): boolean {
  return idempotency === undefined || idempotency.enabled === false;
}

if (isIdempotencyDisabled(opts.idempotency)) {
  return { type: 'memory' };
}
```

### 9. Test deviation — SQLite repository spec mocks the database

- **File:** `src/idempotency/sqlite-idempotency.repository.spec.ts`
- **Lines:** 1-91
- **Problem:** The plan states: *"uses `:memory:` DB; covers insert-or-ignore second `markAsProcessed` is a no-op; TTL expiry flips `isProcessed`; `clearExpired` purges."* The current spec mocks `better-sqlite3` and only asserts SQL strings.
- **Fix:** Remove the mock and rewrite the spec using a real `:memory:` database.

```ts
import { SqliteIdempotencyRepository } from './sqlite-idempotency.repository';

describe('SqliteIdempotencyRepository', () => {
  let repository: SqliteIdempotencyRepository;

  beforeEach(() => {
    repository = new SqliteIdempotencyRepository(':memory:');
  });

  it('isProcessed returns false for unknown key', async () => {
    expect(await repository.isProcessed('missing')).toBe(false);
  });

  it('isProcessed returns true after markAsProcessed', async () => {
    await repository.markAsProcessed('key');
    expect(await repository.isProcessed('key')).toBe(true);
  });

  it('second markAsProcessed is a no-op', async () => {
    await repository.markAsProcessed('key', 3600);
    await repository.markAsProcessed('key', 3600);
    expect(await repository.isProcessed('key')).toBe(true);
  });

  it('isProcessed returns false for expired key', async () => {
    await repository.markAsProcessed('key', 0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await repository.isProcessed('key')).toBe(false);
  });

  it('clearExpired purges only expired keys', async () => {
    await repository.markAsProcessed('permanent');
    await repository.markAsProcessed('expired', 0);
    await new Promise((resolve) => setImmediate(resolve));
    await repository.clearExpired();
    expect(await repository.isProcessed('permanent')).toBe(true);
    expect(await repository.isProcessed('expired')).toBe(false);
  });
});
```

### 10. Test quality — `idempotency.service.spec.ts` uses `as never` casts

- **File:** `src/idempotency/idempotency.service.spec.ts`
- **Lines:** 35-37
- **Problem:** `as never` bypasses the type system and is not self-documenting.
- **Fix:** Use `as unknown as IdempotencyRepository` and `as unknown as EventLoggerService`.

```ts
service = new IdempotencyService({
  repository: mockRepository as unknown as IdempotencyRepository,
  logger: mockLogger as unknown as EventLoggerService,
  options: deps,
});
```

### 11. Test coverage — missing explicit TTL test for `executeIfNotProcessed`

- **File:** `src/idempotency/idempotency.service.spec.ts`
- **Lines:** 93-124
- **Problem:** The spec verifies `undefined` TTL propagation but does not verify an explicit TTL is forwarded.
- **Fix:** Add the following test inside the `executeIfNotProcessed` describe block.

```ts
it('forwards explicit ttlSeconds to markAsProcessed', async () => {
  mockRepository.isProcessed.mockResolvedValue(false);
  const handler = jest.fn().mockResolvedValue('result');
  const event = createTestEvent('evt_010', 'corr_010');
  await service.executeIfNotProcessed({ event, handler, ttlSeconds: 120 });
  expect(mockRepository.markAsProcessed).toHaveBeenCalledWith('evt_010:corr_010', 120);
});
```

(If the params-object refactor from issue 2 is applied, adjust the call to use `{ event, handler, ttlSeconds: 120 }`.)

### 12. Minor — file name mismatch between plan and implementation

- **File:** `src/idempotency/build-idempotency-key.util.ts`
- **Problem:** The plan names the helper `idempotency-key.util.ts`, but the implementation uses `build-idempotency-key.util.ts`. The test file is named `idempotency-key.util.spec.ts` (matching the plan), which is inconsistent with the actual file it tests.
- **Fix:** Rename the test file to `build-idempotency-key.util.spec.ts` to match the implementation.

### 13. Design concern — `IdempotencyService.markAsProcessed` logs an empty subject

- **File:** `src/idempotency/idempotency.service.ts`
- **Line:** 44
- **Problem:** `this.logger.logEventConsumed({ eventId: event.id, eventType: event.type, subject: '' })` passes an empty subject because the idempotency context has no subject. This is a workaround that may confuse log consumers.
- **Fix:** Either make `subject` optional in `EventLoggerService.logEventConsumed`, or add a dedicated `logIdempotencyMarked` method to the logger.

### 14. Type import — `idempotency.service.ts` should import `AnyEventEnvelope` as a type

- **File:** `src/idempotency/idempotency.service.ts`
- **Line:** 2
- **Problem:** `AnyEventEnvelope` is used only as a type annotation.
- **Fix:** Use `import type { AnyEventEnvelope } from '../common/envelope/envelope-types';`.

## Conclusion

The implementation is functionally correct, but the issues above must be resolved before the task is considered complete. The most critical items are the async idempotency wiring deviation (issue 1) and the parameter/nesting/length rule violations (issues 2-8). The SQLite spec should be rewritten to use a real database as required by the test plan (issue 9).