# Global Plan: Fix StreamAutoCreator maxBytes / NATS stream config support

**Source TODO**: `.agent/todos/20260715/20260715-TODO-0.md`  
**Date**: 2026-07-16  
**Branch**: `feat/stream-autocreator-nats-config`

---

## Pre-Analysis

### Problem
`StreamAutoCreator.buildStreamConfig()` hardcodes `max_bytes: -1` (unlimited). Some NATS server accounts require `max_bytes` to be set explicitly on every stream. When auto-creation runs without it, the server rejects the request with:

```
NatsError: account requires a stream config to have max bytes set
  code: 400, err_code: 10113
```

### Approach
Expose a `streamConfig?: Partial<StreamConfig>` override in the public options hierarchy so consumers can pass any NATS stream configuration field (including `max_bytes`, `max_msgs`, `num_replicas`, `max_age`, etc.). `StreamAutoCreator` will merge these overrides on top of its sensible defaults using object spread. This is the minimal, zero-maintenance way to support "any NATS config".

### Affected Interfaces & Providers
1. `EventsToolkitConsumerOptions` (`src/events-toolkit-options.interface.ts`)
2. `ConsumerModuleOptions` (`src/consumer/consumer.module.ts`)
3. `SyncJetStreamConsumerDepsOptions` (`src/consumer/sync-jetstream-consumer-deps-options.interface.ts`)
4. `SyncRequestReplyConsumerDepsOptions` (`src/consumer/sync-request-reply-consumer-deps-options.interface.ts`)
5. `JetStreamConsumerDeps` (`src/consumer/jetstream-consumer-deps.interface.ts`)
6. `RequestReplyConsumerDeps` (`src/consumer/request-reply-consumer-deps.interface.ts`)
7. `StreamAutoCreatorDeps` + `StreamAutoCreator` (`src/consumer/stream-auto-creator.ts`)
8. Provider factories (`src/consumer/consumer-module.providers.ts`)
9. `ConsumerModule.forRoot` / `forRootAsync` (`src/consumer/consumer.module.ts`)
10. `EventsToolkitModule` sync / async paths (`src/events-toolkit.module.ts` + `src/events-toolkit-module.providers.ts`)

---

## Step 2: Git Feature Branch Setup

- `git status`: verify clean working tree; commit unstaged files if needed.
- `git checkout main` (ensure on main; ask user if not).
- `git pull origin main` (if applicable).
- `git checkout -b feat/stream-autocreator-nats-config`

**Sub-agent**: `implementer`

---

## Step 3: Version Update

- Bump `package.json` version from `0.11.2` → `0.11.3` (minor patch/feature addition).
- Commit with message: `chore: bump version to 0.11.3`

**Sub-agent**: `implementer`

---

## Task 1: Add NATS stream config support

### 4.1 Analysis & Planning

**Sub-agent**: `architector`

Deliverables:
1. Verify `StreamConfig` import availability from `nats` package.
2. Confirm all touch points in the dependency graph (see Pre-Analysis).
3. Generate per-task plan saved to `.kilo/plans/20260716-fix-stream-autocreator-maxbytes-task1.md` with exact code snippets, file paths, and technical decisions.
4. Return plan path.

**Technical Decisions**:
- Use `Partial<StreamConfig>` from `nats` as the override type. This natively includes `max_bytes` and every other field without maintenance.
- Merge order: `defaults` first, then `...this.streamConfig` so user overrides win.
- `StreamAutoCreator` receives an optional `logger?: EventLoggerService` in deps so it can INFO-log the merged config before sending to NATS.
- If `streamConfig` is present, log: `Auto-creating stream '<name>' with custom config overrides`.
- If `jsm.streams.add()` throws, the existing error handling propagates it. To "make it clear when the server blocks config options", the error message and the rejected config are logged at `error` level before re-throwing.

---

### 4.2 Implementation

**Sub-agent**: `implementer`

Must follow the task plan from 4.1. Key changes (summary for planning):

#### A. Update `EventsToolkitConsumerOptions`
Add `streamConfig?: Partial<StreamConfig>` to `src/events-toolkit-options.interface.ts`.

#### B. Update `ConsumerModuleOptions`
Add `streamConfig?: Partial<StreamConfig>` to `src/consumer/consumer.module.ts`.

#### C. Update sync deps options
Add `streamConfig?: Partial<StreamConfig>` to:
- `src/consumer/sync-jetstream-consumer-deps-options.interface.ts`
- `src/consumer/sync-request-reply-consumer-deps-options.interface.ts`

#### D. Update consumer deps interfaces
Add `streamConfig?: Partial<StreamConfig>` to:
- `src/consumer/jetstream-consumer-deps.interface.ts`
- `src/consumer/request-reply-consumer-deps.interface.ts`

#### E. Update `StreamAutoCreator`
In `src/consumer/stream-auto-creator.ts`:
- Add `streamConfig?: Partial<StreamConfig>` to `StreamAutoCreatorDeps`.
- Add optional `logger?: EventLoggerService` to `StreamAutoCreatorDeps`.
- Store both in private fields.
- In `buildStreamConfig(subject)`: spread `this.streamConfig` over defaults.
- In `createStream()`: before `jsm.streams.add()`, INFO-log when `streamConfig` is present. In catch, if error is not a race condition, ERROR-log the rejected config and re-throw.
- Import `StreamConfig` is already present.

