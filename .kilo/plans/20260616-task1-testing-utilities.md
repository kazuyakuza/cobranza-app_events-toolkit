# Plan: Task 1 — Testing Utilities

**Date:** 2026-06-16  
**Task:** Create testing utilities for `@cobranza-app/events-toolkit` including mock services, a test module, and assertion helpers.

---

## Pre-Analysis

### Current State

- Library: `@cobranza-app/events-toolkit` v0.5.0
- Existing services to mock: `ProducerService`, `ConsumerService`, `JetStreamConsumerService`, `OutboxService`, `RequestReplyService`, `EventLoggerService`
- All services use NestJS DI with specific injection tokens
- Tests use `@nestjs/testing` + Jest
- Real services depend on NATS JetStream connections, making unit testing without mocks difficult

### Key Interfaces & Injection Tokens

| Service | Injection Token(s) | Key Methods |
|---|---|---|
| `ProducerService` | `JETSTREAM_TOKEN`, `EventLoggerService` | `publish(subject, event)`, `emit<T>(options)` |
| `ConsumerService` | none | `registerHandler(subject, handler)`, `dispatch(options)`, `getHandler(subject)`, `handlerCount` |
| `JetStreamConsumerService` | `JETSTREAM_CONSUMER_DEPS_TOKEN` | `subscribe(options)`, `processMessage(msg, subject)` |
| `OutboxService` | `OUTBOX_SERVICE_DEPS_TOKEN` | `saveToOutbox(event, subject)`, `sendRequestThroughOutbox(event, subject)`, `startProcessor()`, `stopProcessor()` |
| `RequestReplyService` | `REQUEST_REPLY_DEPS_TOKEN` | `request<T,R>()`, `sendResponse()`, `isRequestReplyMessage()`, `sendRequest<T>()`, `buildResponseEnvelope<R>()` |
| `EventLoggerService` | none | `logEventEmitted()`, `logEventConsumed()`, `logEventError()`, `logEventDlq()`, `logOutboxSaved()`, `logOutboxProcessed()`, `logOutboxFailed()`, `logOutboxDlq()` |

### Coding Rules Compliance

- Max 200 lines per source file, ideally ≤125 excluding blanks/comments/imports
- Max 50 lines per method body
- Max 2 levels of nesting depth
- Max 2 parameters per method (use option objects for more)
- Prefer private members
- Self-documenting code (no comments unless complex logic)
- No commented-out code

---

## High-Level Approach

1. Create `src/testing/` directory with mock services and testing utilities
2. Each mock service records method calls and provides query/clear methods
3. `EventsToolkitTestModule.forRoot()` registers all mocks as NestJS providers (replacing real services)
4. Assertion helpers wrap Jest `expect()` for event-specific checks
5. Documentation with example tests in `docs/testing-utilities.md`
6. Update `src/index.ts` to re-export testing module
7. Update `.agent/project-structure.md` to include `testing/` folder
8. Add unit tests for the mock services themselves

---

## Step-by-Step Implementation Plan

### Step 1: Create `src/testing/` directory

- Create the `src/testing/` directory

### Step 2: Create `src/testing/published-event.interface.ts`

**Purpose:** Define the record type for tracking published events.

```typescript
import { EventEnvelope } from '../common/envelope/event-envelope.class';

/** Record of a single event publication captured by MockProducerService. */
export interface PublishedEvent {
  /** NATS subject the event was published to. */
  subject: string;
  /** The event envelope that was published. */
  event: EventEnvelope<unknown>;
  /** ISO 8601 timestamp when the publish call was made. */
  timestamp: string;
}
```

**Lines:** ~12 (well under 200 limit)

### Step 3: Create `src/testing/saved-outbox-event.interface.ts`

**Purpose:** Define the record type for tracking outbox saves.

```typescript
import { EventEnvelope } from '../common/envelope/event-envelope.class';

/** Record of an event saved to outbox captured by MockOutboxService. */
export interface SavedOutboxEvent {
  /** The event envelope that was saved. */
  event: EventEnvelope<unknown>;
  /** NATS subject the event would be published to. */
  subject: string;
}
```

**Lines:** ~10

### Step 4: Create `src/testing/mock-producer.service.ts`

**Purpose:** Mock for `ProducerService` that records all published events.

