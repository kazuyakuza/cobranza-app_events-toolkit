# Task 2 — Consumer Module Code Review Fix Plan

## Summary

The Consumer Module implementation meets the high-level requirements:

- `ConsumerModule` exposes `forRoot`/`forRootAsync` DynamicModule factory methods.
- `ConsumerService` provides a handler registry and dispatch method.
- `JetStreamConsumerService` subscribes to JetStream, parses/validates messages, acknowledges or negatively acknowledges them, and routes `EventConsumerException` failures to a DLQ subject.
- `EventConsumerException` is created on validation failure and caught in the error handler.
- Unit tests cover success, validation-failure, handler-thrown consumer exception, generic handler errors, DLQ publish failure, and malformed JSON paths.

Verification results:

- `npm run test -- src/consumer` — **23 passed**.
- `npm run typecheck` — **clean**.
- `npm run format:check` — **clean**.
- `npm run lint` — **7 warnings** in `src/consumer/jetstream-consumer.service.spec.ts` (`@typescript-eslint/no-explicit-any`).

However, several project-rule violations, test-quality issues, and integration concerns need to be addressed before the task can be considered complete.

---

## Issues

### 1. Max arguments per method — `ConsumerService.dispatch`

- **File:** `src/consumer/consumer.service.ts`
- **Line:** 40
- **Rule:** `max-arguments-per-method.md`
- **Issue:** `dispatch(subject, event, context)` accepts 3 positional parameters.
- **Suggested fix:** Encapsulate parameters in a single options object:

```ts
export interface DispatchOptions {
  subject: string;
  event: EventEnvelope<unknown>;
  context: EventContext;
}

async dispatch(options: DispatchOptions): Promise<void> { ... }
```

Update `JetStreamConsumerService.handleMessage` (line 94) and the tests in `consumer.service.spec.ts` accordingly.

---

### 2. Max arguments per method — `JetStreamConsumerService` constructor

- **File:** `src/consumer/jetstream-consumer.service.ts`
- **Lines:** 60–65
- **Rule:** `max-arguments-per-method.md`
- **Issue:** The constructor injects 4 dependencies (`jetStream`, `consumerService`, `logger`, `dlqSubjectBuilder`).
- **Suggested fix:** Either treat constructor injection as a standard NestJS exception to the rule, or encapsulate the dependencies in a single injected object using a dedicated provider token (e.g., `JETSTREAM_CONSUMER_DEPS_TOKEN`) and an interface such as `JetStreamConsumerDependencies`. If the rule is to be applied strictly, the single-object approach is preferred.

---

### 3. Max arguments per method — internal helper methods

- **File:** `src/consumer/jetstream-consumer.service.ts`
- **Lines:** 124, 143, 153
- **Rule:** `max-arguments-per-method.md`
- **Issue:** `createValidationException(errors, subject, plain)`, `handleError(error, msg, subject)`, and `routeToDlq(exception, msg, subject)` each accept 3 parameters.
- **Suggested fix:** Introduce small options objects and update call sites:

```ts
interface ValidationErrorOptions {
  errors: ValidationError[];
  subject: string;
  plain: Record<string, unknown>;
}

interface ErrorHandlingOptions {
  error: unknown;
  msg: JsMsg;
  subject: string;
}

interface DlqRoutingOptions {
  exception: EventConsumerException;
  msg: JsMsg;
  subject: string;
}
```

This keeps method signatures under the 2-parameter limit and improves readability.

---

### 4. Max lines per file — test spec exceeds 200 lines

- **File:** `src/consumer/jetstream-consumer.service.spec.ts`
- **Total lines:** 285
- **Rule:** `max-lines-per-file.md`
- **Issue:** The file is 285 lines, exceeding the 200-line limit for `src/` code files.
- **Suggested fix:** Split the file:
  - Move the `ConsumerModule` dynamic-module tests to a new `src/consumer/consumer.module.spec.ts`.
  - Keep JetStream message-handling tests in `jetstream-consumer.service.spec.ts`.
  - Extract shared helper functions (`createValidEventJson`, `createJsMsg`) to a `src/consumer/__tests__/helpers.ts` or similar if they are needed by multiple spec files.

---

