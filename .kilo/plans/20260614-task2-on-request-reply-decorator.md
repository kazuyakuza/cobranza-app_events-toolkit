# Task 2 — Implementation Plan: @OnRequestReply Decorator-Based Response Handling

## Overview

Implement a `@OnRequestReply(eventType)` decorator that mirrors the `@OnEvent` pattern for handling async request-reply responses. The decorator stores metadata, an explorer discovers decorated methods at boot, and a `RequestReplyConsumerService` subscribes to NATS response subjects, correlates by `correlation_id`, and dispatches to matching handlers.

## Pre-Analysis

### Existing Architecture

- **`@OnEvent`** stores `OnEventOptions` metadata via `SetMetadata`.
- **`OnEventExplorer`** scans providers/controllers via `DiscoveryService` + `Reflector`, builds wildcard subjects (`company.*.{domain}.{entity}.{action}.v{version}`), and registers handlers with `ConsumerService`.
- **`ConsumerService`** is a simple `Map<string, EventHandler>` registry that dispatches by subject.
- **`JetStreamConsumerService`** handles actual NATS subscription, message parsing, validation, ACK/NACK, and DLQ routing.
- **`RequestReplyService`** in `src/request-reply/` handles the *sending* side of request-reply (building envelopes, publishing requests, `sendResponse`).
- **`EventEnvelope`** has `correlation_id` and `reply_to` fields for request-reply correlation.
- **Events follow subject convention:** `company.{companyId}.{domain}.{entity}.{action}.v{version}` for commands/events; responses arrive on subjects matching `reply_to`.

### Design Decisions

1. **Handler registry keyed by eventType** — unlike `ConsumerService` which keys by subject string, `RequestReplyConsumerService` keys by `eventType` with optional `companyId` filter. This allows matching by envelope content rather than NATS subject pattern.
2. **Handler lookup precedence** — `eventType:companyId` (specific) takes priority over `eventType` (generic).
3. **Subscription pattern** — the service subscribes to a configurable NATS subject (default: `company.*.response.v1`). This can be customized via `RequestReplyConsumerDeps.responseSubjectPattern`.
4. **OnModuleInit auto-subscribe** — the service subscribes on `onModuleInit` using the configured pattern, similar to how `OnEventExplorer` runs on `onModuleInit`.
5. **`RequestReplyHandler`** reuses the same signature as `EventHandler` — `(event: EventEnvelope<unknown>, context: EventContext) => Promise<void>` — for consistency.
6. **Message processing** follows the same pattern as `JetStreamConsumerService`: parse JSON, validate envelope, dispatch, ACK/NACK.

---

## Implementation Steps

### Step 1 — Create `on-request-reply.decorator.ts`

**File:** `src/consumer/decorators/on-request-reply.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const ON_REQUEST_REPLY_METADATA = 'on_request_reply_metadata';

export interface OnRequestReplyOptions {
  eventType: string;
  companyId?: string;
}

export function OnRequestReply(options: OnRequestReplyOptions): MethodDecorator {
  return SetMetadata(ON_REQUEST_REPLY_METADATA, options);
}
```

- Defines metadata key constant, options interface, and decorator function.
- `eventType` is the dot-notation event type string (e.g., `'payment.proof.uploaded'`).
- Optional `companyId` filter restricts the handler to a specific tenant.

### Step 2 — Create `on-request-reply.decorator.spec.ts`

**File:** `src/consumer/decorators/on-request-reply.decorator.spec.ts`

Tests:
1. Stores metadata on the decorated method with `eventType` and `companyId`.
2. Stores metadata when `companyId` is omitted.
3. Multiple methods can have different `@OnRequestReply` options.

Pattern mirrors `on-event.decorator.spec.ts`.

### Step 3 — Create `on-request-reply-explorer-deps.interface.ts`

**File:** `src/consumer/decorators/on-request-reply-explorer-deps.interface.ts`

```typescript
import { DiscoveryService, Reflector } from '@nestjs/core';
import { RequestReplyConsumerService } from '../request-reply-consumer.service';

export const ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN = 'ON_REQUEST_REPLY_EXPLORER_DEPS';

export interface OnRequestReplyExplorerDeps {
  discovery: DiscoveryService;
  reflector: Reflector;
  requestReplyConsumerService: RequestReplyConsumerService;
}
```