**Key design decisions:**
- Mirror the real `ProducerService` API (`publish`, `emit`)
- Store `PublishedEvent` records internally
- Provide query methods: `getPublishedEvents()`, `getLastEvent()`, `getPublishedSubjects()`, `count`, `clear()`
- Use `generateEventId()` and `nowIso()` in `emit()` for realistic envelope construction
- Private members, self-documenting names

```typescript
import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { EmitOptions } from '../producer/producer.service';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { PublishedEvent } from './published-event.interface';

@Injectable()
export class MockProducerService {
  private readonly published: PublishedEvent[] = [];

  async publish(subject: string, event: EventEnvelope<unknown>): Promise<void> {
    this.recordPublish(subject, event);
  }

  async emit<T>(options: EmitOptions<T>): Promise<void> {
    const envelope = this.buildEnvelope(options);
    await this.publish(options.subject, envelope);
  }

  getPublishedEvents(): ReadonlyArray<PublishedEvent> {
    return this.published;
  }

  getLastEvent(): PublishedEvent | undefined {
    return this.published.at(-1);
  }

  getPublishedSubjects(): string[] {
    return this.published.map((entry) => entry.subject);
  }

  get count(): number {
    return this.published.length;
  }

  clear(): void {
    this.published.length = 0;
  }

  private recordPublish(subject: string, event: EventEnvelope<unknown>): void {
    this.published.push({ subject, event, timestamp: nowIso() });
  }

  private buildEnvelope<T>(options: EmitOptions<T>): EventEnvelope<T> {
    const { context, data } = options;
    return new EventEnvelope<T>({
      id: generateEventId(),
      produced_at: nowIso(),
      type: context.type,
      version: context.version,
      producer: context.producer,
      company_id: context.companyId,
      actor_type: context.actorType,
      actor_id: context.actorId,
      correlation_id: context.correlationId,
      causation_id: context.causationId,
      trace_id: context.traceId,
      reply_to: context.replyTo,
      data,
    });
  }
}
```

**Lines:** ~65 (well under 200)

### Step 5: Create `src/testing/mock-consumer.service.ts`

**Purpose:** Mock for `ConsumerService` that records handlers and simulates incoming events.

**Key design decisions:**
- Mirror `ConsumerService` API (`registerHandler`, `dispatch`, `getHandler`, `handlerCount`)
- Add `simulateEvent(subject, event)` convenience method for tests
- Internally stores handlers in a `Map` (same as real service)
- `simulateEvent` creates `EventContext` via `envelopeToContext()` and calls `dispatch()`

```typescript
import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { EventHandler } from '../consumer/consumer.service';
import { DispatchOptions } from '../consumer/dispatch-options.interface';
import { envelopeToContext } from '../consumer/subscribe-options.interface';
import { EventConsumerException } from '../common/errors/event-consumer.exception';

@Injectable()
export class MockConsumerService {
  private readonly handlers = new Map<string, EventHandler>();

  registerHandler(subject: string, handler: EventHandler): void {
    this.handlers.set(subject, handler);
  }

  async dispatch(options: DispatchOptions): Promise<void> {
    const handler = this.getHandler(options.subject);
    if (!handler) {
      throw new EventConsumerException({
        message: `No handler registered for subject: ${options.subject}`,
        eventId: options.event.id,
        eventType: options.event.type,
        correlationId: options.event.correlation_id,
      });
    }
    await handler(options.event, options.context);
  }

  getHandler(subject: string): EventHandler | undefined {
    return this.handlers.get(subject);
  }

  get handlerCount(): number {
    return this.handlers.size;
  }

  /** Simulates an incoming event by dispatching it to the registered handler. */
  async simulateEvent(subject: string, event: EventEnvelope<unknown>): Promise<void> {
    const context = envelopeToContext(event);
    await this.dispatch({ subject, event, context });
  }

  clear(): void {
    this.handlers.clear();
  }
}
```

**Lines:** ~50 (well under 200)

### Step 6: Create `src/testing/mock-event-logger.service.ts`

**Purpose:** Silent mock for `EventLoggerService` that optionally records log calls.

