# Global Plan: Fix `createDefaultConsumerOpts` missing `deliverTo` for push consumers

## Overview

Address NATS `push consumer requires deliver_subject` error by ensuring default consumer options include `.deliverTo()`, and preserve caller-provided `deliverTo` when present. Add unit tests and update changelog.

## Tasks

### Task 1: Update `subscribe-options.interface.ts` and add unit tests

**Pre-analysis:** The current `createDefaultConsumerOpts()` returns `consumerOpts().manualAck().ackExplicit()` without a `deliverTo` call, causing `jetStream.subscribe()` to fail under NATS 2.29.3 validation. The fix is to add `.deliverTo(createInbox())`. `resolveConsumerSubscribeOpts` needs to respect existing `deliverTo` when caller provides a `ConsumerOptsBuilder`. A new spec file `subscribe-options.interface.spec.ts` must be created since none exists.

**Steps (4.1–4.6 per Critical Workflow):**
- **4.1 Analysis & Planning**: Architector — detail exact code changes and test scenarios.
- **4.2 Implementation**: Implementer — apply code change to `src/consumer/subscribe-options.interface.ts`, create `src/consumer/subscribe-options.interface.spec.ts`.
- **4.3 Code Review & Simplification**: Code-reviewer + code-simplifier — review correctness and test coverage; fix plan if needed.
- **4.4 Documentation**: Docs-specialist — update changelog, add inline guidance if needed.
- **4.5 Verification**: Architector — confirm implementation matches plan and tests pass.
- **4.6 Task Completion**: Implementer — mark task `[DONE]` in TODO file.

### Task 2: Update `resolveConsumerSubscribeOpts` behavior preservation

**Pre-analysis:** When `opts` is a `ConsumerOptsBuilder` (has `getOpts`), the function currently returns it as-is. That is correct because the builder may already have `deliverTo` set. When `opts` is a plain `Partial<ConsumerOpts>` object, we must ensure the resulting config has `deliver_subject`. Since plain objects are merged into `ensureValidConsumerConfig`, we need to verify whether the object path already sets it or if we should inject it. The safest behavior: if `opts` already contains `deliverTo` (or `config.deliver_subject`), preserve it; otherwise set a default `deliverTo(createInbox())` in `createDefaultConsumerOpts`.

**Steps (4.1–4.6 per Critical Workflow):**
- **4.1 Analysis & Planning**: Architector — detail how `resolveConsumerSubscribeOpts` should handle both builder and plain object paths.
- **4.2 Implementation**: Implementer — apply changes.
- **4.3 Code Review & Simplification**: Code-reviewer + code-simplifier.
- **4.4 Documentation**: Docs-specialist — update docs if behavior changes require explanation.
- **4.5 Verification**: Architector — confirm behavior.
- **4.6 Task Completion**: Implementer — mark task `[DONE]`.

### Task 3: Add unit tests for `subscribe-options.interface.ts`

**Pre-analysis:** New spec file needed: `src/consumer/subscribe-options.interface.spec.ts`. Scenarios:
1. `createDefaultConsumerOpts()` returns builder with `deliver_subject` present.
2. `resolveConsumerSubscribeOpts(undefined)` includes `deliver_subject`.
3. `resolveConsumerSubscribeOpts(existingBuilderWithDeliverTo)` preserves existing `deliver_subject`.
4. `resolveConsumerSubscribeOpts(plainObjectWithDeliverSubject)` preserves it.
5. `resolveConsumerSubscribeOpts(plainObjectWithoutDeliverSubject)` adds default.

**Steps (4.1–4.6 per Critical Workflow):**
- **4.1 Analysis & Planning**: Architector — define test structure and assertions.
- **4.2 Implementation**: Implementer — write tests, ensure they pass (`npm run test`).
- **4.3 Code Review & Simplification**: Code-reviewer + code-simplifier.
- **4.4 Documentation**: Docs-specialist — add JSDoc comments in spec if helpful.
- **4.5 Verification**: Architector — confirm tests cover scenarios and pass.
- **4.6 Task Completion**: Implementer — mark task `[DONE]`.

### Task 4: Update documentation (CHANGELOG)

**Pre-analysis:** Add entry under `## [Unreleased]` or bump to `0.11.4` in `CHANGELOG.md` describing the fix. Reference the NATS validation error.

**Steps (4.1–4.6 per Critical Workflow):**
- **4.1 Analysis & Planning**: Architector — determine version bump and changelog section placement.
- **4.2 Implementation**: Implementer — edit `CHANGELOG.md`, bump `package.json` version to `0.11.4`.
- **4.3 Code Review & Simplification**: Code-reviewer + code-simplifier.
- **4.4 Documentation**: Docs-specialist — review wording.
- **4.5 Verification**: Architector — confirm changelog accuracy.
- **4.6 Task Completion**: Implementer — mark task `[DONE]`.

## Global Steps

- **Step 2: Git Feature Branch Setup** — implementer (`feat/fix-deliverTo-push-consumer`)
- **Step 3: Version Update** — implementer (patch bump to `0.11.4`)
- **Step 5: TODO File Completion** — implementer (rename to `-DONE.md`, merge branch)

## Constraints
- Follow `.kilo/rules/code-guidelines.md` and `.kilo/rules/max-lines-per-file.md`.
- No conversational filler in code or docs.
- Preserve existing code structures.
- Use `createInbox()` from `nats` package.