- Tokens and deps interface following `on-event-explorer-deps.interface.ts` pattern.
- References `RequestReplyConsumerService` (created in Step 6).

### Step 4 — Create `on-request-reply.explorer.ts`

**File:** `src/consumer/decorators/on-request-reply.explorer.ts`

Structure mirrors `OnEventExplorer`:
- `@Injectable()` class implementing `OnModuleInit`.
- Constructor injects `ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN`.
- `onModuleInit()` calls `explore()`.
- `explore()` iterates all providers/controllers, scans for methods with `@OnRequestReply` metadata.
- `registerInstanceHandlers(instance)` iterates method names, skips constructor.
- `tryRegisterHandler(target, methodName)` reads metadata, binds the handler, calls `requestReplyConsumerService.registerHandler()`.
- Uses `HandlerTarget` interface (same as `OnEventExplorer`).

No subject building — just passes `eventType` and optional `companyId` to the service.

### Step 5 — Create `on-request-reply.explorer.spec.ts`

**File:** `src/consumer/decorators/on-request-reply.explorer.spec.ts`

Tests:
1. Discovers and registers handlers with `@OnRequestReply` metadata.
2. Registers handler with `eventType` only (no `companyId`).
3. Registers handler with both `eventType` and `companyId`.
4. Skips providers without instance.
5. Skips methods without `@OnRequestReply` metadata.
6. Scans both providers and controllers.
7. Binds handler to instance correctly.

Pattern mirrors `on-event.explorer.spec.ts`.

### Step 6 — Create `request-reply-consumer-deps.interface.ts`

**File:** `src/consumer/request-reply-consumer-deps.interface.ts`

```typescript
import { JetStreamClient } from 'nats';
import { RequestReplyConsumerService } from './request-reply-consumer.service';
import { EventLoggerService } from '../logging/event-logger.service';

export const REQUEST_REPLY_CONSUMER_DEPS_TOKEN = 'REQUEST_REPLY_CONSUMER_DEPS';

export interface RequestReplyConsumerDeps {
  jetStream: JetStreamClient;
  logger: EventLoggerService;
  responseSubjectPattern?: string;
  dlqSubjectBuilder?: (subject: string) => string;
}
```

- Includes `JetStreamClient` for subscriptions.
- `responseSubjectPattern` defaults to `'company.*.response.v1'`.
- `dlqSubjectBuilder` for DLQ routing (reuses `defaultDlqSubjectBuilder` pattern).

### Step 7 — Create `register-handler-options.interface.ts`

**File:** `src/consumer/register-handler-options.interface.ts`

Per the max-2-params rule, extract the options interface to a separate file:

```typescript
import { EventHandler } from './consumer.service';

export interface RegisterHandlerOptions {
  eventType: string;
  handler: EventHandler;
  companyId?: string;
}
```

- This allows `registerHandler(options: RegisterHandlerOptions)` to have a single parameter.

### Step 8 — Create `request-reply-consumer.service.ts`

**File:** `src/consumer/request-reply-consumer.service.ts`

Key responsibilities:
1. Handler registry (register by eventType, optional companyId filter).
2. Subscribe to NATS response subjects on `onModuleInit`.
3. Parse and validate incoming messages.
4. Dispatch to matching handler by eventType + companyId.

**Class outline:**

```typescript
@Injectable()
export class RequestReplyConsumerService implements OnModuleInit {
  private readonly handlers = new Map<string, EventHandler>();
  private readonly jetStream: JetStreamClient;
  private readonly logger: EventLoggerService;
  private readonly responseSubjectPattern: string;
  private readonly dlqSubjectBuilder: (subject: string) => string;

  constructor(@Inject(REQUEST_REPLY_CONSUMER_DEPS_TOKEN) deps: RequestReplyConsumerDeps) { ... }

  onModuleInit(): void { /* auto-subscribe */ }
  registerHandler(options: RegisterHandlerOptions): void { ... }
  async dispatch(options: DispatchOptions): Promise<void> { ... }
  getHandler(eventType: string, companyId?: string): EventHandler | undefined { ... }
  get handlerCount(): number { ... }
  async subscribe(subject?: string): Promise<void> { ... }

  private async processSubscription(subscription: AsyncIterable<JsMsg>, subject: string): Promise<void> { ... }
  private async handleMessage(msg: JsMsg, subject: string): Promise<void> { ... }
  private parseMessageData(msg: JsMsg): Record<string, unknown> { ... }
  private validateEnvelope(plain: Record<string, unknown>, subject: string): EventEnvelope<unknown> { ... }
  private isInvalidEventPayload(parsed: unknown): boolean { ... }
  private buildHandlerKey(eventType: string, companyId?: string): string { ... }
}
```