**Key design decisions:**
- All `log*` methods are no-ops by default (silent in test output)
- Optionally records calls for assertion if needed
- Uses a `LogRecord` type with `method` and `context` fields
- Max 2 params per method — all log methods take a single context object (matching real `EventLoggerService`)

```typescript
import { Injectable } from '@nestjs/common';
import {
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from '../logging/event-logger.service';

export type LogMethod =
  | 'logEventEmitted'
  | 'logEventConsumed'
  | 'logEventError'
  | 'logEventDlq'
  | 'logOutboxSaved'
  | 'logOutboxProcessed'
  | 'logOutboxFailed'
  | 'logOutboxDlq';

export interface LogRecord {
  method: LogMethod;
  context: EventLogContext | EventErrorLogContext | OutboxLogContext | OutboxErrorLogContext;
}

@Injectable()
export class MockEventLoggerService {
  private readonly logs: LogRecord[] = [];

  logEventEmitted(context: EventLogContext): void {
    this.recordLog('logEventEmitted', context);
  }

  logEventConsumed(context: EventLogContext): void {
    this.recordLog('logEventConsumed', context);
  }

  logEventError(context: EventErrorLogContext): void {
    this.recordLog('logEventError', context);
  }

  logEventDlq(context: EventErrorLogContext): void {
    this.recordLog('logEventDlq', context);
  }

  logOutboxSaved(context: OutboxLogContext): void {
    this.recordLog('logOutboxSaved', context);
  }

  logOutboxProcessed(context: OutboxLogContext): void {
    this.recordLog('logOutboxProcessed', context);
  }

  logOutboxFailed(context: OutboxErrorLogContext): void {
    this.recordLog('logOutboxFailed', context);
  }

  logOutboxDlq(context: OutboxErrorLogContext): void {
    this.recordLog('logOutboxDlq', context);
  }

  getLogs(): ReadonlyArray<LogRecord> {
    return this.logs;
  }

  clear(): void {
    this.logs.length = 0;
  }

  private recordLog(method: LogMethod, context: LogRecord['context']): void {
    this.logs.push({ method, context });
  }
}
```

**Lines:** ~70 (well under 200)

### Step 7: Create `src/testing/mock-outbox.service.ts`

**Purpose:** Mock for `OutboxService` that records `saveToOutbox` and `sendRequestThroughOutbox` calls.

**Key design decisions:**
- Record saved events with subject
- `startProcessor()` and `stopProcessor()` are no-ops
- Provide query/clear methods

```typescript
import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { SavedOutboxEvent } from './saved-outbox-event.interface';

@Injectable()
export class MockOutboxService {
  private readonly saved: SavedOutboxEvent[] = [];

  async saveToOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  async sendRequestThroughOutbox(event: EventEnvelope<unknown>, subject: string): Promise<void> {
    this.saved.push({ event, subject });
  }

  startProcessor(): void {
    // no-op for testing
  }

  stopProcessor(): void {
    // no-op for testing
  }

  getSavedEvents(): ReadonlyArray<SavedOutboxEvent> {
    return this.saved;
  }

  get count(): number {
    return this.saved.length;
  }

  clear(): void {
    this.saved.length = 0;
  }
}
```

**Lines:** ~35 (well under 200)

### Step 8: Create `src/testing/mock-request-reply.service.ts`

**Purpose:** Mock for `RequestReplyService` that records request and response calls.

**Key design decisions:**
- Record all `request`, `sendResponse`, and `sendRequest` calls
- `buildResponseEnvelope` delegates to real logic (imports from `request-reply.helpers`)
- `isRequestReplyMessage` delegates to real logic
- Provide query/clear methods
- `request()` returns a configurable mock response (or a default empty response)

