# Task 1 Producer Module — Code Review Fix Plan

## Summary

The Producer Module implementation meets the core functional requirements:
- `ProducerModule` exposes `forRoot` and `forRootAsync` as global `DynamicModule`s.
- `ProducerService` provides `publish()` and `emit()`.
- `EventLoggerService` is injected and logs every emission.
- The module accepts either `NatsConnection` or `JetStreamClient` and resolves the client correctly.
- Tests pass (`npm run test -- src/producer/producer.service.spec.ts`) and TypeScript compiles (`npm run typecheck`).

However, several quality, style, and coverage issues must be addressed before the task is complete.

---

## Issues

### 1. Prettier/ESLint formatting errors on producer files

**Files**: `src/producer/producer.module.ts`, `src/producer/producer.service.ts`, `src/producer/producer.service.spec.ts`

**Details**:
- `producer.module.ts:43` — providers array is multi-line; Prettier expects a single-line array.
- `producer.module.ts:68` — missing trailing newline.
- `producer.service.ts:100` — missing trailing newline.
- `producer.service.spec.ts:156` — `createTestEvent` function parameters should be formatted multi-line.
- `producer.service.spec.ts:170` — missing trailing newline.
- The whole repository currently uses CRLF line endings; the linter reports `Delete ␍` on every line. This is a cross-project issue but must be resolved for producer files.

**Suggested fix**:
1. Run `npm run format` to fix Prettier violations.
2. Run `npm run lint` and address any remaining warnings.
3. Ensure `.gitattributes` enforces LF endings and normalize line endings for the affected files.

---

### 2. Explicit `any` usage in dynamic module options

**File**: `src/producer/producer.module.ts`
**Lines**: 20, 22, 55

**Details**:
```ts
useFactory: (...args: any[]) => Promise<ProducerModuleOptions> | ProducerModuleOptions;
inject?: any[];
useFactory: async (...args: any[]): Promise<JetStreamClient> => { ... }
```

The project rule prefers explicit types over `any`. These warnings are reported by `@typescript-eslint/no-explicit-any`.

**Suggested fix**:
- Change factory `args` type to `unknown[]`.
- Change `inject` type to `Array<InjectionToken | Abstract<unknown>>` or import `InjectionToken`/`Abstract` from `@nestjs/common` (or keep `any[]` only if NestJS typings strictly require it, with an eslint-disable-next-line justification).

---

### 3. `as any` casts in module tests

**File**: `src/producer/producer.service.spec.ts`
**Lines**: 138, 144

**Details**:
```ts
ProducerModule.forRoot({ connection: mockConnection as any });
ProducerModule.forRoot({ jetStream: jetStream as any });
```

Casting to `any` bypasses type safety and hides contract mismatches.

**Suggested fix**:
- Build minimal type-compatible mocks:
  - For `NatsConnection`, declare `mockConnection: Partial<NatsConnection> & { jetstream: jest.Mock }` and assert the shape before passing.
  - For `JetStreamClient`, declare `jetStream: Partial<JetStreamClient> & { publish: jest.Mock }` and pass it without `any`.
- If a full mock is too verbose, create small factory helpers in the test file.

---

### 4. Missing test for `forRootAsync`

**File**: `src/producer/producer.service.spec.ts`
**Line**: around `describe('ProducerModule', ...)`

**Details**:
Tests cover `forRoot` with connection, `forRoot` with `jetStream`, and missing options, but `forRootAsync` is not tested.

**Suggested fix**:
Add a test case:
```ts
it('should resolve JetStream from async factory via forRootAsync', async () => {
  const dynamicModule = ProducerModule.forRootAsync({
    useFactory: async () => ({ jetStream: jetStream as JetStreamClient }),
  });
  const jetStreamProvider = dynamicModule.providers?.find(
    (p) => (p as any).provide === JETSTREAM_TOKEN,
  );
  const resolved = await (jetStreamProvider as any).useFactory();
  expect(resolved).toBe(jetStream);
});
```

Also add a test verifying `inject` is honored when dependencies are supplied.

---

### 5. Missing error-path tests for `publish` and `emit`

**File**: `src/producer/producer.service.spec.ts`
**Area**: `describe('publish', ...)` and `describe('emit', ...)`

**Details**:
Current tests only cover the happy path. There is no coverage for when `jetStream.publish()` rejects.

**Suggested fix**:
Add a test:
```ts
it('should propagate JetStream publish errors', async () => {
  const error = new Error('NATS publish failed');
  jetStream.publish.mockRejectedValue(error);
  const event = createTestEvent();
  await expect(service.publish('company.550e8400.payment.proof.uploaded.v1', event)).rejects.toThrow(error);
  expect(mockLoggerService.logEventEmitted).not.toHaveBeenCalled();
});
```

---

### 6. `EventContext` located in producer service instead of common envelope

**File**: `src/producer/producer.service.ts`
**Lines**: 12–34

**Details**:
The global plan (Task 6) defines `EventContext` as a common type in `src/common/envelope/`. Placing it inside `producer.service.ts` duplicates the concept and makes it unavailable to the consumer module, which will also need the same context shape.

**Suggested fix**:
- Create `src/common/envelope/event-context.interface.ts` with the `EventContext` interface.
- Export it from `src/common/envelope/index.ts` (or `src/index.ts`).
- Update `src/producer/producer.service.ts` to import `EventContext` instead of defining it locally.
- Coordinate with Task 6 (Context Helper) so the type is reused rather than duplicated.

---

### 7. Publish/emit does not log or wrap failures

**File**: `src/producer/producer.service.ts`
**Lines**: 53–60

**Details**:
`publish()` awaits `jetStream.publish()` without a try/catch. If the publish fails, the error propagates and no failure log is emitted. This is not a security flaw, but it reduces observability.

**Suggested fix**:
Consider wrapping the call and logging the failure:
```ts
async publish(subject: string, event: EventEnvelope<unknown>): Promise<void> {
  const payload = this.encodeEvent(event);
  try {
    await this.jetStream.publish(subject, payload);
    this.logEmission(subject, event);
  } catch (error) {
    this.logger.logEventError(this.toErrorLogContext(subject, event, error as Error));
    throw error;
  }
}
```

If `EventLoggerService` does not yet expose a failure log method for producers, add a dedicated `logEventPublishError` or reuse `logEventError` after ensuring the context shape fits.

---

## Verification steps after fixes

1. Run `npm run format`.
2. Run `npm run lint -- src/producer/**/*.ts` and ensure zero errors/warnings.
3. Run `npm run typecheck`.
4. Run `npm run test -- src/producer/producer.service.spec.ts`.
5. Run `npm run build` to confirm library compilation.

## Out of scope for this fix

- Barrel exports (`src/producer/index.ts`, `src/index.ts`) are covered by Task 7.
- Consumer/request-reply modules are covered by Tasks 2–5.