**Key design points:**
- ` handlers` Map uses composite key `eventType` or `eventType:companyId`.
- `registerHandler` uses `RegisterHandlerOptions` (1 param, respects max-2-params rule).
- `dispatch` reuses `DispatchOptions` from consumer module. It looks up handler by eventType from the envelope `type` field, then by `eventType:companyId` using envelope `company_id`, falling back to `eventType` alone.
- `subscribe(subject?)` allows overriding the default response subject pattern.
- Message processing mirrors `JetStreamConsumerService`: parse → validate → dispatch → ACK/NACK → DLQ on `EventConsumerException`.
- Private methods follow max-50-lines rule. Each method is small and focused.
- All fields are private.

**Handler lookup in dispatch:**
```typescript
async dispatch(options: DispatchOptions): Promise<void> {
  const handler = this.findHandler(options.event.type, options.event.company_id);
  if (!handler) {
    throw new EventConsumerException({ ... });
  }
  await handler(options.event, options.context);
}

private findHandler(eventType: string, companyId: string): EventHandler | undefined {
  return this.handlers.get(this.buildHandlerKey(eventType, companyId))
    ?? this.handlers.get(eventType);
}
```

This provides precedence: specific `eventType:companyId` handler > generic `eventType` handler.

### Step 9 — Create `request-reply-consumer.service.spec.ts`

**File:** `src/consumer/request-reply-consumer.service.spec.ts`

Tests:
1. `registerHandler` — registers handler by eventType.
2. `registerHandler` — registers handler with eventType + companyId.
3. `registerHandler` — replaces existing handler for same key.
4. `dispatch` — invokes handler matched by eventType.
5. `dispatch` — prefers eventType:companyId handler over eventType-only handler.
6. `dispatch` — falls back to eventType-only handler when no company-specific handler exists.
7. `dispatch` — throws EventConsumerException when no handler matches.
8. `dispatch` — propagates handler errors.
9. `getHandler` — returns undefined for unregistered eventType.
10. `handlerCount` — returns correct count.

### Step 10 — Update `consumer.module.ts`

**File:** `src/consumer/consumer.module.ts`

Add to both `forRoot()` and `forRootAsync()`:
1. Import new symbols: `OnRequestReplyExplorer`, `ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN`, `OnRequestReplyExplorerDeps`, `RequestReplyConsumerService`, `REQUEST_REPLY_CONSUMER_DEPS_TOKEN`, `RequestReplyConsumerDeps`.
2. Add a new deps provider for the explorer:
   ```typescript
   const requestReplyExplorerDeps: Provider = {
     provide: ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN,
     useFactory: (pair: DiscoveryReflectorPair, rrConsumerService: RequestReplyConsumerService) => ({
       discovery: pair.discovery,
       reflector: pair.reflector,
       requestReplyConsumerService: rrConsumerService,
     }),
     inject: [DISCOVERY_REFLECTOR_PAIR, RequestReplyConsumerService],
   };
   ```
3. Add a new deps provider for the consumer service:
   ```typescript
   const requestReplyConsumerDeps: Provider = {
     provide: REQUEST_REPLY_CONSUMER_DEPS_TOKEN,
     useFactory: (services: ConsumerServicesPair, jetStream: JetStreamClient, options: ConsumerModuleOptions) => ({
       jetStream,
       logger: services.logger,
       responseSubjectPattern: options.responseSubjectPattern,
       dlqSubjectBuilder: options.dlqSubjectBuilder,
     }),
     // Note: jetStream comes from resolved connection, options from module options
   };
   ```
4. Add providers: `RequestReplyConsumerService`, `OnRequestReplyExplorer`, plus the two new deps providers.
5. Add exports: `RequestReplyConsumerService`, `OnRequestReplyExplorer`.