```typescript
import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import {
  RequestReplyRequestOptions,
  RequestReplyResponse,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
} from '../request-reply/request-reply.types';

export interface RequestCall {
  subject: string;
  payload: unknown;
  options: RequestReplyRequestOptions;
  context: EventContext;
}

export interface SendResponseCall {
  correlationId: string;
  event: EventEnvelope<unknown>;
}

@Injectable()
export class MockRequestReplyService {
  private readonly requests: RequestCall[] = [];
  private readonly sendResponseCalls: SendResponseCall[] = [];
  private readonly sendRequestCalls: SendRequestOptions<unknown>[] = [];
  private mockResponse: RequestReplyResponse<unknown> = { data: {}, raw: new Uint8Array(0) };

  /** Sets the response that `request()` will resolve with. */
  setMockResponse<R>(response: RequestReplyResponse<R>): void {
    this.mockResponse = response as RequestReplyResponse<unknown>;
  }

  async request<T, R>(
    subject: string,
    payload: T,
    options: RequestReplyRequestOptions & { context: EventContext },
  ): Promise<RequestReplyResponse<R>> {
    const { context, ...requestOptions } = options;
    this.requests.push({ subject, payload, options: requestOptions, context });
    return this.mockResponse as RequestReplyResponse<R>;
  }

  async sendResponse(correlationId: string, responseEvent: EventEnvelope<unknown>): Promise<void> {
    this.sendResponseCalls.push({ correlationId, event: responseEvent });
  }

  isRequestReplyMessage(event: EventEnvelope<unknown>): boolean {
    return typeof event.reply_to === 'string' && event.reply_to.length > 0;
  }

  async sendRequest<T>(options: SendRequestOptions<T>): Promise<SendRequestResult> {
    this.sendRequestCalls.push(options as SendRequestOptions<unknown>);
    return { correlationId: 'mock-correlation-id' };
  }

  buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): EventEnvelope<R> {
    const preservedContext: EventContext = {
      ...options.responseContext,
      correlationId: options.requestEvent.correlation_id,
      causationId: options.requestEvent.id,
    };
    return new EventEnvelope<R>({
      id: 'evt_mock-response-id',
      produced_at: new Date().toISOString(),
      type: preservedContext.type,
      version: preservedContext.version,
      producer: preservedContext.producer,
      company_id: preservedContext.companyId,
      actor_type: preservedContext.actorType,
      actor_id: preservedContext.actorId,
      correlation_id: preservedContext.correlationId,
      causation_id: preservedContext.causationId,
      trace_id: preservedContext.traceId,
      data: options.responseData,
    });
  }

  getRequests(): ReadonlyArray<RequestCall> {
    return this.requests;
  }

  getSendResponseCalls(): ReadonlyArray<SendResponseCall> {
    return this.sendResponseCalls;
  }

  getSendRequestCalls(): ReadonlyArray<SendRequestOptions<unknown>>[] {
    return this.sendRequestCalls;
  }

  clear(): void {
    this.requests.length = 0;
    this.sendResponseCalls.length = 0;
    this.sendRequestCalls.length = 0;
    this.mockResponse = { data: {}, raw: new Uint8Array(0) };
  }
}
```

**Lines:** ~95 (well under 200)

**Issue:** `getSendRequestCalls` return type has an array typo. Fix: 

```typescript
getSendRequestCalls(): ReadonlyArray<SendRequestOptions<unknown>> {
  return this.sendRequestCalls;
}
```

### Step 9: Create `src/testing/events-toolkit-test.module.ts`

**Purpose:** NestJS DynamicModule that replaces all real services with mocks.

**Key design decisions:**
- `forRoot()` class method creates a global module with mock providers
- Uses `useExisting` to alias mock services as their real counterparts
- Exports both mock types and real service types so consumers can inject either
- Does NOT provide `JetStreamConsumerService` (requires real NATS subscription loop)
- Does NOT provide `RequestReplyConsumerService` (requires NATS)

