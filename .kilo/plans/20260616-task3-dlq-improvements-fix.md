# Fix Plan: Task 3 — DLQ Improvements Code Review

**Original Plan:** `.kilo/plans/20260616-task3-dlq-improvements.md`

**Review Status:** Issues found — implementation is functionally correct and tests pass, but it violates two coding rules.

---

## Issues Found

### 1. `src/consumer/jetstream-consumer.service.ts` exceeds max-lines-per-file

- **Current:** 275 lines.
- **Rule:** Source files in `src/` must not exceed 200 lines.
- **Impact:** The file has taken on too many responsibilities (subscription handling, validation, DLQ routing, payload building).

### 2. `publishDlqOrNak` has more than 2 parameters

- **Current signature:**

```ts
private async publishDlqOrNak(
  dlqSubject: string,
  dlqPayload: Record<string, unknown>,
  msg: JsMsg,
  originalSubject: string,
): Promise<void>
```

- **Rule:** Methods/functions must not have more than 2 parameters; extra params must be encapsulated in an object.

### 3. `buildExceptionDlqPayload` has more than 2 parameters

- **Current signature:**

```ts
private buildExceptionDlqPayload(
  subject: string,
  exception: EventConsumerException,
  originalPayload?: Record<string, unknown>,
): Record<string, unknown>
```

- **Rule:** Same max-arguments-per-method rule.

### 4. (Optional) Spec file line counts

- `src/consumer/jetstream-consumer.service.spec.ts` (382 lines) and `src/common/utils/subject.builder.spec.ts` (215 lines) exceed 200 lines.
- **Decision:** Existing test files in this repo already exceed 200 lines, so treat this as an accepted convention for `.spec.ts` files unless the project later decides otherwise. The fix plan focuses on production code.

---

## Fix Strategy

Extract all DLQ-specific behavior from `JetStreamConsumerService` into a dedicated, non-exported helper class `ConsumerDlqHandler` in a new file. This reduces the service to its core responsibilities and keeps the DLQ logic cohesive and testable.

Replace positional parameter overloads with small, single-purpose option objects.

The public API (`JetStreamConsumerService.moveToDlq`) remains unchanged; it delegates to the handler.

---

## Step-by-Step Fix

### Step 1: Create `src/consumer/consumer-dlq.handler.ts`

Add a new helper class that owns DLQ publishing and payload construction.

