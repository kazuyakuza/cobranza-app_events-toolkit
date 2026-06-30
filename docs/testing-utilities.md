# Testing Utilities

> **Onboarding:** This document covers **step 10 (Testing)** of the [Onboarding Flow](../README.md#onboarding-flow).
> **See also:** [AI Agent Guidelines](ai-agent-guidelines.md) · [README Quickstart](../README.md#quickstart-for-ai-agents)

Mock services, test module, and Jest assertion helpers for unit-testing NestJS services that depend on `@cobranza-apps/events-toolkit`.

## Overview

The testing utilities replace real NATS JetStream-dependent services with in-memory mocks that record method calls and provide query/clear methods. This enables microservice unit tests to verify events were published, consumed, saved to outbox, etc., without requiring a NATS connection.

All mocks are registered via `EventsToolkitTestModule.forRoot()`, a NestJS `DynamicModule` that uses `useExisting` to alias mock services as their real service tokens.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Mock Services](#mock-services)
- [Assertion Helpers](#assertion-helpers)
- [Examples](#examples)

## Installation

Import `EventsToolkitTestModule` in your `Test.createTestingModule()` setup:

```typescript
import { Test } from '@nestjs/testing';
import { EventsToolkitTestModule } from '@cobranza-apps/events-toolkit';
```

## Quick Start

```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockProducerService,
  expectEventPublished,
} from '@cobranza-apps/events-toolkit';

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
});
```

## Mock Services

### MockProducerService

Replaces `ProducerService`. Records all published events in memory.

| Method | Description |
|--------|-------------|
| `publish(subject, event)` | Records a published event |
| `emit(options)` | Builds envelope from `EmitOptions` and records it |
| `getPublishedEvents()` | Returns all recorded `PublishedEvent[]` |
| `getLastEvent()` | Returns the most recent event or `undefined` |
| `getPublishedSubjects()` | Returns subject strings in order |
| `count` | Number of recorded events |
| `clear()` | Resets all recorded events |

### MockConsumerService

Replaces `ConsumerService`. Stores registered handlers and simulates incoming events.

| Method | Description |
|--------|-------------|
| `registerHandler(subject, handler)` | Registers an event handler for a subject |
| `dispatch(options)` | Dispatches event to registered handler, throws `EventConsumerException` if unregistered |
| `getHandler(subject)` | Returns handler for subject or `undefined` |
| `handlerCount` | Number of registered handlers |
| `simulateEvent(subject, event)` | Creates `EventContext` from envelope and dispatches |
| `clear()` | Removes all registered handlers |

### MockEventLoggerService

Replaces `EventLoggerService`. All log methods are no-ops that optionally record calls for assertion.

| Log Method | Context Type |
|------------|-------------|
| `logEventEmitted(context)` | `EventLogContext` |
| `logEventConsumed(context)` | `EventLogContext` |
| `logEventError(context)` | `EventErrorLogContext` |
| `logEventDlq(context)` | `EventErrorLogContext` |
| `logOutboxSaved(context)` | `OutboxLogContext` |
| `logOutboxProcessed(context)` | `OutboxLogContext` |
| `logOutboxFailed(context)` | `OutboxErrorLogContext` |
| `logOutboxDlq(context)` | `OutboxErrorLogContext` |

Query methods:

| Method | Description |
|--------|-------------|
| `getLogs()` | Returns all recorded `LogRecord[]` with `method` and `context` |
| `clear()` | Resets all recorded logs |

### MockOutboxService

Replaces `OutboxService`. Records events saved to outbox. `startProcessor()` and `stopProcessor()` are no-ops. Transaction context is accepted but ignored (mirrors SQLite behavior).

| Method | Description |
|--------|-------------|
| `saveToOutbox(event, subject)` | Records the event with its subject |
| `saveInTransaction(params)` | Records the event (transaction context ignored) |
| `sendRequestThroughOutbox(event, subject)` | Records the event (same as `saveToOutbox`) |
| `sendAsyncRequestThroughOutbox(options)` | Builds envelope from payload+context, records it, returns `{ correlationId }` |
| `startProcessor()` | No-op |
| `stopProcessor()` | No-op |
| `getSavedEvents()` | Returns all recorded `SavedOutboxEvent[]` |
| `count` | Number of saved events |
| `clear()` | Resets all recorded events |

### MockRequestReplyService

Replaces `RequestReplyService`. Records request/response calls and returns configurable mock responses.

| Method | Description |
|--------|-------------|
| `setMockResponse(response)` | Configures the response for the next `request()` call |
| `request(subject, payload, options)` | Records call and returns configured mock response |
| `sendResponse(correlationId, event)` | Records the response call |
| `isRequestReplyMessage(event)` | Returns `true` if `reply_to` is set |
| `sendRequest(options)` | Records call and returns `{ correlationId: 'mock-correlation-id' }` |
| `buildResponseEnvelope(options)` | Builds response envelope preserving correlation/causation |
| `getRequests()` | Returns recorded `RequestCall[]` |
| `getSendResponseCalls()` | Returns recorded `SendResponseCall[]` |
| `getSendRequestCalls()` | Returns recorded `SendRequestOptions[]` |
| `clear()` | Resets all calls and restores default mock response |

## Assertion Helpers

Import from `@cobranza-apps/events-toolkit`:

```typescript
import {
  expectEventPublished,
  expectNoEventsPublished,
  expectEventWithMatch,
  expectEnvelope,
} from '@cobranza-apps/events-toolkit';
```

| Function | Description |
|----------|-------------|
| `expectEventPublished(producer, subject)` | Passes when at least one event was published to the given subject |
| `expectNoEventsPublished(producer)` | Passes when no events have been published |
| `expectEventWithMatch(producer, options)` | Passes when events match `EventMatchOptions` (subject, eventType, companyId) |
| `expectEnvelope(envelope, expectations)` | Asserts envelope fields match `EnvelopeExpectations` |

### EventMatchOptions

```typescript
interface EventMatchOptions {
  subject?: string;
  eventType?: string;
  companyId?: string;
}
```

### EnvelopeExpectations

```typescript
interface EnvelopeExpectations {
  type?: string;
  version?: string;
  producer?: string;
  company_id?: string;
  actor_type?: string;
  actor_id?: string;
  correlation_id?: string;
}
```

## Examples

### Testing a Service that Publishes Events

```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockProducerService,
  expectEventPublished,
  expectEnvelope,
} from '@cobranza-apps/events-toolkit';

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

### Testing a Service that Consumes Events

```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockConsumerService,
  ActorType,
} from '@cobranza-apps/events-toolkit';
import { EventEnvelope } from '@cobranza-apps/events-toolkit';

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
    const event = new EventEnvelope({
      id: 'evt_test-001',
      type: 'payment.proof.uploaded',
      version: '1.0.0',
      produced_at: new Date().toISOString(),
      producer: 'payment-service',
      company_id: '550e8400-e29b-41d4-a716-446655440000',
      actor_type: ActorType.SYSTEM,
      actor_id: 'system',
      correlation_id: '660e8400-e29b-41d4-a716-446655440001',
      data: { amount: 250 },
    });
    await mockConsumer.simulateEvent('company.*.payment.proof.uploaded.v1', event);
    // Assert side effects on handler
  });
});
```

### Testing with Outbox

```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockOutboxService,
} from '@cobranza-apps/events-toolkit';