```typescript
import { DynamicModule } from '@nestjs/common';
import { ProducerService } from '../producer/producer.service';
import { ConsumerService } from '../consumer/consumer.service';
import { OutboxService } from '../outbox/outbox.service';
import { RequestReplyService } from '../request-reply/request-reply.service';
import { EventLoggerService } from '../logging/event-logger.service';
import { MockProducerService } from './mock-producer.service';
import { MockConsumerService } from './mock-consumer.service';
import { MockEventLoggerService } from './mock-event-logger.service';
import { MockOutboxService } from './mock-outbox.service';
import { MockRequestReplyService } from './mock-request-reply.service';

/**
 * NestJS module that replaces real events-toolkit services with mock implementations.
 *
 * Provides mock services as both their concrete mock type and the real service
 * token, so test code can inject either `MockProducerService` (to access recording
 * methods) or `ProducerService` (to exercise the code under test).
 *
 * @example
 * ```ts
 * const module = await Test.createTestingModule({
 *   imports: [EventsToolkitTestModule.forRoot()],
 *   providers: [MyServiceUnderTest],
 * }).compile();
 * ```
 */
export class EventsToolkitTestModule {
  static forRoot(): DynamicModule {
    return {
      module: EventsToolkitTestModule,
      global: true,
      providers: [
        MockProducerService,
        { provide: ProducerService, useExisting: MockProducerService },
        MockConsumerService,
        { provide: ConsumerService, useExisting: MockConsumerService },
        MockEventLoggerService,
        { provide: EventLoggerService, useExisting: MockEventLoggerService },
        MockOutboxService,
        { provide: OutboxService, useExisting: MockOutboxService },
        MockRequestReplyService,
        { provide: RequestReplyService, useExisting: MockRequestReplyService },
      ],
      exports: [
        MockProducerService,
        ProducerService,
        MockConsumerService,
        ConsumerService,
        MockEventLoggerService,
        EventLoggerService,
        MockOutboxService,
        OutboxService,
        MockRequestReplyService,
        RequestReplyService,
      ],
    };
  }
}
```

**Lines:** ~65 (well under 200)

### Step 10: Create `src/testing/assertion.helpers.ts`

**Purpose:** Jest-compatible assertion helpers for event testing.

**Key design decisions:**
- Functions use `expect()` internally for Jest compatibility
- `EventMatchOptions` type for flexible event matching (max 2 params rule)
- `EnvelopeExpectations` type for envelope structure assertions (max 2 params rule)
- Import from mock service types, not real types (for clear API)

```typescript
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { MockProducerService } from './mock-producer.service';
import { PublishedEvent } from './published-event.interface';

/** Options for matching events in published event records. */
export interface EventMatchOptions {
  subject?: string;
  eventType?: string;
  companyId?: string;
}

/** Expected field values for envelope structure assertions. */
export interface EnvelopeExpectations {
  type?: string;
  version?: string;
  producer?: string;
  company_id?: string;
  actor_type?: string;
  actor_id?: string;
  correlation_id?: string;
}

/** Asserts that at least one event was published to the given subject. */
export function expectEventPublished(producer: MockProducerService, subject: string): void {
  const events = producer.getPublishedEvents();
  const matching = events.filter((e) => e.subject === subject);
  expect(matching.length).toBeGreaterThan(0);
}

/** Asserts that no events were published. */
export function expectNoEventsPublished(producer: MockProducerService): void {
  expect(producer.count).toBe(0);
}

/** Asserts events were published matching the given filter options. */
export function expectEventWithMatch(producer: MockProducerService, options: EventMatchOptions): void {
  const events = producer.getPublishedEvents();
  const matching = filterPublishedEvents(events, options);
  expect(matching.length).toBeGreaterThan(0);
}

/** Asserts an event envelope matches expected field values. */
export function expectEnvelope(envelope: EventEnvelope<unknown>, expectations: EnvelopeExpectations): void {
  const assertions = buildEnvelopeAssertions(envelope, expectations);
  for (const assertion of assertions) {
    assertion();
  }
}

function filterPublishedEvents(events: ReadonlyArray<PublishedEvent>, options: EventMatchOptions): PublishedEvent[] {
  let filtered = [...events];
  if (options.subject) {
    filtered = filtered.filter((e) => e.subject === options.subject);
  }
  if (options.eventType) {
    filtered = filtered.filter((e) => e.event.type === options.eventType);
  }
  if (options.companyId) {
    filtered = filtered.filter((e) => e.event.company_id === options.companyId);
  }
  return filtered;
}

function buildEnvelopeAssertions(
  envelope: EventEnvelope<unknown>,
  expectations: EnvelopeExpectations,
): Array<() => void> {
  const assertions: Array<() => void> = [];
  if (expectations.type) {
    assertions.push(() => expect(envelope.type).toBe(expectations.type));
  }
  if (expectations.version) {
    assertions.push(() => expect(envelope.version).toBe(expectations.version));
  }
  if (expectations.producer) {
    assertions.push(() => expect(envelope.producer).toBe(expectations.producer));
  }
  if (expectations.company_id) {
    assertions.push(() => expect(envelope.company_id).toBe(expectations.company_id));
  }
  if (expectations.actor_type) {
    assertions.push(() => expect(envelope.actor_type).toBe(expectations.actor_type));
  }
  if (expectations.actor_id) {
    assertions.push(() => expect(envelope.actor_id).toBe(expectations.actor_id));
  }
  if (expectations.correlation_id) {
    assertions.push(() => expect(envelope.correlation_id).toBe(expectations.correlation_id));
  }
  return assertions;
}
```

