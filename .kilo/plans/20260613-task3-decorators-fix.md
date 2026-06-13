# Task 3 — Decorators Code Review Fix Plan

## Summary

The decorator implementation provides the requested `@EmitEvent()` and `@OnEvent()` decorators, the `EmitEventInterceptor` for auto-publishing, and the `OnEventExplorer` for auto-registering handlers. Module wiring in `ProducerModule` and `ConsumerModule` exposes the interceptor and explorer correctly, and `src/index.ts` exports the new public APIs.

Verification results:

- `npm test -- src/producer/decorators src/consumer/decorators` — **18 passed**.
- `npm run typecheck` — **clean**.
- `npm run lint` — **31 errors** (prettier formatting, `@typescript-eslint/ban-types`, `@typescript-eslint/no-unused-vars`).
- `npm run format:check` — **9 files** with formatting issues.

However, several project-rule violations, type-safety issues, test-quality gaps, and an integration design concern need to be addressed.

---

## Issues

### 1. Max lines per file — producer decorator spec exceeds 200 lines

- **File:** `src/producer/decorators/emit-event.decorator.spec.ts`
- **Total lines:** 250
- **Rule:** `max-lines-per-file.md`
- **Issue:** The file is 250 lines, exceeding the 200-line limit for `src/` code files.
- **Suggested fix:** Split the file into two focused spec files:
  - `src/producer/decorators/emit-event.decorator.spec.ts` — tests only the `@EmitEvent()` decorator.
  - `src/producer/decorators/emit-event-interceptor.spec.ts` — tests only the `EmitEventInterceptor`.
  - Extract shared helpers (`createMockExecutionContext`, `createMockCallHandler`, `sampleContext`) into a `src/producer/decorators/__tests__/helpers.ts` if they are needed by both files.

---

### 2. Max arguments per method — `EmitEventInterceptor.handleEmission`

- **File:** `src/producer/decorators/emit-event-interceptor.ts`
- **Line:** 40
- **Rule:** `max-arguments-per-method.md`
- **Issue:** `handleEmission(options, context, data)` accepts 3 positional parameters.
- **Suggested fix:** Introduce a small options object and update the call site in `intercept`:

```ts
interface EmissionOptions {
  options: EmitEventOptions;
  context: ExecutionContext;
  data: unknown;
}

private async handleEmission(emission: EmissionOptions): Promise<unknown> { ... }
```

---

### 3. Max arguments per method — `EmitEventInterceptor.emitEvent`

- **File:** `src/producer/decorators/emit-event-interceptor.ts`
- **Line:** 61
- **Rule:** `max-arguments-per-method.md`
- **Issue:** `emitEvent(options, eventContext, data)` accepts 3 positional parameters.
- **Suggested fix:** Encapsulate the parameters in an options object:

```ts
interface EmitEventParams {
  options: EmitEventOptions;
  eventContext: EventContext;
  data: unknown;
}

private async emitEvent(params: EmitEventParams): Promise<void> { ... }
```

---

### 4. Max arguments per method — `OnEventExplorer` constructor

- **File:** `src/consumer/decorators/on-event.explorer.ts`
- **Line:** 18
- **Rule:** `max-arguments-per-method.md`
- **Issue:** The constructor injects 3 dependencies (`DiscoveryService`, `Reflector`, `ConsumerService`).
- **Suggested fix:** Encapsulate discovery-related dependencies in a single injected object, or treat this as a standard NestJS DI exception only if the project explicitly allows it. To stay within the rule, introduce a provider token and interface:

```ts
export const ON_EVENT_EXPLORER_DEPS = 'ON_EVENT_EXPLORER_DEPS';

export interface OnEventExplorerDeps {
  discovery: DiscoveryService;
  reflector: Reflector;
  consumerService: ConsumerService;
}

constructor(@Inject(ON_EVENT_EXPLORER_DEPS) private readonly deps: OnEventExplorerDeps) {}
```

Then provide it in `ConsumerModule`.

