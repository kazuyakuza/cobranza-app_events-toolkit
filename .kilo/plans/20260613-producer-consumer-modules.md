# Global Plan — Producer & Consumer Modules (20260611-todo-2)

## Global Pre-Analysis

The project is a NestJS library (`@cobranza-app/events-toolkit`) that standardizes NATS+JetStream event handling across Cobranza App microservices. The `common/` layer and `logging/` layer are already implemented and stable. The remaining unimplemented folders are:

- `src/producer/` — module, service, decorators
- `src/consumer/` — module, services, decorators
- `src/request-reply/` — service, types
- `src/common/envelope/event-context.interface.ts` — new context helper

All existing files respect the coding rules (max 200 lines/file, max 50 lines/method, max 2 depth, max 2 params, prefer private, self-documenting code, no commented-out code, single-section boolean conditions).

**Key constraints for this plan:**
- Must use async/await everywhere.
- Modules must be configurable (DynamicModule pattern).
- Keep library lightweight — avoid heavy dependencies.
- All services must be injectable and testable.
- Good JSDoc + comments.

**Risk areas identified:**
- NATS/JetStream API surface (`JetStreamClient`, `JetStreamManager`, `NatsConnection`, `ConsumerOpts`) — must be used correctly for publish, subscribe, ack, nack.
- Decorators (`@EmitEvent`, `@OnEvent`) — need NestJS metadata reflection (`SetMetadata`, `ReflectMetadata`) to store subject patterns so `ConsumerService` can discover handlers at runtime.
- `EventContext` interface — must align with `EventEnvelope` fields (company_id, actor_type, actor_id, correlation_id, causation_id, trace_id).
- Validation pipeline on consume — `class-transformer` plainToInstance + `class-validator` validate, then throw `EventConsumerException` on failure.
- Request-reply pattern — needs NATS request/response with timeout, and correlation ID matching.

**TODO File:** `.agent/todos/20260611/20260611-todo-2.md`
**Plan Date:** 2026-06-13

---

## Step 2: Git Feature Branch Setup

- `main` is master branch.
- Run `git status` and commit any unstaged files.
- Create branch: `feat/producer-consumer-modules`
- Switch to new branch.

---

## Step 3: Version Update

- Increment version in `package.json` from `0.1.0` to `0.2.0` (minor — new feature modules).
- Commit as `chore: bump version to 0.2.0`.

---

## Task 1: Producer Module

### Pre-Analysis

The Producer Module is a NestJS `DynamicModule` that provides `ProducerService`. The service must accept either a `JetStream` client or `NatsConnection` via constructor/module config. The service exposes `publish(subject, event)` and `emit<T>(subject, data, context)` (convenience method that constructs the envelope). `EventLoggerService` is injected and used for all publish operations.

**Key design decisions:**
- `ProducerModule.forRoot(options)` returns a `DynamicModule` with a configurable `JetStream` or `NatsConnection` provider.
- `ProducerService` constructor receives `JetStream` (or creates one from `NatsConnection` if only connection is provided).
- `emit<T>()` needs `EventContext` to build a full `EventEnvelope` from raw data + context. It needs a factory/helper to create the envelope (use existing `createEvent` from `event.factory.ts` or create a new one). Since `event.factory.ts` is currently listed in brief but not yet implemented, this task may need to create it or implement inline.
- `publish()` logs via `EventLoggerService` then publishes via `js.publish()`.

**Files to create:**
- `src/producer/producer.module.ts`
- `src/producer/producer.service.ts`
- `src/producer/producer.service.spec.ts` (unit test)

**Dependencies:** `EventLoggerService`, `JetStream`, `NatsConnection`, `EventEnvelope`, `EventContext`, `SubjectBuilder`, `generateEventId`, `nowIso`.

---

### Task 1: 4.1 Analysis & Planning

**Sub-agent:** architect

- Research NestJS DynamicModule patterns for configurable modules.
- Research NATS `JetStream` and `NatsConnection` APIs for publishing.
- Design `ProducerModuleOptions` interface.
- Design `ProducerService` with `publish` and `emit` methods.
- Plan unit test strategy for `ProducerService` (mock JetStream, mock EventLoggerService).
- Save plan to `.kilo/plans/20260613-task1-producer-module.md`.