**Lines:** ~90 (well under 200)

### Step 11: Create `src/testing/index.ts` (barrel export)

```typescript
/**
 * @packageDocumentation
 * Testing utilities — mock services, test module, and assertion helpers
 * for unit-testing NestJS services that depend on events-toolkit.
 */

export { MockProducerService } from './mock-producer.service';
export { MockConsumerService } from './mock-consumer.service';
export { MockEventLoggerService, LogRecord, LogMethod } from './mock-event-logger.service';
export { MockOutboxService } from './mock-outbox.service';
export { MockRequestReplyService, RequestCall, SendResponseCall } from './mock-request-reply.service';
export { EventsToolkitTestModule } from './events-toolkit-test.module';
export {
  expectEventPublished,
  expectNoEventsPublished,
  expectEventWithMatch,
  expectEnvelope,
  EventMatchOptions,
  EnvelopeExpectations,
} from './assertion.helpers';
export { PublishedEvent } from './published-event.interface';
export { SavedOutboxEvent } from './saved-outbox-event.interface';
```

**Lines:** ~25

### Step 12: Update `src/index.ts` to add testing barrel export

Add at the end of `src/index.ts`:

```typescript
// ── Testing ──
export * from './testing';
```

### Step 13: Create `src/testing/mock-producer.service.spec.ts`

**Purpose:** Unit tests for `MockProducerService`.

Test cases:
1. `publish` records event with correct subject and envelope
2. `emit` builds envelope from EmitOptions and records it
3. `getLastEvent` returns the most recent event
4. `getPublishedSubjects` returns all subjects in order
5. `count` returns published event count
6. `clear` removes all recorded events
7. `getPublishedEvents` returns empty array initially

### Step 14: Create `src/testing/mock-consumer.service.spec.ts`

**Purpose:** Unit tests for `MockConsumerService`.

Test cases:
1. `registerHandler` adds handler and `handlerCount` reflects it
2. `dispatch` invokes registered handler with event and context
3. `dispatch` throws `EventConsumerException` for unregistered subject
4. `simulateEvent` creates context from envelope and dispatches
5. `clear` removes all registered handlers
6. `getHandler` returns `undefined` for unregistered subject

### Step 15: Create `src/testing/mock-event-logger.service.spec.ts`

**Purpose:** Unit tests for `MockEventLoggerService`.

Test cases:
1. Each `log*` method records a `LogRecord` with correct method name
2. `getLogs` returns all recorded logs
3. `clear` removes all recorded logs
4. All log methods execute without errors (no-op aspect)

### Step 16: Create `src/testing/mock-outbox.service.spec.ts`

**Purpose:** Unit tests for `MockOutboxService`.

Test cases:
1. `saveToOutbox` records event with correct subject
2. `sendRequestThroughOutbox` records event
3. `getSavedEvents` returns all saved events
4. `count` returns saved event count
5. `clear` removes all recorded events
6. `startProcessor` and `stopProcessor` are no-ops (no errors)

### Step 17: Create `src/testing/mock-request-reply.service.spec.ts`

**Purpose:** Unit tests for `MockRequestReplyService`.

Test cases:
1. `request` records call and returns mock response
2. `setMockResponse` overrides default response
3. `sendResponse` records call
4. `sendRequest` records call and returns mock result
5. `isRequestReplyMessage` returns true when `reply_to` is set
6. `buildResponseEnvelope` preserves correlation_id and causation_id
7. `clear` resets all recorded calls and mock response

### Step 18: Create `src/testing/events-toolkit-test.module.spec.ts`

**Purpose:** Integration test that verifies `EventsToolkitTestModule.forRoot()` correctly provides all mock services.

