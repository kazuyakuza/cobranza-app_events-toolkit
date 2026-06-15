# Task 2 — Fix Plan: @OnRequestReply Decorator-Based Response Handling

## Review Summary

- **Build status**: `npm run build` passes.
- **Test status**: `npm test` passes (330 tests, 36 suites).
- **Lint status**: ESLint reports Prettier formatting errors in several Task 2 files and unrelated pre-existing request-reply files.

## Issues Found

### 1. Prettier / Lint Errors (Task 2 Files)

| File | Count | Description |
|------|-------|-------------|
| `src/consumer/decorators/on-request-reply.decorator.spec.ts` | 4 | Multi-line `Reflect.getMetadata` calls should be single-line. |
| `src/consumer/decorators/on-request-reply.explorer.ts` | 1 | Constructor parameter should be single-line. |
| `src/consumer/index.ts` | 1 | `OnRequestReply` re-export should be multi-line. |
| `src/consumer/request-reply-consumer.service.spec.ts` | 1 | `createTestEvent` signature should be multi-line. |
| `src/consumer/request-reply-consumer.service.ts` | 2 | Multi-line import and `.catch` should be single-line. |

### 2. Functional Bug: `forRootAsync` Ignores `responseSubjectPattern`

`src/consumer/consumer.module.ts` (lines 195–204) hardcodes `responseSubjectPattern: undefined` in the async deps provider:

```typescript
const requestReplyConsumerDepsProvider: Provider = {
  provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
  useFactory: (connection: ResolvedConnection, logger: EventLoggerService) => ({
    jetStream: connection.jetStream,
    logger,
    responseSubjectPattern: undefined,
    dlqSubjectBuilder: connection.dlqSubjectBuilder,
  }),
  inject: [RESOLVED_CONNECTION_TOKEN, EventLoggerService],
};
```

It must read `moduleOptions.responseSubjectPattern` exactly like the sync `forRoot` provider does.

### 3. Max Lines per File Violations

| File | Current Lines | Limit | Status |
|------|---------------|-------|--------|
| `src/consumer/request-reply-consumer.service.ts` | 266 | 200 | Exceeded |
| `src/consumer/consumer.module.ts` | 234 | 200 | Exceeded |

### 4. Test Coverage Gaps

- `request-reply-consumer.service.spec.ts` tests only `registerHandler`, `dispatch`, `getHandler`, and `handlerCount`. It does **not** test:
  - `subscribe` / `onModuleInit` NATS subscription creation
  - Successful end-to-end message processing (`handleMessage`/`processSubscription`)
  - ACK on success
  - Invalid JSON payload handling
  - Validation failure handling
  - DLQ routing on `EventConsumerException`
  - NACK on unexpected errors
  - `logEventConsumed` invocation
- `consumer.module.spec.ts` does not verify that `responseSubjectPattern` is actually forwarded to the deps object in `forRootAsync`.
- `consumer.module.spec.ts` "should pass responseSubjectPattern ... via forRoot" test only asserts provider existence and injection token, not the value itself.

### 5. Documentation Out of Date

`.agent/project-structure.md` does not list the new `RequestReplyConsumerService`, `RegisterHandlerOptions`, or `@OnRequestReply` decorator files.

## Fix Plan

### Step 1 — Fix Prettier Formatting in Task 2 Files

Run `npm run format` or apply Prettier fixes to the five Task 2 files listed above. Ensure `npm run lint` passes for Task 2 files.

### Step 2 — Fix `forRootAsync` `responseSubjectPattern` Wiring

Update `src/consumer/consumer.module.ts`:

```typescript
const requestReplyConsumerDepsProvider: Provider = {
  provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
  useFactory: (connection: ResolvedConnection, logger: EventLoggerService, moduleOptions: ConsumerModuleOptions) => ({
    jetStream: connection.jetStream,
    logger,
    responseSubjectPattern: moduleOptions.responseSubjectPattern,
    dlqSubjectBuilder: connection.dlqSubjectBuilder,
  }),
  inject: [RESOLVED_CONNECTION_TOKEN, EventLoggerService, CONSUMER_MODULE_OPTIONS],
};
```

### Step 3 — Reduce `consumer.module.ts` to ≤200 Lines

Extract provider-factory functions into a new file `src/consumer/consumer-module.providers.ts`:

- `createDiscoveryPairProvider()`
- `createOnEventExplorerDepsProvider()`
- `createJetStreamConsumerDepsProvider()`
- `createRequestReplyExplorerDepsProvider()`
- `createRequestReplyConsumerDepsProvider()`
- `createOptionsProvider(asyncOptions)`
- `createResolvedConnectionProvider()`
- `createConsumerServicesProvider()`