describe('ServiceWithOutbox', () => {
  let service: MyService;
  let mockOutbox: MockOutboxService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
      providers: [MyService],
    }).compile();

    service = module.get(MyService);
    mockOutbox = module.get(MockOutboxService);
  });

  afterEach(() => {
    mockOutbox.clear();
  });

  it('should save event to outbox', async () => {
    await service.processWithOutbox({ ... });
    expect(mockOutbox.count).toBe(1);
    expect(mockOutbox.getSavedEvents()[0].subject).toContain('payment.proof');
  });
});
```

### Testing Request-Reply

```typescript
import { Test } from '@nestjs/testing';
import {
  EventsToolkitTestModule,
  MockRequestReplyService,
} from '@cobranza-apps/events-toolkit';

describe('ServiceWithRequestReply', () => {
  let service: MyService;
  let mockRequestReply: MockRequestReplyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [EventsToolkitTestModule.forRoot()],
      providers: [MyService],
    }).compile();

    service = module.get(MyService);
    mockRequestReply = module.get(MockRequestReplyService);
  });

  it('should send request and receive mock response', async () => {
    mockRequestReply.setMockResponse({
      data: { status: 'approved' },
      raw: new Uint8Array(0),
    });

    const result = await service.requestApproval({ ... });
    expect(result).toEqual({ status: 'approved' });
  });
});
```
