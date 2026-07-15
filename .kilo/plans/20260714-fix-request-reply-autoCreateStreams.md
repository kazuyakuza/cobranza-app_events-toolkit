# Global Plan — Fix `RequestReplyConsumerService` missing `autoCreateStreams` support

**TODO File**: `.agent/todos/20260714/20260714-todo-3.md`
**Date**: 2026-07-14
**Branch**: `fix/request-reply-autoCreateStreams`
**Version Bump**: `0.11.1` → `0.11.2` (patch)

## Pre-Analysis

`JetStreamConsumerService` was updated in v0.11.0/0.11.1 to support `autoCreateStreams`, which uses `StreamAutoCreator` to ensure a JetStream stream exists before subscribing. The same support was **not** added to `RequestReplyConsumerService`. When `ms-db-gateway` (or any service using request-reply with `autoCreateStreams: true`) starts, `RequestReplyConsumerService` tries to subscribe to `company.*.response.v1` but fails with `Error: no stream matches subject` because no stream exists and no auto-creation happens.

The fix is to replicate the `autoCreateStreams` pattern from `JetStreamConsumerService` into `RequestReplyConsumerService`, including:
- Adding `connection` and `autoCreateStreams` to `RequestReplyConsumerDeps`
- Adding `connection` and `autoCreateStreams` to `SyncRequestReplyConsumerDepsOptions`
- Instantiating `StreamAutoCreator` in `RequestReplyConsumerService` constructor
- Calling `ensureStreamExists()` in `RequestReplyConsumerService.subscribe()`
- Passing `connection` and `autoCreateStreams` through sync and async provider factories
- Passing them from `ConsumerModule.forRoot()` into the sync provider factory
- Adding unit tests for the new behavior
- Updating CHANGELOG and bumping version

## Steps

### Step 2: Git Feature Branch Setup
- **Sub-agent**: implementer
- Commit any unstaged changes, switch to `main`, create branch `fix/request-reply-autoCreateStreams`, switch to it.

### Step 3: Version Update
- **Sub-agent**: implementer
- Bump `package.json` version from `0.11.1` to `0.11.2`.
- Commit: `chore: bump version to 0.11.2`.

### Task 1: Fix `RequestReplyConsumerService` missing `autoCreateStreams` support

#### 4.1 Analysis & Planning
- **Sub-agent**: architector
- Research the exact diff between `JetStreamConsumerService` and `RequestReplyConsumerService` regarding auto-creation.
- Generate a detailed implementation plan saved to `.kilo/plans/20260714-fix-request-reply-autoCreateStreams-task1.md`.
- Plan must cover every file change with exact line-level guidance.

#### 4.2 Implementation
- **Sub-agent**: implementer
- Follow the detailed plan from 4.1.
- Files to modify:
  1. `src/consumer/request-reply-consumer-deps.interface.ts`
  2. `src/consumer/sync-request-reply-consumer-deps-options.interface.ts`
  3. `src/consumer/request-reply-consumer.service.ts`
  4. `src/consumer/consumer-module.providers.ts`
  5. `src/consumer/consumer.module.ts`
  6. `src/consumer/request-reply-consumer.service.spec.ts`
  7. `CHANGELOG.md`
- Commit after meaningful chunks.

#### 4.3 Code Review & Simplification
- **Sub-agents**: code-reviewer + code-simplifier (concurrent)
- Review for plan adherence, correctness, NestJS DI safety, test coverage, and code style.
- Generate fix/simplification plans saved to `.kilo/plans/20260714-fix-request-reply-autoCreateStreams-task1-review.md` and `.kilo/plans/20260714-fix-request-reply-autoCreateStreams-task1-simplify.md`.
- Plan Agent reviews and assigns fix/simplification to implementer if needed.

#### 4.4 Documentation
- **Sub-agent**: docs-specialist
- Update CHANGELOG with the fix entry under `[0.11.2]`.
- Add JSDoc to any new public fields or constructor parameters.
- Ensure any relevant `.md` docs mention that `autoCreateStreams` applies to both JetStream and request-reply consumers.

#### 4.5 Verification
- **Sub-agent**: architector
- Verify all changes match the implementation plan.
- Confirm tests pass: `npm test -- src/consumer/request-reply-consumer.service.spec.ts` and full suite.
- Confirm typecheck passes: `npm run typecheck`.
- Confirm lint passes: `npm run lint`.
- Report any deviations.

#### 4.6 Task Completion
- **Sub-agent**: implementer
- Append `[DONE]` to the task title in `.agent/todos/20260714/20260714-todo-3.md`.
- Mark all sub-items as done.
- Commit with meaningful message.

### Step 5: TODO File Completion
- **Sub-agent**: implementer
- Rename TODO file to `20260714-todo-3-DONE.md`.
- Ensure all changes are committed in `fix/request-reply-autoCreateStreams`.
- Switch to `main`, merge feature branch.
- On success: delete feature branch.
- Push `main` to `origin` only.

### Step 6: Continuation
After completion, the next step for the user is:
```text
full read @AGENTS.md & follow /critical-workflow
do @.agent/todos/20260714/20260714-todo-0.md
```
(or the next undone TODO file in chronological order)