Test cases:
1. Module provides `MockProducerService` as `ProducerService`
2. Module provides `MockConsumerService` as `ConsumerService`
3. Module provides `MockEventLoggerService` as `EventLoggerService`
4. Module provides `MockOutboxService` as `OutboxService`
5. Module provides `MockRequestReplyService` as `RequestReplyService`
6. Injected `ProducerService` instance is the same as `MockProducerService` instance
7. All mock services are injectable and functional

### Step 19: Create `src/testing/assertion.helpers.spec.ts`

**Purpose:** Unit tests for assertion helpers.

Test cases:
1. `expectEventPublished` passes when matching subject exists
2. `expectEventPublished` fails when no matching subject
3. `expectNoEventsPublished` passes on empty producer
4. `expectNoEventsPublished` fails on non-empty producer
5. `expectEventWithMatch` filters by eventType
6. `expectEventWithMatch` filters by companyId
7. `expectEnvelope` checks type, version, producer, company_id
8. `expectEnvelope` only checks specified fields

### Step 20: Create `docs/testing-utilities.md`

**Purpose:** Documentation with example tests showing how to test a service that uses the toolkit.

**Content outline:**

1. **Overview** — Purpose and design philosophy
2. **Installation** — Import `EventsToolkitTestModule`
3. **Quick Start** — Basic test module setup
4. **MockProducerService** — API reference with examples
5. **MockConsumerService** — API reference with `simulateEvent()` examples
6. **MockEventLoggerService** — API reference
7. **MockOutboxService** — API reference
8. **MockRequestReplyService** — API reference
9. **Assertion Helpers** — `expectEventPublished`, `expectEnvelope`, etc.
10. **Example: Testing a Service that Publishes Events**
    ```typescript
    // Example showing a PaymentService that publishes events via ProducerService
    import { Test } from '@nestjs/testing';
    import { EventsToolkitTestModule, MockProducerService, expectEventPublished } from '@cobranza-app/events-toolkit/testing';

    describe('PaymentService', () => {
      let service: PaymentService;
      let mockProducer: MockProducerService;

      beforeEach(async () => {
        const module = await Test.createTestingModule({
          imports: [EventsToolkitTestModule.forRoot()],
          providers: [PaymentService],
        }).compile();

        service = module.get(PaymentService);
        mockProducer = module.get(MockProducerService);
      });

      afterEach(() => {
        mockProducer.clear();
      });

      it('should publish payment proof uploaded event', async () => {
        await service.uploadProof({ companyId: '...', amount: 250 });
        expectEventPublished(mockProducer, 'company.550e8400.payment.proof.uploaded.v1');
      });

      it('should publish event with correct envelope structure', async () => {
        await service.uploadProof({ companyId: '550e...', amount: 250 });
        const lastEvent = mockProducer.getLastEvent();
        expectEnvelope(lastEvent!.event, {
          type: 'payment.proof.uploaded',
          company_id: '550e...',
          producer: 'payment-service',
        });
      });
    });
    ```
11. **Example: Testing a Service that Consumes Events**
    ```typescript
    describe('NotificationHandler', () => {
      let handler: NotificationHandler;
      let mockConsumer: MockConsumerService;

      beforeEach(async () => {
        const module = await Test.createTestingModule({
          imports: [EventsToolkitTestModule.forRoot()],
          providers: [NotificationHandler],
        }).compile();

        handler = module.get(NotificationHandler);
        mockConsumer = module.get(MockConsumerService);
      });

      it('should handle payment proof uploaded events', async () => {
        const event = createTestEvent();
        await mockConsumer.simulateEvent('company.*.payment.proof.uploaded.v1', event);
        // assert side effects
      });
    });
    ```
12. **Example: Testing with Outbox**
13. **Example: Testing Request-Reply**

### Step 21: Update `README.md`

Add a **Testing** section that links to `docs/testing-utilities.md` and shows a minimal example.

### Step 22: Update `.agent/project-structure.md`

Add `testing/` folder entry under `# Folders in src/`:

```markdown
- testing/ - Mock services, test module, and assertion helpers for unit-testing (barrel: index.ts)
```

### Step 23: Run tests

```bash
npm test
```

Verify all existing tests still pass and new tests pass.

### Step 24: Run linter

```bash
npm run lint
```

Ensure no linting errors.

### Step 25: Code Review