### Task 1: 4.2 Implementation

**Sub-agent:** implementer

- Create `src/producer/producer.module.ts` — `DynamicModule` with `forRoot(options)` static method.
- Create `src/producer/producer.service.ts` — `publish()` and `emit()` methods.
- Create `src/producer/producer.service.spec.ts` — unit tests.
- Commit after each file.

### Task 1: 4.3 Code Review

**Sub-agent:** code-reviewer

- Review for errors, plan deviations, rule compliance.
- Generate fix plan if needed; save to `.kilo/plans/20260613-task1-producer-fix.md`.

### Task 1: 4.4 Documentation

**Sub-agent:** docs-specialist

- Add JSDoc to `ProducerModule`, `ProducerService`, `ProducerModuleOptions`.
- Update README or `/docs` if needed.

### Task 1: 4.5 Verification

**Sub-agent:** implementer

- Check implementation plan adherence.
- Run `npm run typecheck` and `npm test`.
- Commit unstaged files.

### Task 1: 4.6 Task Completion

**Sub-agent:** implementer

- Append `[DONE]` to `### 1. Producer Module` in TODO file.
- Commit with `task: complete producer module`.

---

## Task 2: Consumer Module

### Pre-Analysis

The Consumer Module is a NestJS `DynamicModule` providing `ConsumerService` and `JetStreamConsumerService`. `ConsumerService` manages the lifecycle of subscriptions and handler registration. `JetStreamConsumerService` handles the actual JetStream subscription, message parsing, validation, ack/nack, and DLQ routing.

**Key design decisions:**
- `ConsumerModule.forRoot(options)` returns a `DynamicModule` with configurable NATS connection and consumer options.
- `ConsumerService` uses metadata from `@OnEvent()` decorator to discover handlers on NestJS controllers/providers at module init time.
- `JetStreamConsumerService` subscribes to subjects, parses JSON, validates envelope with `class-transformer` + `class-validator`, invokes the handler, and acks. On `EventConsumerException`, it nacks the message and publishes to DLQ subject.
- DLQ subject format: `dlq.company.{company_id}.{domain}.{entity}.{action}.v{version}` (or a simplified variant).

**Files to create:**
- `src/consumer/consumer.module.ts`
- `src/consumer/consumer.service.ts`
- `src/consumer/jetstream-consumer.service.ts`
- `src/consumer/consumer.service.spec.ts`
- `src/consumer/jetstream-consumer.service.spec.ts`

**Dependencies:** `EventLoggerService`, `EventConsumerException`, `EventEnvelope`, `ActorType`, `NatsConnection`, `JetStream`, `ConsumerOpts`, `class-transformer`, `class-validator`.

---

### Task 2: 4.1 Analysis & Planning

**Sub-agent:** architect

- Research NestJS metadata API for decorators and handler discovery.
- Research NATS JetStream consumer API for subscription and ack/nack.
- Design `ConsumerModuleOptions` and `ConsumerService` handler registration.
- Design `JetStreamConsumerService` message flow (parse → validate → handle → ack / DLQ).
- Plan unit tests with mocked NATS JetStream and message objects.
- Save plan to `.kilo/plans/20260613-task2-consumer-module.md`.

### Task 2: 4.2 Implementation

**Sub-agent:** implementer

- Create `src/consumer/consumer.module.ts`.
- Create `src/consumer/consumer.service.ts`.
- Create `src/consumer/jetstream-consumer.service.ts`.
- Create unit tests for both services.
- Commit after each file.

### Task 2: 4.3 Code Review

**Sub-agent:** code-reviewer

- Review for errors, plan deviations, rule compliance.
- Generate fix plan if needed.

### Task 2: 4.4 Documentation

**Sub-agent:** docs-specialist

- Add JSDoc to all consumer classes.
- Update README/docs if needed.

### Task 2: 4.5 Verification

**Sub-agent:** implementer

