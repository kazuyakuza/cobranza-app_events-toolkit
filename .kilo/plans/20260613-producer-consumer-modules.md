# Global Plan — Producer & Consumer Modules

## Overview

Implement the Producer and Consumer layers with proper NestJS module structure, decorators, and integration with NATS/JetStream, as defined in TODO `.agent/todos/20260611/20260611-todo-2.md`.

## Current Project State

- **Branch**: `main`
- **Existing modules**: `common/`, `logging/`
- **Empty modules**: `producer/`, `consumer/`, `request-reply/`, `outbox/`
- **Dependencies**: `@nestjs/common`, `@nestjs/microservices`, `nats`, `class-validator`, `class-transformer`, `winston`, `uuid` are present in `package.json`
- **Rules**: Max 200 lines/file, max 50 lines/method, max 2 params, max 2 depth, prefer private, self-documenting code

## Pre-Analysis

The project is a NestJS library with a well-established base (`common/`, `logging/`). The missing pieces are:
- **Producer**: `ProducerModule` (dynamic), `ProducerService` (publish + emit), `@EmitEvent()` decorator
- **Consumer**: `ConsumerModule` (dynamic), `ConsumerService`, `JetStreamConsumerService` (sub, parse, validate, ack/nack, DLQ), `@OnEvent()` decorator
- **Request-Reply**: `RequestReplyService`, `RequestReplyTypes`
- **Validation**: `class-transformer` + `class-validator` integration in `JetStreamConsumerService`
- **Context**: `EventContext` interface in `src/common/envelope/`
- **Barrel**: Update `src/index.ts` to export all new public APIs

All tasks are tightly coupled through the `EventEnvelope`, `EventLoggerService`, `EventConsumerException`, and NATS/JetStream APIs. The implementation should be sequential to avoid merge conflicts.

## Global Plan Steps

### Step 2: Git Feature Branch Setup
- **Agent**: `implementer`
- **Branch**: `feat/producer-consumer-modules`
- **Actions**: Check git status, commit any unstaged, create and switch to feature branch

### Step 3: Version Update
- **Agent**: `implementer`
- **Action**: Bump `package.json` version `0.1.0` → `0.2.0` (minor, new features)
- **Commit**: `chore: bump version to 0.2.0`

---

### Task 1: Producer Module

#### 4.1 Analysis & Planning
- **Agent**: `architect`
- **Deliverable**: Plan `.kilo/plans/20260613-task1-producer-module.md`
- **Scope**: `ProducerModule` (DynamicModule with `forRoot`/`forRootAsync`), `ProducerService` (publish + emit), accepts `JetStream` or `NatsConnection` via module config, injects `EventLoggerService`

#### 4.2 Implementation
- **Agent**: `implementer`
- **Files**: `src/producer/producer.module.ts`, `src/producer/producer.service.ts`
- **Tests**: `src/producer/producer.service.spec.ts`
- **Commit**: `feat(producer): add ProducerModule and ProducerService`

#### 4.3 Code Review
- **Agent**: `code-reviewer`
- **Deliverable**: Fix plan `.kilo/plans/20260613-task1-producer-fix.md` if needed
- **Fix Agent**: `implementer`

#### 4.4 Documentation
- **Agent**: `docs-specialist`
- **Scope**: JSDoc comments on public APIs

#### 4.5 Verification
- **Agent**: `implementer`
- **Scope**: Run tests, verify barrel exports

#### 4.6 Task Completion
- **Agent**: `implementer`
- **Scope**: Mark `[DONE]` in TODO file

---

### Task 2: Consumer Module

#### 4.1 Analysis & Planning
- **Agent**: `architect`
- **Deliverable**: Plan `.kilo/plans/20260613-task2-consumer-module.md`
- **Scope**: `ConsumerModule` (DynamicModule), `ConsumerService`, `JetStreamConsumerService` (subscription, parsing, ack/nack, DLQ routing)

#### 4.2 Implementation
- **Agent**: `implementer`
- **Files**: `src/consumer/consumer.module.ts`, `src/consumer/consumer.service.ts`, `src/consumer/jetstream-consumer.service.ts`
- **Tests**: `src/consumer/consumer.service.spec.ts`, `src/consumer/jetstream-consumer.service.spec.ts`
- **Commit**: `feat(consumer): add ConsumerModule and JetStreamConsumerService`

#### 4.3 Code Review
- **Agent**: `code-reviewer`
- **Fix Agent**: `implementer`

#### 4.4 Documentation
- **Agent**: `docs-specialist`

#### 4.5 Verification
- **Agent**: `implementer`

#### 4.6 Task Completion
- **Agent**: `implementer`

---

### Task 3: Decorators

#### 4.1 Analysis & Planning
- **Agent**: `architect`
- **Deliverable**: Plan `.kilo/plans/20260613-task3-decorators.md`
- **Scope**: `@EmitEvent()` (producer) and `@OnEvent()` (consumer) using NestJS metadata reflection