#### F. Update provider factories
In `src/consumer/consumer-module.providers.ts`:
- `createSyncJetStreamConsumerDepsProvider`: pass `streamConfig: options.streamConfig`.
- `createSyncRequestReplyConsumerDepsProvider`: pass `streamConfig: options.streamConfig`.
- `createAsyncJetStreamConsumerDepsProvider`: pass `streamConfig: combined.moduleOptions.streamConfig`.
- `createAsyncRequestReplyConsumerDepsProvider`: pass `streamConfig: combined.moduleOptions.streamConfig`.

#### G. Update `ConsumerModule.forRoot`
In `src/consumer/consumer.module.ts`:
- Forward `streamConfig: options.streamConfig` into both sync deps providers.

#### H. Update `ConsumerModule.forRootAsync`
The async providers already read from `moduleOptions`; no direct change needed in `consumer.module.ts` beyond ensuring `ConsumerModuleOptions` has the field (done in B).

#### I. Update `EventsToolkitModule` sync path
In `src/events-toolkit.module.ts`:
- `buildSyncImports`: pass `streamConfig: options.consumer?.streamConfig` into `ConsumerModuleOptions`.

#### J. Update `EventsToolkitModule` async path
In `src/events-toolkit.module.ts`:
- `buildConsumerAsyncImport`: pass `streamConfig: opts.consumer?.streamConfig` into the returned `ConsumerModuleOptions`.

#### K. Update consumer services
In `src/consumer/jetstream-consumer.service.ts` and `src/consumer/request-reply-consumer.service.ts`:
- Pass `streamConfig: deps.streamConfig` and `logger: deps.logger` into `StreamAutoCreator` constructor when instantiating.

#### L. Update barrel exports
In `src/consumer/index.ts`:
- Export `StreamAutoCreatorDeps` is already exported; verify no new symbols need exposure.

**Commits**: meaningful messages per logical unit (e.g., `feat: add streamConfig to ConsumerModuleOptions`, `feat: propagate streamConfig through provider factories`, `feat: merge streamConfig in StreamAutoCreator`, `feat: wire streamConfig through EventsToolkitModule`, `test: add streamConfig coverage`).

---

### 4.3 Code Review & Simplification

**Sub-agents**: `code-reviewer` + `code-simplifier` (concurrent)

- Reviewer: check that every provider factory propagates `streamConfig`, that `StreamAutoCreator` correctly merges overrides, and that no interface was missed.
- Simplifier: look for redundant mappings or unnecessary wrapper objects; ensure the spread merge is idiomatic.
- Both generate fix/simplification plans saved to `.kilo/plans/20260716-fix-stream-autocreator-maxbytes-task1-review.md`.
- Plan Agent reviews and assigns fixes to `implementer` (max 3 cycles).

---

### 4.4 Documentation

**Sub-agent**: `docs-specialist`

1. **JSDoc/TSDoc**: Add JSDoc on the new `streamConfig` fields in `ConsumerModuleOptions`, `EventsToolkitConsumerOptions`, `StreamAutoCreatorDeps`, and `StreamAutoCreator` class.
2. **Changelog**: Update `CHANGELOG.md` with a new `[0.11.3]` section describing the added `streamConfig` support, maxBytes fix, and logging improvements.
3. **Docs**: Update `docs/nats-jetstream-configuration.md` §Stream Auto-Creation with an explicit example showing how to set `max_bytes` (and other fields) via `streamConfig`.

---

### 4.5 Verification

**Sub-agent**: `architector`

- Verify the implementation plan from 4.1 was followed.
- Check that `Partial<StreamConfig>` is used consistently across all interfaces.
- Confirm `StreamAutoCreator` unit tests exist and cover:
  - default config when no `streamConfig` provided,
  - merged config when `streamConfig` provided (e.g., `max_bytes: 1000`),
  - race-condition swallowing still works.
- Confirm consumer service auto-creation specs pass and verify `streamConfig` reaches `StreamAutoCreator`.
- Run `npm run typecheck` and `npm run test` (or equivalent) to confirm no regressions.
- Report any deviations; if unacceptable, propose a new TODO.

---

### 4.6 Task Completion

**Sub-agent**: `implementer`

- Append `[DONE]` to the task line in `.agent/todos/20260715/20260715-TODO-0.md`.
- Commit with meaningful message.

---

## Step 5: TODO File Completion

**Sub-agent**: `implementer`

- Rename TODO file to `.agent/todos/20260715/20260715-TODO-0-DONE.md`.
- Ensure all changes are committed in `feat/stream-autocreator-nats-config`.
- Switch to `main`, merge feature branch:
  - On success: delete branch.
  - On failure: notify user.
- Push `main` to `origin` only.

---

## Step 6: Continuation

After completion, the next session should run:

```
full read @AGENTS.md & follow /critical-workflow
do @.agent/todos/20260715/20260715-TODO-0-DONE.md
```

Or proceed to the next unprocessed TODO file.
