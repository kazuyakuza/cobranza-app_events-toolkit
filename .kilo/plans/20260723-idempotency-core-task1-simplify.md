# Idempotency Core Module — Code Simplification Plan

**Scope:** Task 1 (Core Idempotency Module), Step 4.3 — Code Simplification
**Date:** 2026-07-23

## Summary

The idempotency implementation is functional and well-structured, but several areas can be simplified to reduce duplication, improve readability, and comply with project rules (max 200 lines per file, max 50 lines per method body, single-section boolean conditions). This plan identifies 7 concrete simplifications.

---

## 1. Collapse intermediate "pair" providers in `src/idempotency/idempotency.module.ts`

**File:** `src/idempotency/idempotency.module.ts`

**Current complexity:**
- `forRoot` and `forRootAsync` are ~53 and ~69 lines respectively, exceeding the 50-line method-body rule.
- Four intermediate artifacts (`IdempotencyServiceBaseDepsPair`, `IdempotencyServiceConfigPair`, and their two tokens) exist only to merge into `IdempotencyServiceDeps`.
- This creates unnecessary indirection and bloats the file to 189 lines.

**Simplified version:**

Remove the `Pair` types/tokens and build the deps provider in one step:

```ts
const depsProvider: Provider = {
  provide: IDEMPOTENCY_SERVICE_DEPS_TOKEN,
  useFactory: (
    repository: IdempotencyRepository,
    serviceOpts: IdempotencyServiceOptions,
    logger: EventLoggerService,
  ): IdempotencyServiceDeps => ({
    repository,
    options: serviceOpts,
    logger,
  }),
  inject: [IDEMPOTENCY_REPOSITORY_TOKEN, IDEMPOTENCY_SERVICE_OPTIONS_TOKEN, EventLoggerService],
};
```

Apply this to both `forRoot` and `forRootAsync`. This removes ~40 lines and two internal tokens.

---

## 2. Extract shared `computeExpiry` utility for SQLite and PostgreSQL repositories

**Files:**
- `src/idempotency/sqlite-idempotency.repository.ts`
- `src/idempotency/postgres-idempotency.repository.ts`

**Current complexity:**
Both repositories contain identical private methods:

```ts
private computeExpiry(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}
```

**Simplified version:**

Create `src/idempotency/compute-expiry.util.ts`:

```ts
export function computeExpiry(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}
```

Replace the private methods in both repositories with a call to `computeExpiry(ttlSeconds)`.

---

## 3. Inline `IdempotencyService` dependency fields into a single `deps` property

**File:** `src/idempotency/idempotency.service.ts`

**Current complexity:**
The constructor destructures `deps` into three separate private fields, then methods access them individually. This adds boilerplate without improving readability.

**Simplified version:**

```ts
@Injectable()
export class IdempotencyService {
  constructor(@Inject(IDEMPOTENCY_SERVICE_DEPS_TOKEN) private readonly deps: IdempotencyServiceDeps) {}

  async isDuplicate(event: AnyEventEnvelope<unknown>): Promise<boolean> {
    return this.deps.repository.isProcessed(buildIdempotencyKey(event));
  }

  async markAsProcessed(event: AnyEventEnvelope<unknown>, ttlSeconds?: number): Promise<void> {
    const key = buildIdempotencyKey(event);
    await this.deps.repository.markAsProcessed(key, this.resolveTtl(ttlSeconds));
    this.deps.logger.logEventConsumed({ eventId: event.id, eventType: event.type, subject: '' });
  }

  async executeIfNotProcessed<T>(
    event: AnyEventEnvelope<unknown>,
    handler: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T | undefined> {
    if (await this.isDuplicate(event)) {
      return undefined;
    }
    const result = await handler();
    await this.markAsProcessed(event, ttlSeconds);
    return result;
  }

  private resolveTtl(explicit: number | undefined): number | undefined {
    return explicit ?? this.deps.options?.defaultTtlSeconds;
  }
}
```

---

## 4. Flatten `MemoryIdempotencyRepository.isProcessed`

**File:** `src/idempotency/memory-idempotency.repository.ts`

**Current complexity:**

```ts
const entry = this.store.get(key);
if (entry === undefined) {
  return false;
}
if (this.isExpired(entry)) {
  return false;
}
return true;
```