- Check implementation plan adherence.
- Run `npm run typecheck` and `npm test`.
- Commit unstaged files.

### Task 2: 4.6 Task Completion

**Sub-agent:** implementer

- Append `[DONE]` to `### 2. Consumer Module` in TODO file.
- Commit with `task: complete consumer module`.

---

## Task 3: Decorators

### Pre-Analysis

Two decorators:

- `@EmitEvent()` — placed on methods that return an `EventEnvelope`. The producer intercepts the return value and publishes it. This is a method interceptor/decorator. In NestJS, custom decorators can be implemented using `SetMetadata` or a more advanced interceptor. For simplicity, `@EmitEvent()` can store metadata (subject pattern) on the method, and a method interceptor can read it. However, since this is a toolkit library, a simpler approach: `@EmitEvent()` stores metadata, and the caller uses `ProducerService` directly. The TODO description says "decorators work as expected", so we need a functional decorator.

- `@OnEvent()` — placed on methods in controllers/providers. The consumer service scans these at module init and registers them as JetStream handlers. Uses `SetMetadata` to store the subject pattern on the method.

**Key design decisions:**
- `@OnEvent()` accepts a subject string or a `BuildSubjectDto`-like object and stores it via `SetMetadata('ON_EVENT', subject)`.
- `@EmitEvent()` accepts a subject string or object and stores it via `SetMetadata('EMIT_EVENT', subject)`.
- `ConsumerService` uses `DiscoveryService` or `ModuleRef` to scan providers at init, read `@OnEvent()` metadata, and register handlers with `JetStreamConsumerService`.
- Since this is a library and we want to keep it lightweight, we can use NestJS `DiscoveryService` from `@nestjs/core` if available, or manually scan `ModuleRef` providers. To avoid adding heavy deps, we can use `Reflector` in a lifecycle hook (`OnModuleInit`).

**Files to create:**
- `src/producer/decorators/emit-event.decorator.ts`
- `src/consumer/decorators/on-event.decorator.ts`
- `src/producer/decorators/emit-event.decorator.spec.ts`
- `src/consumer/decorators/on-event.decorator.spec.ts`

**Dependencies:** `@nestjs/common`, `@nestjs/core` (Reflector, SetMetadata).

---

### Task 3: 4.1 Analysis & Planning

**Sub-agent:** architect

- Research NestJS `SetMetadata` and `Reflector` for custom decorators.
- Research `OnModuleInit` lifecycle hook for scanning providers.
- Design decorator signatures and metadata keys.
- Plan integration with `ConsumerService` and `ProducerService`.
- Save plan to `.kilo/plans/20260613-task3-decorators.md`.

### Task 3: 4.2 Implementation

**Sub-agent:** implementer

- Create `@EmitEvent()` decorator.
- Create `@OnEvent()` decorator.
- Update `ConsumerService` to scan and register handlers in `OnModuleInit`.
- Update `ProducerService` to support decorator-based emitting (or provide an interceptor/helper if needed).
- Create unit tests.
- Commit after each file.

### Task 3: 4.3 Code Review

**Sub-agent:** code-reviewer

- Review for errors, plan deviations, rule compliance.

### Task 3: 4.4 Documentation

**Sub-agent:** docs-specialist

- Add JSDoc to decorators.
- Update README with decorator usage examples.

### Task 3: 4.5 Verification

**Sub-agent:** implementer

- Check implementation plan adherence.
- Run `npm run typecheck` and `npm test`.
- Commit unstaged files.

### Task 3: 4.6 Task Completion

**Sub-agent:** implementer

- Append `[DONE]` to `### 3. Decorators` in TODO file.
- Commit with `task: complete decorators`.

---

## Task 4: Request-Reply Support

### Pre-Analysis

The Request-Reply pattern requires two operations:

- `request<T, R>(subject, payload, timeout?)` — send a request to a subject and wait for a response. NATS core supports this natively with `nc.request(subject, payload, options)`. JetStream does not natively support request-reply, but NATS core does. The library should use `NatsConnection` for this.
- `sendResponse(correlationId, responseEvent)` — send a response back to the `reply_to` subject included in the request event.