`consumer.module.ts` imports these helpers and keeps only `resolveJetStream`, the interfaces, and the two `DynamicModule` factory methods. Target ≤180 lines.

### Step 4 — Reduce `request-reply-consumer.service.ts` to ≤200 Lines

Extract NATS message-processing pipeline into a new file `src/consumer/request-reply-message-processor.ts`:

- `RequestReplyMessageProcessor` class:
  - `constructor(deps: { jetStream; logger; dlqSubjectBuilder; dispatch(event: EventEnvelope<unknown>, context: EventContext): Promise<void> })`
  - `async processMessage(msg: JsMsg, subject: string): Promise<void>`
  - `private parseMessageData(msg)`
  - `private validateEnvelope(plain, subject)`
  - `private isInvalidEventPayload(parsed)`
  - `private createValidationException(options)`
  - `private async handleError(options)`
  - `private async routeToDlq(options)`
  - `private logGeneralError(error, subject)`
  - `private exceptionToErrorContext(exception, subject)`
  - `private toLogContext(subject, envelope)`

`RequestReplyConsumerService` becomes:

- Constructor stores deps.
- `onModuleInit` calls `subscribe`.
- `registerHandler`, `dispatch`, `getHandler`, `handlerCount`, `subscribe`.
- `private processSubscription`, `private findHandler`, `private buildHandlerKey`.
- Delegates message handling to `RequestReplyMessageProcessor`.

This keeps the service focused on registration/dispatch and splits the heavy parsing/DLQ logic. Target ≤160 lines.

### Step 5 — Add Message-Processing Tests

Expand `src/consumer/request-reply-consumer.service.spec.ts` with tests for:

1. `subscribe` calls `jetStream.subscribe` with the provided subject.
2. `onModuleInit` subscribes to the configured `responseSubjectPattern`.
3. Successfully processing a valid message acks and logs consumed.
4. Invalid JSON payload NACKs and logs an error.
5. Non-object JSON payload NACKs and logs an error.
6. Validation failure routes to DLQ, publishes to `dlq.{subject}`, and acks the original message.
7. Unexpected handler error NACKs and logs an error.
8. DLQ publish failure NACKs and logs an error.

Use a fake `JsMsg` factory helper:

```typescript
function createJsMsg(overrides: Partial<JsMsg> = {}): JsMsg {
  return {
    data: encodeEvent({ ... }),
    subject: 'company.tenant-1.response.v1',
    ack: jest.fn(),
    nak: jest.fn(),
    ...overrides,
  } as unknown as JsMsg;
}
```

### Step 6 — Strengthen Module Tests

Update `src/consumer/consumer.module.spec.ts`:

1. In the existing `forRoot` test, invoke `requestReplyConsumerDepsProvider.useFactory` with mocked dependencies and assert the returned object contains `responseSubjectPattern: 'custom.response.v1'`.
2. Add a new `forRootAsync` test that invokes the factory with mocked `CONSUMER_MODULE_OPTIONS`, `EventLoggerService`, and `ResolvedConnection`, and asserts `responseSubjectPattern` equals the value from module options.

### Step 7 — Update Project Structure Documentation

Update `.agent/project-structure.md` to reflect new consumer files:

- `consumer/ - ConsumerModule, ConsumerService, JetStreamConsumerService, RequestReplyConsumerService (barrel: index.ts)`
- `consumer/decorators/ - @OnEvent() and @OnRequestReply() decorators`

## Files to Modify

| File | Change |
|------|--------|
| `src/consumer/decorators/on-request-reply.decorator.spec.ts` | Prettier formatting |
| `src/consumer/decorators/on-request-reply.explorer.ts` | Prettier formatting |
| `src/consumer/index.ts` | Prettier formatting |
| `src/consumer/request-reply-consumer.service.spec.ts` | Prettier formatting + new tests |
| `src/consumer/request-reply-consumer.service.ts` | Prettier formatting + split out message processor |
| `src/consumer/request-reply-message-processor.ts` | New: extracted message/DLQ logic |
| `src/consumer/consumer.module.ts` | Fix async wiring + extract providers |
| `src/consumer/consumer-module.providers.ts` | New: provider factory helpers |
| `src/consumer/consumer.module.spec.ts` | Strengthen responseSubjectPattern tests |
| `.agent/project-structure.md` | Document new files |

## Verification

After fixes:

1. `npm run build` passes.
2. `npm run lint` passes for all Task 2 files.
3. `npm test` passes with new tests included.
4. `src/consumer/request-reply-consumer.service.ts` ≤ 200 lines.
5. `src/consumer/consumer.module.ts` ≤ 200 lines.
6. `forRootAsync` forwards `responseSubjectPattern` from module options.