---

### 5. Max arguments per method — `OnEventExplorer.tryRegisterHandler`

- **File:** `src/consumer/decorators/on-event.explorer.ts`
- **Line:** 58
- **Rule:** `max-arguments-per-method.md`
- **Issue:** `tryRegisterHandler(instance, prototype, methodName)` accepts 3 positional parameters.
- **Suggested fix:** Pass the instance and prototype as a single object, keeping `methodName` as the second parameter:

```ts
interface HandlerTarget {
  instance: object;
  prototype: object;
}

private tryRegisterHandler(target: HandlerTarget, methodName: string): void { ... }
```

---

### 6. Max arguments per method — `ConsumerModule.forRootAsync` deps provider factory

- **File:** `src/consumer/consumer.module.ts`
- **Line:** 90
- **Rule:** `max-arguments-per-method.md`
- **Issue:** The `useFactory` for `JETSTREAM_CONSUMER_DEPS_TOKEN` accepts 3 parameters (`moduleOptions`, `consumerService`, `logger`).
- **Suggested fix:** Split the factory so no single function exceeds 2 parameters. For example, create a dedicated `jetStreamProvider` and `dlqSubjectBuilderProvider` that each depend only on `CONSUMER_MODULE_OPTIONS`, then compose the deps object in a final provider that injects those two plus `ConsumerService` and `EventLoggerService`. Alternatively, inject a single `ConsumerModuleResolvedOptions` object.

---

### 7. Single-section boolean conditions — `EmitEventInterceptor.isEventContext`

- **File:** `src/producer/decorators/emit-event-interceptor.ts`
- **Line:** 57
- **Rule:** `single-section-boolean-conditions.md`
- **Issue:** The return statement chains four boolean sections with `&&`.
- **Suggested fix:** Extract each check into a separate private method or a single descriptive helper. For example:

```ts
private isEventContext(arg: unknown): arg is EventContext {
  return this.isNonNullObject(arg) && this.hasRequiredContextFields(arg);
}

private isNonNullObject(arg: unknown): arg is Record<string, unknown> {
  return typeof arg === 'object' && arg !== null;
}

private hasRequiredContextFields(arg: Record<string, unknown>): boolean {
  return 'companyId' in arg && 'type' in arg;
}
```

Also consider validating all required `EventContext` fields (`producer`, `actorType`, `actorId`, `correlationId`, `version`) to avoid emitting events with incomplete context.

---

### 8. Single-section boolean conditions — `OnEventExplorer.isValidWrapper`

- **File:** `src/consumer/decorators/on-event.explorer.ts`
- **Line:** 45
- **Rule:** `single-section-boolean-conditions.md`
- **Issue:** The return statement chains two boolean sections with `&&`.
- **Suggested fix:** Extract a descriptive helper method:

```ts
private isValidWrapper(wrapper: { instance?: unknown }): boolean {
  return this.hasObjectInstance(wrapper);
}

private hasObjectInstance(wrapper: { instance?: unknown }): boolean {
  return wrapper.instance != null && typeof wrapper.instance === 'object';
}
```

---

### 9. Avoid `Function` type

- **Files:**
  - `src/consumer/decorators/on-event.explorer.ts` (lines 59, 63)
  - `src/consumer/decorators/on-event.explorer.spec.ts` (line 35)
- **Rule:** `@typescript-eslint/ban-types`
- **Issue:** The `Function` type provides no type safety.
- **Suggested fix:** Use explicit function signatures. For example:
  - In `on-event.explorer.ts`: `Record<string, (...args: unknown[]) => unknown>`.
  - In `on-event.explorer.spec.ts`: `applyOnEventMetadata(target: object, options: OnEventOptions): void`.

---

### 10. Unused parameters in test sample consumer