**Key design decisions:**
- `RequestReplyService` is a NestJS `@Injectable()`.
- Constructor accepts `NatsConnection`.
- `request()` uses `nc.request()` with optional timeout.
- `sendResponse()` publishes to the `reply_to` subject.
- Types: `RequestReplyRequest<T>`, `RequestReplyResponse<R>`.

**Files to create:**
- `src/request-reply/request-reply.service.ts`
- `src/request-reply/request-reply.types.ts`
- `src/request-reply/request-reply.service.spec.ts`

**Dependencies:** `NatsConnection`, `EventEnvelope`, `EventLoggerService`.

---

### Task 4: 4.1 Analysis & Planning

**Sub-agent:** architect

- Research NATS `NatsConnection.request()` API and options.
- Design `RequestReplyService` and type definitions.
- Plan unit tests with mocked NATS connection.
- Save plan to `.kilo/plans/20260613-task4-request-reply.md`.

### Task 4: 4.2 Implementation

**Sub-agent:** implementer

- Create `src/request-reply/request-reply.types.ts`.
- Create `src/request-reply/request-reply.service.ts`.
- Create unit tests.
- Commit after each file.

### Task 4: 4.3 Code Review

**Sub-agent:** code-reviewer

- Review for errors, plan deviations, rule compliance.

### Task 4: 4.4 Documentation

**Sub-agent:** docs-specialist

- Add JSDoc to request-reply classes.
- Update README with request-reply examples.

### Task 4: 4.5 Verification

**Sub-agent:** implementer

- Check implementation plan adherence.
- Run `npm run typecheck` and `npm test`.
- Commit unstaged files.

### Task 4: 4.6 Task Completion

**Sub-agent:** implementer

- Append `[DONE]` to `### 4. Request-Reply Support` in TODO file.
- Commit with `task: complete request-reply support`.

---

## Task 5: Validation & Error Handling Integration

### Pre-Analysis

This task is partially covered by Task 2 (Consumer Module), but it explicitly requires:

- `class-transformer` plainToInstance on consumed payload.
- `class-validator` validate on the envelope.
- If validation fails → throw `EventConsumerException`.
- Implement error handling flow in `JetStreamConsumerService`.

Since `JetStreamConsumerService` is created in Task 2, this task is a **refinement/enforcement** task. It may require:

- Adding validation logic to `JetStreamConsumerService`.
- Ensuring `EventConsumerException` is properly thrown and caught.
- Adding unit tests for validation failure scenarios.
- Ensuring DLQ routing works correctly on validation errors.

**Files to modify (from Task 2):**
- `src/consumer/jetstream-consumer.service.ts` — add validation pipeline.
- `src/consumer/jetstream-consumer.service.spec.ts` — add validation failure tests.

**New files (if needed):**
- `src/common/utils/event.factory.ts` — factory to create `EventEnvelope` from data + context (needed for `emit()` and also for validation reconstruction).

---

### Task 5: 4.1 Analysis & Planning

**Sub-agent:** architect

- Design the validation pipeline (plainToInstance → validate → throw).
- Design `EventConsumerException` handling in `JetStreamConsumerService`.
- Design `createEvent<T>()` factory function.
- Plan unit tests for validation failure, DLQ routing.
- Save plan to `.kilo/plans/20260613-task5-validation-error.md`.

### Task 5: 4.2 Implementation

**Sub-agent:** implementer

- Implement `createEvent<T>()` in `src/common/utils/event.factory.ts`.
- Add validation pipeline to `JetStreamConsumerService`.
- Ensure DLQ routing on `EventConsumerException`.
- Add unit tests for validation and DLQ.
- Commit after each file.

### Task 5: 4.3 Code Review

**Sub-agent:** code-reviewer

- Review for errors, plan deviations, rule compliance.

### Task 5: 4.4 Documentation

**Sub-agent:** docs-specialist

- Add JSDoc to validation helpers.
- Update docs on error handling and DLQ.

### Task 5: 4.5 Verification

**Sub-agent:** implementer