This is a 3-level return path that can be expressed as a single boolean expression.

**Simplified version:**

```ts
async isProcessed(key: string): Promise<boolean> {
  const entry = this.store.get(key);
  return entry !== undefined && !this.isExpired(entry);
}
```

Also simplify `isExpired`:

```ts
private isExpired(entry: MemoryEntry): boolean {
  return entry.expiresAt !== null && entry.expiresAt < new Date().toISOString();
}
```

---

## 5. Extract `isIdempotencyEnabled` guard in `src/events-toolkit.module.ts`

**File:** `src/events-toolkit.module.ts`

**Current complexity:**

```ts
if (options.idempotency && options.idempotency.enabled !== false) {
  imports.push(IdempotencyModule.forRoot(buildIdempotencyModuleOptions(options.idempotency)));
}
```

This is a multi-section boolean condition, violating the single-section boolean rule. The file also exceeds 200 lines (207).

**Simplified version:**

```ts
function isIdempotencyEnabled(idempotency?: EventsToolkitIdempotencyOptions): idempotency is EventsToolkitIdempotencyOptions {
  return !!idempotency && idempotency.enabled !== false;
}

if (isIdempotencyEnabled(options.idempotency)) {
  imports.push(IdempotencyModule.forRoot(buildIdempotencyModuleOptions(options.idempotency)));
}
```

This also helps keep the file under the 200-line limit.

---

## 6. Extract `findRepositoryProvider` helper in `src/idempotency/idempotency.module.spec.ts`

**File:** `src/idempotency/idempotency.module.spec.ts`

**Current complexity:**
Each `forRoot` test repeats the provider lookup:

```ts
const provider = dynamicModule.providers?.find(
  (p) => 'provide' in p && p.provide === IDEMPOTENCY_REPOSITORY_TOKEN,
) as { provide: string; useValue: IdempotencyRepository };
```

**Simplified version:**

Add a helper at the top of the describe block:

```ts
function findRepositoryProvider(dynamicModule: DynamicModule) {
  return dynamicModule.providers?.find(
    (p) => 'provide' in p && p.provide === IDEMPOTENCY_REPOSITORY_TOKEN,
  ) as { provide: string; useValue: IdempotencyRepository } | undefined;
}
```

Replace all repeated lookups with `findRepositoryProvider(dynamicModule)`.

---

## 7. Refactor `src/idempotency/sqlite-idempotency.repository.spec.ts` away from module-level mutable arrays

**File:** `src/idempotency/sqlite-idempotency.repository.spec.ts`

**Current complexity:**
The test uses module-level `capturedGets` and `capturedRuns` arrays and manually pushes args inside mocked statement methods. This is fragile and makes the test harder to follow.

**Simplified version:**

Use `mock.results` to access the prepared statement instead of mutating global arrays:

```ts
function getLastPreparedStatement() {
  const result = mockDb.prepare.mock.results[mockDb.prepare.mock.results.length - 1];
  return result.value as { get: jest.Mock; run: jest.Mock };
}
```

Then assertions become:

```ts
it('runs SELECT with key and nowIso', async () => {
  await repository.isProcessed('some-key');
  expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT 1 FROM idempotency_keys'));
  const stmt = getLastPreparedStatement();
  expect(stmt.get).toHaveBeenCalledWith('some-key', expect.any(String));
});

it('inserts key with created_at and null expires_at when no TTL', async () => {
  await repository.markAsProcessed('key-no-ttl');
  expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE'));
  const stmt = getLastPreparedStatement();
  expect(stmt.run).toHaveBeenCalledWith('key-no-ttl', expect.any(String), null);
});
```

Remove the module-level `capturedGets` and `capturedRuns` arrays.

---

## Suggested Priority

1. **High:** Simplifications 1 and 2 — remove the most duplication and rule violations.
2. **Medium:** Simplifications 3, 4, and 5 — improve readability and rule compliance.
3. **Low:** Simplifications 6 and 7 — test-only cleanup.

---

## Notes

- No source files should be modified by this step; only the plan is produced.
- After simplification, re-run `npm run typecheck` and `npm run test` to verify behavior is preserved.