### 5. Tests access private methods via `as any`

- **File:** `src/consumer/jetstream-consumer.service.spec.ts`
- **Lines:** 96, 117, 146, 162, 183, 199, 214
- **Rule:** Code quality / lint (`@typescript-eslint/no-explicit-any`)
- **Issue:** The tests repeatedly cast the service to `any` to invoke the private `handleMessage` method. This bypasses type safety and produces 7 lint warnings.
- **Suggested fix:** Test through the public API. Provide `jetStream.subscribe` with a controlled async generator and call `service.subscribe(...)`. Then push mock `JsMsg` instances through the generator. If direct invocation is required for unit isolation, expose a package-private test method (e.g., `processMessage`) with a clear doc comment stating it is for testing only, and cast to that type rather than `any`.

---

### 6. DLQ payload loses the original event

- **File:** `src/consumer/jetstream-consumer.service.ts`
- **Line:** 158
- **Issue:** `routeToDlq` publishes `JSON.stringify(exception)`. `Error` and nested `Error` properties are non-enumerable, so the DLQ message drops the original payload, stack trace, and `cause` details. This does not align with the convention that the DLQ should receive the failed message.
- **Suggested fix:** Publish a structured DLQ envelope that includes the original message payload plus error metadata:

```ts
const dlqPayload = {
  originalSubject: subject,
  originalPayload: plain, // decoded plain object; retain it in handleMessage scope
  error: {
    name: exception.name,
    message: exception.message,
    eventId: exception.eventId,
    eventType: exception.eventType,
    correlationId: exception.correlationId,
    stack: exception.stack,
  },
  failedAt: new Date().toISOString(),
};
await this.jetStream.publish(dlqSubject, this.encoder.encode(JSON.stringify(dlqPayload)));
```

To make `plain` available in `routeToDlq`, either:
- Change `parseAndValidate` to return `{ envelope, plain }` and pass `plain` through `handleMessage`, or
- Add an optional `originalPayload` field to `EventConsumerException` and set it when creating the validation exception.

Update `jetstream-consumer.service.spec.ts` to assert on the DLQ payload structure.

---

### 7. DLQ publish failures are silent

- **File:** `src/consumer/jetstream-consumer.service.ts`
- **Lines:** 157–162
- **Issue:** If `jetStream.publish` to the DLQ fails, the catch block only calls `msg.nak()` and does not log the failure.
- **Suggested fix:** Log the DLQ publish failure before nacking:

```ts
try {
  await this.jetStream.publish(dlqSubject, ...);
  msg.ack();
} catch (error: unknown) {
  this.logGeneralError(error, dlqSubject);
  msg.nak();
}
```

---

### 8. Floating subscription promise can cause unhandled rejections

- **File:** `src/consumer/jetstream-consumer.service.ts`
- **Line:** 78
- **Issue:** `this.processSubscription(subscription, options.subject)` is started without `await`, `.catch`, or task tracking. If the async iterable itself throws (rather than an individual message handler), the rejection will be unhandled.
- **Suggested fix:** If `subscribe` is intended to be a long-running blocking call, `await this.processSubscription(...)`. If it must be fire-and-forget, attach error handling and store the promise so it can be awaited on shutdown:

```ts
this.processSubscription(subscription, options.subject).catch((error) =>
  this.logGeneralError(error, options.subject),
);
```

Prefer the `await` approach for a NestJS service so lifecycle hooks can stop the subscription cleanly.

---

### 9. `forRootAsync` calls the factory twice per resolution

- **File:** `src/consumer/consumer.module.ts`
- **Lines:** 79, 87
- **Issue:** Both `jetStreamProvider` and `dlqProvider` independently call `asyncOptions.useFactory(...)`. If the factory performs side effects (e.g., opening a connection), they run twice.
- **Suggested fix:** Introduce a single options provider and inject it into the other providers:

```ts
export const CONSUMER_MODULE_OPTIONS = 'CONSUMER_MODULE_OPTIONS';

// options provider
{
  provide: CONSUMER_MODULE_OPTIONS,
  useFactory: async (...args) => asyncOptions.useFactory(...args),
  inject: asyncOptions.inject ?? [],
}

// jetStream provider
{
  provide: NATS_JETSTREAM_TOKEN,
  useFactory: (options: ConsumerModuleOptions) => resolveJetStream(options),
  inject: [CONSUMER_MODULE_OPTIONS],
}

// dlq provider
{
  provide: DLQ_SUBJECT_BUILDER_TOKEN,
  useFactory: (options: ConsumerModuleOptions) => options.dlqSubjectBuilder,
  inject: [CONSUMER_MODULE_OPTIONS],
}
```

---

### 10. `forRootAsync` lacks `imports` support

- **File:** `src/consumer/consumer.module.ts`
- **Line:** 24
- **Issue:** `ConsumerModuleAsyncOptions` only exposes `useFactory` and `inject`. There is no way to import other modules whose providers are needed by the factory.
- **Suggested fix:** Add an optional `imports` property to `ConsumerModuleAsyncOptions` and pass it to the returned `DynamicModule`:

```ts
export interface ConsumerModuleAsyncOptions {
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference<unknown>>;
  useFactory: ...;
  inject?: ...;
}
```

Then include `imports: asyncOptions.imports ?? []` in the `DynamicModule` returned by `forRootAsync`.

---

### 11. `EventContext` imported from producer module

- **Files:** `src/consumer/consumer.service.ts` (line 3), `src/consumer/jetstream-consumer.service.ts` (line 20)
- **Issue:** The consumer layer imports `EventContext` from `../producer/producer.service`, creating an unnecessary coupling between producer and consumer.
- **Suggested fix:** Once Task 6 creates `src/common/envelope/event-context.interface.ts`, update both consumer files to import `EventContext` from the common envelope module.

---

### 12. `ConsumerModule` re-provides `EventLoggerService`

- **File:** `src/consumer/consumer.module.ts`
- **Lines:** 53, 95
- **Issue:** `EventLoggerService` is added as a provider inside `ConsumerModule`. If the host app already configures `EventLoggerService` (e.g., via a global `LoggingModule`), this can create a separate instance and ignore custom transports/levels.
- **Suggested fix:** Do not declare `EventLoggerService` as a provider in `ConsumerModule`. Instead, import the module that exports it (if one exists) or document that the host must provide `EventLoggerService` globally. This ensures consistent logging configuration across the application.

---

### 13. Malformed JSON and non-object payloads are nak’d, not DLQ’d

- **File:** `src/consumer/jetstream-consumer.service.ts`
- **Line:** 118
- **Issue:** `parseMessageData` throws a generic `Error` for invalid JSON or non-object payloads. The error handler nacks the message, which will cause JetStream to redeliver indefinitely for a poison-pill message.
- **Suggested fix:** Wrap parse errors in `EventConsumerException` so they follow the same DLQ routing path as validation failures. Alternatively, inspect `msg.redelivered` / `msg.info.redeliveryCount` and route to DLQ only after a configurable number of retries.

---

### 14. Missing handler throws generic `Error`

- **File:** `src/consumer/consumer.service.ts`
- **Line:** 43
- **Issue:** When no handler is registered, `dispatch` throws a generic `Error`. This results in a `nak` rather than DLQ routing.
- **Suggested fix:** Consider whether a missing handler should be treated as a permanent consumer failure. If so, throw `EventConsumerException` with `eventId`/`eventType` from the envelope so it is routed to the DLQ and logged consistently. If redelivery is desired, keep the current behavior but document the decision.

---

## Recommended Fix Order

1. Address rule violations first so subsequent verification passes cleanly:
   - Refactor >2-parameter methods (issues 1, 2, 3).
   - Split the oversized spec file (issue 4).
   - Remove `as any` from tests (issue 5).
2. Improve correctness and observability:
   - Fix DLQ payload (issue 6).
   - Log DLQ publish failures (issue 7).
   - Handle subscription promise safely (issue 8).
3. Harden module configuration:
   - Avoid double factory invocation (issue 9).
   - Add `imports` support (issue 10).
   - Resolve `EventLoggerService` provider duplication (issue 12).
4. Align with upcoming Task 6:
   - Move `EventContext` import to common envelope (issue 11).
5. Decide on poison-pill and missing-handler behavior (issues 13, 14) and update tests accordingly.