- Check implementation plan adherence.
- Run `npm run typecheck` and `npm test`.
- Commit unstaged files.

### Task 5: 4.6 Task Completion

**Sub-agent:** implementer

- Append `[DONE]` to `### 5. Validation & Error Handling Integration` in TODO file.
- Commit with `task: complete validation and error handling`.

---

## Task 6: Context Helper

### Pre-Analysis

Create a simple `EventContext` interface/class in `src/common/envelope/` to standardize the context object used across producer (`emit()`), consumer handlers, and request-reply.

**Fields:**
- `companyId: string`
- `actorType: ActorType`
- `actorId: string`
- `correlationId?: string`
- `causationId?: string`
- `traceId?: string`

This interface should be used by `ProducerService.emit()`, `RequestReplyService`, and documented for consumers.

**Files to create:**
- `src/common/envelope/event-context.interface.ts`

---

### Task 6: 4.1 Analysis & Planning

**Sub-agent:** architect

- Design `EventContext` interface.
- Plan integration with `ProducerService.emit()`, `RequestReplyService`, and `EventEnvelope`.
- Save plan to `.kilo/plans/20260613-task6-context-helper.md`.

### Task 6: 4.2 Implementation

**Sub-agent:** implementer

- Create `src/common/envelope/event-context.interface.ts`.
- Update `ProducerService.emit()` to use `EventContext`.
- Update `RequestReplyService` to use `EventContext` if applicable.
- Commit after each file.

### Task 6: 4.3 Code Review

**Sub-agent:** code-reviewer

- Review for errors, plan deviations, rule compliance.

### Task 6: 4.4 Documentation

**Sub-agent:** docs-specialist

- Add JSDoc to `EventContext`.
- Update README with context usage examples.

### Task 6: 4.5 Verification

**Sub-agent:** implementer

- Check implementation plan adherence.
- Run `npm run typecheck` and `npm test`.
- Commit unstaged files.

### Task 6: 4.6 Task Completion

**Sub-agent:** implementer

- Append `[DONE]` to `### 6. Context Helper` in TODO file.
- Commit with `task: complete context helper`.

---

## Task 7: Update Main Barrel

### Pre-Analysis

Update `src/index.ts` to export all new public APIs from producer, consumer, request-reply, and common modules. This is the public API surface of the library.

**Exports to add:**
- `ProducerModule`, `ProducerService`
- `ConsumerModule`, `ConsumerService`, `JetStreamConsumerService`
- `RequestReplyService`, `RequestReplyTypes`
- `EmitEvent`, `OnEvent`
- `EventContext`
- `createEvent` (from event.factory)

---

### Task 7: 4.1 Analysis & Planning

**Sub-agent:** architect

- Review all new files to determine what must be exported.
- Plan `src/index.ts` update.
- Save plan to `.kilo/plans/20260613-task7-barrel.md`.

### Task 7: 4.2 Implementation

**Sub-agent:** implementer

- Update `src/index.ts` with all new exports.
- Commit.

### Task 7: 4.3 Code Review

**Sub-agent:** code-reviewer

- Review exports for completeness and correctness.

### Task 7: 4.4 Documentation

**Sub-agent:** docs-specialist

- Update README with new public API exports.

### Task 7: 4.5 Verification

**Sub-agent:** implementer

- Check `npm run typecheck` passes.
- Ensure all exports are reachable.
- Commit.

### Task 7: 4.6 Task Completion

**Sub-agent:** implementer

- Append `[DONE]` to `### 7. Update Main Barrel` in TODO file.
- Commit with `task: complete main barrel update`.

---

## Step 5: TODO File Completion

**Sub-agent:** implementer

- Rename TODO file to `.agent/todos/20260611/20260611-todo-2-DONE.md`.
- Ensure all files are committed in `feat/producer-consumer-modules`.
- Switch to `main`.
- Merge `feat/producer-consumer-modules`.
- On success: delete feature branch.
- If `origin` remote set, push `main` to `origin`.

---

## Summary of Global Plan