Review all new files for:
- Coding rules compliance (max 200 lines, max 50 lines per method, max 2 depth, max 2 params, private members, self-documenting code, no commented code)
- Consistent naming with existing codebase
- Proper NestJS DI patterns
- Complete barrel exports
- No missing imports or circular dependencies

---

## File Summary

| # | File | Purpose | Lines (est.) |
|---|------|---------|-------------|
| 1 | `src/testing/published-event.interface.ts` | PublishedEvent type | ~12 |
| 2 | `src/testing/saved-outbox-event.interface.ts` | SavedOutboxEvent type | ~10 |
| 3 | `src/testing/mock-producer.service.ts` | Mock ProducerService | ~65 |
| 4 | `src/testing/mock-consumer.service.ts` | Mock ConsumerService + simulateEvent | ~50 |
| 5 | `src/testing/mock-event-logger.service.ts` | Silent logger with recording | ~70 |
| 6 | `src/testing/mock-outbox.service.ts` | Mock OutboxService | ~35 |
| 7 | `src/testing/mock-request-reply.service.ts` | Mock RequestReplyService | ~95 |
| 8 | `src/testing/events-toolkit-test.module.ts` | Test module wiring | ~65 |
| 9 | `src/testing/assertion.helpers.ts` | Jest assertion helpers | ~90 |
| 10 | `src/testing/index.ts` | Barrel exports | ~25 |
| 11 | `src/testing/mock-producer.service.spec.ts` | Unit tests | ~80 |
| 12 | `src/testing/mock-consumer.service.spec.ts` | Unit tests | ~80 |
| 13 | `src/testing/mock-event-logger.service.spec.ts` | Unit tests | ~60 |
| 14 | `src/testing/mock-outbox.service.spec.ts` | Unit tests | ~50 |
| 15 | `src/testing/mock-request-reply.service.spec.ts` | Unit tests | ~80 |
| 16 | `src/testing/events-toolkit-test.module.spec.ts` | Integration tests | ~70 |
| 17 | `src/testing/assertion.helpers.spec.ts` | Unit tests | ~90 |
| 18 | `docs/testing-utilities.md` | Documentation | ~300 |

**Modified files:**
| # | File | Change |
|---|------|--------|
| 19 | `src/index.ts` | Add `export * from './testing'` |
| 20 | `.agent/project-structure.md` | Add `testing/` folder entry |
| 21 | `README.md` | Add Testing section with link to docs |

---

## Git Actions

1. Create feature branch: `feat/testing-utilities`
2. Commit after each logical step (or group of related steps)
3. Suggested commit messages:
   - `feat(testing): add MockProducerService and PublishedEvent type`
   - `feat(testing): add MockConsumerService with simulateEvent helper`
   - `feat(testing): add MockEventLoggerService`
   - `feat(testing): add MockOutboxService`
   - `feat(testing): add MockRequestReplyService`
   - `feat(testing): add EventsToolkitTestModule.forRoot()`
   - `feat(testing): add assertion helpers`
   - `feat(testing): add barrel export and update src/index.ts`
   - `test(testing): add unit tests for all mock services`
   - `test(testing): add unit tests for assertion helpers and test module`
   - `docs: add testing-utilities guide with examples`
   - `chore: update project-structure.md and README`

---

## Verification Checklist

- [ ] All new files are in `src/testing/` (project structure rule)
- [ ] Each source file is ≤ 200 lines (max lines rule)
- [ ] Each method body is ≤ 50 lines (max lines per method rule)
- [ ] Max 2 levels of nesting per method (max depth rule)
- [ ] Max 2 parameters per method, using option objects when needed (max arguments rule)
- [ ] All public members are necessary; internal members are private (prefer private members rule)
- [ ] Code is self-documenting (self-documenting code rule)
- [ ] No commented-out code (no commented code rule)
- [ ] All boolean conditions are single-section (single-section boolean conditions rule)
- [ ] Barrel exports in `src/testing/index.ts` are complete
- [ ] `src/index.ts` exports `./testing`
- [ ] `npm test` passes for all existing and new tests
- [ ] `npm run lint` passes
- [ ] `.agent/project-structure.md` updated with `testing/` folder
- [ ] `docs/testing-utilities.md` includes example test cases
- [ ] README links to testing documentation