#### 4.2 Implementation
- **Agent**: `implementer`
- **Files**: `src/producer/decorators/emit-event.decorator.ts`, `src/consumer/decorators/on-event.decorator.ts`
- **Tests**: `src/producer/decorators/emit-event.decorator.spec.ts`, `src/consumer/decorators/on-event.decorator.spec.ts`
- **Commit**: `feat(decorators): add @EmitEvent and @OnEvent decorators`

#### 4.3 Code Review
- **Agent**: `code-reviewer`
- **Fix Agent**: `implementer`

#### 4.4 Documentation
- **Agent**: `docs-specialist`

#### 4.5 Verification
- **Agent**: `implementer`

#### 4.6 Task Completion
- **Agent**: `implementer`

---

### Task 4: Request-Reply Support

#### 4.1 Analysis & Planning
- **Agent**: `architect`
- **Deliverable**: Plan `.kilo/plans/20260613-task4-request-reply.md`
- **Scope**: `RequestReplyService` with `request<T, R>()` and `sendResponse()` helpers

#### 4.2 Implementation
- **Agent**: `implementer`
- **Files**: `src/request-reply/request-reply.service.ts`, `src/request-reply/request-reply.types.ts`
- **Tests**: `src/request-reply/request-reply.service.spec.ts`
- **Commit**: `feat(request-reply): add RequestReplyService`

#### 4.3 Code Review
- **Agent**: `code-reviewer`
- **Fix Agent**: `implementer`

#### 4.4 Documentation
- **Agent**: `docs-specialist`

#### 4.5 Verification
- **Agent**: `implementer`

#### 4.6 Task Completion
- **Agent**: `implementer`

---

### Task 5: Validation & Error Handling Integration

#### 4.1 Analysis & Planning
- **Agent**: `architect`
- **Deliverable**: Plan `.kilo/plans/20260613-task5-validation-error.md`
- **Scope**: Integrate `class-transformer` + `class-validator` into `JetStreamConsumerService`; throw `EventConsumerException` on validation failure; catch and route to DLQ

#### 4.2 Implementation
- **Agent**: `implementer`
- **Files**: Modify `src/consumer/jetstream-consumer.service.ts`, `src/consumer/consumer.service.ts` as needed
- **Tests**: Update/add validation tests
- **Commit**: `feat(consumer): integrate validation and DLQ error handling`

#### 4.3 Code Review
- **Agent**: `code-reviewer`
- **Fix Agent**: `implementer`

#### 4.4 Documentation
- **Agent**: `docs-specialist`

#### 4.5 Verification
- **Agent**: `implementer`

#### 4.6 Task Completion
- **Agent**: `implementer`

---

### Task 6: Context Helper

#### 4.1 Analysis & Planning
- **Agent**: `architect`
- **Deliverable**: Plan `.kilo/plans/20260613-task6-context-helper.md`
- **Scope**: `EventContext` interface/class in `src/common/envelope/`

#### 4.2 Implementation
- **Agent**: `implementer`
- **Files**: `src/common/envelope/event-context.interface.ts` (or `.class.ts`)
- **Tests**: If applicable
- **Commit**: `feat(common): add EventContext interface`

#### 4.3 Code Review
- **Agent**: `code-reviewer`
- **Fix Agent**: `implementer`

#### 4.4 Documentation
- **Agent**: `docs-specialist`

#### 4.5 Verification
- **Agent**: `implementer`

#### 4.6 Task Completion
- **Agent**: `implementer`

---

### Task 7: Update Main Barrel

#### 4.1 Analysis & Planning
- **Agent**: `architect`
- **Deliverable**: Plan `.kilo/plans/20260613-task7-barrel.md`
- **Scope**: Update `src/index.ts` to export all new producer, consumer, request-reply, decorators, and context public APIs

#### 4.2 Implementation
- **Agent**: `implementer`
- **Files**: `src/index.ts`
- **Tests**: N/A
- **Commit**: `feat(barrel): export producer, consumer, request-reply, and decorators`

#### 4.3 Code Review
- **Agent**: `code-reviewer`
- **Fix Agent**: `implementer`

#### 4.4 Documentation
- **Agent**: `docs-specialist`

#### 4.5 Verification
- **Agent**: `implementer`

#### 4.6 Task Completion
- **Agent**: `implementer`

---

### Step 5: TODO File Completion
- **Agent**: `implementer`
- **Actions**: Rename `.agent/todos/20260611/20260611-todo-2.md` to `20260611-todo-2-DONE.md`, merge `feat/producer-consumer-modules` into `main`, push `main` to `origin`

## Constraints & Notes

- **Async/await everywhere** (per TODO notes)
- **Modules configurable** (for JetStream options, connection)
- **Max 2 params per method** → encapsulate in config/options objects
- **Max 200 lines per file** → split into smaller files if needed
- **Prefer private members** → public API surface minimal
- **No commented-out code**
- **Self-documenting code** with minimal JSDoc
- **All new code must have unit tests** following Jest + `@nestjs/testing` patterns
- **Keep library lightweight** — avoid heavy dependencies