| Step | Description | Sub-agent |
|------|-------------|-----------|
| 2 | Git Feature Branch Setup | implementer |
| 3 | Version Update | implementer |
| Task 1: 4.1 | Producer Module Analysis & Planning | architect |
| Task 1: 4.2 | Producer Module Implementation | implementer |
| Task 1: 4.3 | Producer Module Code Review | code-reviewer |
| Task 1: 4.3-fix | Producer Module Fix (if needed) | implementer |
| Task 1: 4.4 | Producer Module Documentation | docs-specialist |
| Task 1: 4.5 | Producer Module Verification | implementer |
| Task 1: 4.6 | Producer Module Task Completion | implementer |
| Task 2: 4.1 | Consumer Module Analysis & Planning | architect |
| Task 2: 4.2 | Consumer Module Implementation | implementer |
| Task 2: 4.3 | Consumer Module Code Review | code-reviewer |
| Task 2: 4.3-fix | Consumer Module Fix (if needed) | implementer |
| Task 2: 4.4 | Consumer Module Documentation | docs-specialist |
| Task 2: 4.5 | Consumer Module Verification | implementer |
| Task 2: 4.6 | Consumer Module Task Completion | implementer |
| Task 3: 4.1 | Decorators Analysis & Planning | architect |
| Task 3: 4.2 | Decorators Implementation | implementer |
| Task 3: 4.3 | Decorators Code Review | code-reviewer |
| Task 3: 4.3-fix | Decorators Fix (if needed) | implementer |
| Task 3: 4.4 | Decorators Documentation | docs-specialist |
| Task 3: 4.5 | Decorators Verification | implementer |
| Task 3: 4.6 | Decorators Task Completion | implementer |
| Task 4: 4.1 | Request-Reply Analysis & Planning | architect |
| Task 4: 4.2 | Request-Reply Implementation | implementer |
| Task 4: 4.3 | Request-Reply Code Review | code-reviewer |
| Task 4: 4.3-fix | Request-Reply Fix (if needed) | implementer |
| Task 4: 4.4 | Request-Reply Documentation | docs-specialist |
| Task 4: 4.5 | Request-Reply Verification | implementer |
| Task 4: 4.6 | Request-Reply Task Completion | implementer |
| Task 5: 4.1 | Validation & Error Handling Analysis & Planning | architect |
| Task 5: 4.2 | Validation & Error Handling Implementation | implementer |
| Task 5: 4.3 | Validation & Error Handling Code Review | code-reviewer |
| Task 5: 4.3-fix | Validation & Error Handling Fix (if needed) | implementer |
| Task 5: 4.4 | Validation & Error Handling Documentation | docs-specialist |
| Task 5: 4.5 | Validation & Error Handling Verification | implementer |
| Task 5: 4.6 | Validation & Error Handling Task Completion | implementer |
| Task 6: 4.1 | Context Helper Analysis & Planning | architect |
| Task 6: 4.2 | Context Helper Implementation | implementer |
| Task 6: 4.3 | Context Helper Code Review | code-reviewer |
| Task 6: 4.3-fix | Context Helper Fix (if needed) | implementer |
| Task 6: 4.4 | Context Helper Documentation | docs-specialist |
| Task 6: 4.5 | Context Helper Verification | implementer |
| Task 6: 4.6 | Context Helper Task Completion | implementer |
| Task 7: 4.1 | Barrel Update Analysis & Planning | architect |
| Task 7: 4.2 | Barrel Update Implementation | implementer |
| Task 7: 4.3 | Barrel Update Code Review | code-reviewer |
| Task 7: 4.3-fix | Barrel Update Fix (if needed) | implementer |
| Task 7: 4.4 | Barrel Update Documentation | docs-specialist |
| Task 7: 4.5 | Barrel Update Verification | implementer |
| Task 7: 4.6 | Barrel Update Task Completion | implementer |
| 5 | TODO File Completion | implementer |

---

**Approval Options:**

- "Approve Global and Tasks Plans" — auto-approve per task plan (each 4.1 step will proceed without user confirmation).
- "Approve Global Plan" — present each task plan for user approval before implementation.