**Note:** `ConsumerModuleOptions` needs a new optional field `responseSubjectPattern?: string`.

### Step 11 — Update `ConsumerModuleOptions` and `ConsumerModuleAsyncOptions`

Add `responseSubjectPattern?: string` to both interfaces in `consumer.module.ts`.

### Step 12 — Update `consumer.module.spec.ts`

Add tests for:
1. `forRoot` provides `RequestReplyConsumerService` and `OnRequestReplyExplorer`.
2. `forRoot` passes `responseSubjectPattern` to deps.
3. `forRootAsync` provides `RequestReplyConsumerService` and `OnRequestReplyExplorer`.

### Step 13 — Update `consumer/index.ts`

**File:** `src/consumer/index.ts`

Add exports:
```typescript
export { OnRequestReply, ON_REQUEST_REPLY_METADATA, OnRequestReplyOptions } from './decorators/on-request-reply.decorator';
export { OnRequestReplyExplorer } from './decorators/on-request-reply.explorer';
export { ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN, OnRequestReplyExplorerDeps } from './decorators/on-request-reply-explorer-deps.interface';
export { RequestReplyConsumerService } from './request-reply-consumer.service';
export { REQUEST_REPLY_CONSUMER_DEPS_TOKEN, RequestReplyConsumerDeps } from './request-reply-consumer-deps.interface';
export { RegisterHandlerOptions } from './register-handler-options.interface';
```

### Step 14 — Update `.agent/project-structure.md` if needed

Verify the structure reflects the new files in `src/consumer/`.

---

## File Summary

| # | File | Type | Est. Lines |
|---|------|------|-----------|
| 1 | `src/consumer/decorators/on-request-reply.decorator.ts` | New | ~30 |
| 2 | `src/consumer/decorators/on-request-reply.decorator.spec.ts` | New | ~60 |
| 3 | `src/consumer/decorators/on-request-reply-explorer-deps.interface.ts` | New | ~18 |
| 4 | `src/consumer/decorators/on-request-reply.explorer.ts` | New | ~75 |
| 5 | `src/consumer/decorators/on-request-reply.explorer.spec.ts` | New | ~110 |
| 6 | `src/consumer/request-reply-consumer-deps.interface.ts` | New | ~20 |
| 7 | `src/consumer/register-handler-options.interface.ts` | New | ~10 |
| 8 | `src/consumer/request-reply-consumer.service.ts` | New | ~180 |
| 9 | `src/consumer/request-reply-consumer.service.spec.ts` | New | ~130 |
| 10 | `src/consumer/consumer.module.ts` | Modified | +~40 |
| 11 | `src/consumer/consumer.module.spec.ts` | Modified | +~25 |
| 12 | `src/consumer/index.ts` | Modified | +~6 |

All new source files are within the 200-line limit. All methods stay within the 50-line limit. All methods respect max 2 params. Max nesting depth is 2. Private members by default. Self-documenting code.

---

## Constraint Verification

| Constraint | Status |
|---|---|
| Max 200 lines per file | ✅ All new files ≤ ~180 lines |
| Max 50 lines per method | ✅ All methods ≤ 50 lines |
| Max 2 params per method | ✅ Options objects used for 3+ params |
| Max 2 depth nesting | ✅ Extracted to private methods |
| Self-documenting code | ✅ Descriptive names, no comments needed |
| Prefer private members | ✅ All fields and helper methods are private |
| No commented-out code | ✅ |
| Source in `src/` folder | ✅ |

---

## Dependencies and Imports

New files depend on:
- `@nestjs/common` — `SetMetadata`, `Inject`, `Injectable`, `OnModuleInit`
- `@nestjs/core` — `DiscoveryService`, `Reflector`
- `nats` — `JetStreamClient`, `JsMsg`
- `class-validator` — `validateSync`
- `class-transformer` — `plainToInstance`
- `../common/envelope/*` — `EventEnvelope`, `EventContext`
- `../common/errors/*` — `EventConsumerException`
- `../common/utils/*` — `encodeEvent`
- `../logging/event-logger.service` — `EventLoggerService`
- `./consumer.service` — `EventHandler`
- `./dispatch-options.interface` — `DispatchOptions`
- `./subscribe-options.interface` — `defaultDlqSubjectBuilder`