```ts
import { JetStreamClient, JsMsg } from 'nats';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { encodeEvent } from '../common/utils/serialization.utils';
import { EventLoggerService, EventErrorLogContext } from '../logging/event-logger.service';
import { DlqRoutingOptions } from './subscribe-options.interface';
import { MoveToDlqOptions } from './move-to-dlq-options.interface';

/** Dependencies required by {@link ConsumerDlqHandler}. */
interface ConsumerDlqHandlerDeps {
  jetStream: JetStreamClient;
  logger: EventLoggerService;
  dlqSubjectBuilder: (subject: string) => string;
}

/** Options for publishing a DLQ payload and deciding the fate of the source message. */
interface PublishDlqOptions {
  dlqSubject: string;
  dlqPayload: Record<string, unknown>;
  msg: JsMsg;
  originalSubject: string;
}

/** Options for building a DLQ payload from an {@link EventConsumerException}. */
interface BuildExceptionDlqPayloadOptions {
  subject: string;
  exception: EventConsumerException;
  originalPayload?: Record<string, unknown>;
}

/** Handles Dead Letter Queue routing and payload construction for a JetStream consumer. */
export class ConsumerDlqHandler {
  private readonly jetStream: JetStreamClient;
  private readonly logger: EventLoggerService;
  private readonly dlqSubjectBuilder: (subject: string) => string;

  constructor(deps: ConsumerDlqHandlerDeps) {
    this.jetStream = deps.jetStream;
    this.logger = deps.logger;
    this.dlqSubjectBuilder = deps.dlqSubjectBuilder;
  }

  /** Routes a message to the DLQ because an {@link EventConsumerException} was thrown. */
  async routeToDlq(options: DlqRoutingOptions): Promise<void> {
    const { exception, msg, subject, originalPayload } = options;
    const dlqSubject = this.dlqSubjectBuilder(subject);
    const errorCtx = this.exceptionToErrorContext(exception, subject);
    this.logger.logEventDlq(errorCtx);
    const dlqPayload = this.buildExceptionDlqPayload({ subject, exception, originalPayload });
    await this.publishDlqOrNak({ dlqSubject, dlqPayload, msg, originalSubject: subject });
  }

  /** Manually routes a JetStream message to the DLQ. */
  async moveToDlq(options: MoveToDlqOptions): Promise<void> {
    const subject = options.subject ?? options.message.subject;
    const dlqSubject = this.dlqSubjectBuilder(subject);
    const dlqPayload = this.buildManualDlqPayload(subject, options);
    await this.publishDlqOrNak({ dlqSubject, dlqPayload, msg: options.message, originalSubject: subject });
  }

  /** Builds a DLQ payload for manual routing via {@link moveToDlq}. */
  private buildManualDlqPayload(subject: string, options: MoveToDlqOptions): Record<string, unknown> {
    return {
      originalSubject: subject,
      originalPayload: options.originalPayload ?? {},
      error: {
        name: 'ManualDLQRouting',
        message: options.reason,
      },
      failedAt: new Date().toISOString(),
    };
  }

  /** Publishes a DLQ payload; naks the message if publish fails. */
  private async publishDlqOrNak(options: PublishDlqOptions): Promise<void> {
    const { dlqSubject, dlqPayload, msg, originalSubject } = options;
    try {
      await this.jetStream.publish(dlqSubject, encodeEvent(dlqPayload));
      msg.ack();
    } catch (publishError: unknown) {
      this.logGeneralError(publishError, originalSubject);
      msg.nak();
    }
  }

  /** Builds a DLQ payload from an {@link EventConsumerException}, including optional metadata. */
  private buildExceptionDlqPayload(options: BuildExceptionDlqPayloadOptions): Record<string, unknown> {
    const { subject, exception, originalPayload } = options;
    const errorInfo = this.buildErrorInfo(exception);
    return {
      originalSubject: exception.originalSubject ?? subject,
      originalPayload: originalPayload ?? {},
      error: errorInfo,
      failedAt: new Date().toISOString(),
    };
  }

  /** Extracts error info from an {@link EventConsumerException}, including optional DLQ metadata. */
  private buildErrorInfo(exception: EventConsumerException): Record<string, unknown> {
    const info: Record<string, unknown> = {
      name: exception.name,
      message: exception.message,
      eventId: exception.eventId,
      eventType: exception.eventType,
      correlationId: exception.correlationId,
      stack: exception.stack,
    };
    if (exception.dlqReason !== undefined) {
      info.dlqReason = exception.dlqReason;
    }
    if (exception.retryCount !== undefined) {
      info.retryCount = exception.retryCount;
    }
    return info;
  }

  private logGeneralError(error: unknown, subject: string): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger.logEventError({
      eventId: 'unknown',
      eventType: 'unknown',
      subject,
      error: err.message,
      stack: err.stack,
    });
  }

  private exceptionToErrorContext(exception: EventConsumerException, subject: string): EventErrorLogContext {
    return {
      eventId: exception.eventId,
      eventType: exception.eventType,
      subject,
      correlationId: exception.correlationId,
      error: exception.message,
      stack: exception.stack,
      dlqReason: exception.dlqReason,
      retryCount: exception.retryCount,
    };
  }
}
```

**Verification:**
- File is under 200 lines.
- No method has more than 2 parameters.
- Max nesting depth remains ≤ 2.

---

### Step 2: Refactor `src/consumer/jetstream-consumer.service.ts`

Remove DLQ methods and delegate to `ConsumerDlqHandler`.

1. Add import:

```ts
import { ConsumerDlqHandler } from './consumer-dlq.handler';
```

2. Replace the DLQ-related private methods with a single handler field:

```ts
@Injectable()
export class JetStreamConsumerService {
  private readonly jetStream: JetStreamClient;
  private readonly consumerService: ConsumerService;
  private readonly logger: EventLoggerService;
  private readonly dlqSubjectBuilder: (subject: string) => string;
  private readonly dlqHandler: ConsumerDlqHandler;

  constructor(@Inject(JETSTREAM_CONSUMER_DEPS_TOKEN) deps: JetStreamConsumerDeps) {
    this.jetStream = deps.jetStream;
    this.consumerService = deps.consumerService;
    this.logger = deps.logger;
    this.dlqSubjectBuilder = deps.dlqSubjectBuilder ?? defaultDlqSubjectBuilder;
    this.dlqHandler = new ConsumerDlqHandler({
      jetStream: this.jetStream,
      logger: this.logger,
      dlqSubjectBuilder: this.dlqSubjectBuilder,
    });
  }

  // ... subscribe, processMessage remain unchanged ...

  /**
   * Manually routes a JetStream message to the Dead Letter Queue.
   *
   * Delegates to the internal {@link ConsumerDlqHandler}.
   *
   * @param options - Message, reason, and optional subject/payload for DLQ routing.
   */
  async moveToDlq(options: MoveToDlqOptions): Promise<void> {
    return this.dlqHandler.moveToDlq(options);
  }

  // ... processSubscription, handleMessage, validateEnvelope, parseMessageData,
  // isInvalidEventPayload, createValidationException, logGeneralError,
  // exceptionToErrorContext, toLogContext remain unchanged ...
```

3. Update `handleError` to delegate:

```ts
private async handleError(options: ErrorHandlingOptions): Promise<void> {
  if (options.error instanceof EventConsumerException) {
    await this.dlqHandler.routeToDlq({
      exception: options.error,
      msg: options.msg,
      subject: options.subject,
      originalPayload: options.originalPayload,
    });
    return;
  }
  options.msg.nak();
  this.logGeneralError(options.error, options.subject);
}
```

4. Remove these methods from `JetStreamConsumerService`:
   - `moveToDlq` body (keep public wrapper)
   - `buildManualDlqPayload`
   - `publishDlqOrNak`
   - `routeToDlq`
   - `buildExceptionDlqPayload`
   - `buildErrorInfo`

**Verification:**
- `src/consumer/jetstream-consumer.service.ts` is under 200 lines.
- Public API unchanged.
- All imports still valid.

---

### Step 3: Add unit tests for `ConsumerDlqHandler`

Create `src/consumer/consumer-dlq.handler.spec.ts` and move DLQ-specific tests there:

- `routeToDlq` publishes to DLQ subject and acks on success.
- `routeToDlq` includes `dlqReason` and `retryCount` in payload when provided.
- `routeToDlq` falls back to consumer subject when `originalSubject` is not set.
- `routeToDlq` naks and logs when DLQ publish fails.
- `moveToDlq` publishes to DLQ subject and acks.
- `moveToDlq` uses custom subject and original payload.
- `moveToDlq` naks and logs when DLQ publish fails.

Keep the integration-level tests in `jetstream-consumer.service.spec.ts` that verify the full `processMessage` flow, but thin them so the service spec stays focused on orchestration.

**Verification:** New handler tests pass; existing service tests pass.

---

### Step 4: Run verification commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

**Verification:** All checks pass.

---

### Step 5: Commit fixes

```bash
git add -A
git status  # Verify only intended files are staged
git commit -m "refactor: extract DLQ handling to ConsumerDlqHandler and fix param-count violations"
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/consumer/consumer-dlq.handler.ts` | Create |
| `src/consumer/consumer-dlq.handler.spec.ts` | Create |
| `src/consumer/jetstream-consumer.service.ts` | Modify (remove DLQ methods, delegate to handler) |
| `src/consumer/jetstream-consumer.service.spec.ts` | Modify (trim DLQ-specific tests, keep integration tests) |

---

## Post-Fix Checklist

- [ ] `src/consumer/jetstream-consumer.service.ts` ≤ 200 lines.
- [ ] `src/consumer/consumer-dlq.handler.ts` ≤ 200 lines.
- [ ] No method has more than 2 parameters.
- [ ] Max nesting depth ≤ 2.
- [ ] All existing and new tests pass.
- [ ] Lint and typecheck pass.
- [ ] Build succeeds.
- [ ] No commented-out code introduced.
- [ ] Public API unchanged (`moveToDlq`, `EventConsumerException`, `buildDlqSubject`, `MoveToDlqOptions`).