- **File:** `src/consumer/decorators/on-event.explorer.spec.ts`
- **Lines:** 14, 18
- **Rule:** `@typescript-eslint/no-unused-vars`
- **Issue:** `_event` and `_context` parameters are flagged as unused.
- **Suggested fix:** Remove the unused parameters or rename them to `_` if the lint config supports ignore-patterns. If the parameters are needed for type documentation, keep them and disable the rule for those lines with a clear comment, or use `_` for all unused parameters.

---

### 11. Prettier formatting / missing EOF newlines

- **Files:**
  - `src/consumer/decorators/on-event.decorator.spec.ts`
  - `src/consumer/decorators/on-event.decorator.ts`
  - `src/consumer/decorators/on-event.explorer.spec.ts`
  - `src/consumer/decorators/on-event.explorer.ts`
  - `src/index.ts`
  - `src/producer/decorators/emit-event-interceptor.ts`
  - `src/producer/decorators/emit-event.decorator.spec.ts`
  - `src/producer/decorators/emit-event.decorator.ts`
  - `src/producer/producer.module.ts`
- **Rule:** Prettier configuration
- **Issue:** 31 lint errors, mostly prettier formatting issues including missing trailing newlines and multi-line array/object formatting.
- **Suggested fix:** Run `npm run format:write` (or `npx prettier --write "src/**/*.ts"`) to auto-fix all formatting issues, then re-run `npm run lint` and `npm run format:check` to confirm.

---

### 12. Decorator tests do not exercise the decorators

- **Files:**
  - `src/producer/decorators/emit-event.decorator.spec.ts` (lines 21–49)
  - `src/consumer/decorators/on-event.decorator.spec.ts` (lines 5–49)
- **Issue:** The decorator tests call `Reflect.defineMetadata` directly instead of applying `@EmitEvent()` or `@OnEvent()` to a class method. They verify the metadata key but not that the decorator function stores metadata correctly.
- **Suggested fix:** Rewrite the tests to apply the decorators:

```ts
class TestProducer {
  @EmitEvent(options)
  async handleUpload() {}
}

const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, TestProducer.prototype.handleUpload);
expect(metadata).toEqual(options);
```

Similarly for `@OnEvent()`.

---

### 13. `OnEventExplorer` registers handlers but does not create JetStream subscriptions

- **File:** `src/consumer/decorators/on-event.explorer.ts`
- **Issue:** `OnEventExplorer.onModuleInit()` discovers `@OnEvent()` methods and registers them with `ConsumerService`, but it never calls `JetStreamConsumerService.subscribe()`. As a result, no NATS subscription is created for the wildcard subjects, and incoming messages will not be consumed automatically. This may be intentional if the host application is expected to subscribe manually, but it limits the "auto-consumes" value of the decorator.
- **Suggested fix:** Decide on the intended behavior and document it:
  - **Option A (fully automatic):** Inject `JetStreamConsumerService` into `OnEventExplorer` and call `subscribe()` for each discovered handler. This requires careful handling of duplicate subscriptions and consumer options.
  - **Option B (registration only):** Keep the current behavior but update the JSDoc and README to clarify that the host must call `jetStreamConsumerService.subscribe()` for the subjects it wants to consume.
  - If Option A is chosen, ensure the explorer does not subscribe multiple times across hot-reloads or repeated module initializations.

---

## Recommended Fix Order

1. **Formatting and lint:** Run `npm run format:write` and fix remaining lint errors (`Function` type, unused vars).
2. **Rule violations:** Refactor methods with >2 parameters and multi-section boolean conditions.
3. **File size:** Split `emit-event.decorator.spec.ts` into focused decorator and interceptor spec files.
4. **Test quality:** Rewrite decorator tests to apply the decorators to class methods.
5. **Integration decision:** Resolve whether `OnEventExplorer` should create JetStream subscriptions automatically and update code/docs accordingly.

---

## Verification After Fixes

- `npm test -- src/producer/decorators src/consumer/decorators` should still pass 18 tests.
- `npm run typecheck` should remain clean.
- `npm run lint` should pass with 0 errors.
- `npm run format:check` should pass.
