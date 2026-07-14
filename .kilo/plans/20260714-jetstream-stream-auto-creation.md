# Global Plan: JetStream Stream Auto-Creation (20260714-todo-2)

## Global Pre-Analysis

**Problem**: NATS JetStream requires streams to be pre-defined with subject filters. When consumers call `jetStream.subscribe()` on a subject with no matching stream, NATS throws `Error: no stream matches subject`. This breaks service startup in environments where streams aren't manually configured (e.g., `ms-db-gateway`).

**Solution**: Add opt-in stream auto-creation in the consumer module. Before subscribing, check if a stream covers the subject via `JetStreamManager`. If not, programmatically create a stream with sensible defaults.

**Version**: Bump minor (0.10.7 → 0.11.0) — new opt-in feature.

**Branch**: `feat/jetstream-stream-auto-creation`

**Files Affected**:
- `src/events-toolkit-options.interface.ts`
- `src/consumer/consumer.module.ts`
- `src/consumer/consumer-module.providers.ts`
- `src/consumer/jetstream-consumer-deps.interface.ts`
- `src/consumer/jetstream-consumer.service.ts`
- `src/consumer/stream-auto-creator.ts` *(new)*
- `src/consumer/index.ts`
- `src/events-toolkit.module.ts`
- `src/consumer/jetstream-consumer.service.spec.ts`
- `src/consumer/consumer.module.spec.ts`
- `src/consumer/stream-auto-creator.spec.ts` *(new)*
- `src/events-toolkit.module.e2e-spec.ts`
- `docs/nats-jetstream-configuration.md` *(new)*

**Architecture Decisions**:
- Extract `StreamAutoCreator` to a dedicated file to respect the 200-line limit on `jetstream-consumer.service.ts` (currently 203 lines).
- Pass `NatsConnection` through `ConsumerModule` deps so `JetStreamConsumerService` can lazily create a `JetStreamManager`.
- Use `jsm.streams.find(subject)` to check if a stream exists. If it throws `"no stream matches subject"`, create the stream.
- Handle race conditions: if stream creation fails because another service already created it, swallow the error.
- Stream names derived from subject: replace non-alphanumeric chars with hyphens, e.g., `auto-company-abc-payment-proof-uploaded-v1`.
- Auto-creation is **opt-in** via `consumer.autoCreateStreams` (default `false`).

---

## Step 2: Git Feature Branch Setup

- Delegate to implementer sub-agent.
- Checkout `main`, create `feat/jetstream-stream-auto-creation`.

## Step 3: Version Update

- Delegate to implementer sub-agent.
- Bump version in `package.json` from `0.10.7` to `0.11.0`.
- Commit: `chore: bump version to 0.11.0`.

---

## Task 1: Implement Stream Auto-Creation

### Task 1 — 4.1 Analysis and Planning

Delegate to architector sub-agent.

**Analysis**:
1. NATS `JetStreamManager` is obtained via `NatsConnection.jetstreamManager()`.
2. `StreamAPI.find(subject)` returns the stream name or throws `Error: no stream matches subject`.
3. `StreamAPI.add(cfg)` creates a new stream; throws if name already exists (race condition).
4. `ConsumerModule` currently receives `connection` OR `jetStream` in `ConsumerModuleOptions`. Auto-creation requires `connection`.
5. `EventsToolkitModule` already resolves and holds the `NatsConnection`; we just need to pass it through to `ConsumerModule`.

**Implementation Plan** (tiny detailed steps):
1. Create `src/consumer/stream-auto-creator.ts`:
   - `StreamAutoCreator` class with constructor taking `{ connection: NatsConnection }`.
   - Private `buildStreamName(subject)` method (sanitize subject to valid NATS stream name).
   - Public `ensureStreamExists(subject)` method:
     - Get `JetStreamManager` from connection.
     - Try `jsm.streams.find(subject)`.
     - If succeeds, return (stream exists).
     - If throws with message `"no stream matches subject"`, call `jsm.streams.add(...)` with:
       - `name`: sanitized stream name
       - `subjects`: [subject]
       - `retention`: `RetentionPolicy.Limits`
       - `storage`: `StorageType.File`
       - `max_msgs`: `-1`
       - `max_bytes`: `-1`
       - `max_age`: `0`
     - If `add` throws and message contains `"already"` or `"exists"`, return (race condition handled).
     - Otherwise rethrow.
2. Update `src/consumer/jetstream-consumer-deps.interface.ts`:
   - Add `connection?: NatsConnection` to `JetStreamConsumerDeps`.
   - Add `autoCreateStreams?: boolean` to `JetStreamConsumerDeps`.
3. Update `src/consumer/jetstream-consumer.service.ts`:
   - Inject `StreamAutoCreator` as private field (or instantiate inline if connection present and autoCreateStreams enabled).
   - In `subscribe()`, after `registerHandler` and before `jetStream.subscribe()`, if `this.deps.autoCreateStreams`, call `await this.streamAutoCreator.ensureStreamExists(options.subject)`.
   - Keep file under 200 lines by extracting auto-creation logic to `StreamAutoCreator`.
4. Update `src/consumer/consumer.module.ts`:
   - Add `autoCreateStreams?: boolean` to `ConsumerModuleOptions`.
5. Update `src/consumer/consumer-module.providers.ts`:
   - `createSyncJetStreamConsumerDepsProvider`: accept `connection` and `autoCreateStreams`, pass to deps.
   - `createAsyncJetStreamConsumerDepsProvider`: resolve `connection` from `RESOLVED_CONNECTION_TOKEN` (add `connection` field to `ResolvedConnection`), pass to deps along with `autoCreateStreams` from `CONSUMER_MODULE_OPTIONS`.
   - `createAsyncResolvedConnectionProvider`: add `connection` field from `moduleOptions.connection`.
6. Update `src/events-toolkit-options.interface.ts`:
   - Add `autoCreateStreams?: boolean` to `EventsToolkitConsumerOptions`.
7. Update `src/events-toolkit.module.ts`:
   - `buildSyncImports`: pass `connection: resolved.connection` and `autoCreateStreams: options.consumer?.autoCreateStreams` to `ConsumerModule.forRoot`.
   - `buildConsumerAsyncImport`: inject `NATS_CONNECTION_TOKEN`, pass `connection` and `autoCreateStreams` to `ConsumerModule.forRootAsync`.
8. Update `src/consumer/index.ts`:
   - Export `StreamAutoCreator`.
9. Update `src/consumer/jetstream-consumer.service.spec.ts`:
   - Add mock `connection` with `jetstreamManager()` stub to deps.
   - Add tests verifying `subscribe` calls `ensureStreamExists` when `autoCreateStreams` is true.
   - Add tests verifying `subscribe` skips auto-creation when `autoCreateStreams` is false or undefined.
10. Update `src/consumer/consumer.module.spec.ts`:
    - Add tests for `autoCreateStreams` forwarding in `forRoot` and `forRootAsync`.
11. Create `src/consumer/stream-auto-creator.spec.ts`:
    - Test `ensureStreamExists` when stream exists (find succeeds).
    - Test `ensureStreamExists` when stream doesn't exist (find throws, add succeeds).
    - Test race condition handling (find throws, add throws with "already exists").
    - Test `buildStreamName` sanitization.
12. Update `src/events-toolkit.module.e2e-spec.ts`:
    - Add `jetstreamManager` stub to the NATS mock.

Save plan to `.kilo/plans/20260714-jetstream-stream-auto-creation-task1.md`.

### Task 1 — 4.2 Implementation

Delegate to implementer sub-agent.
Follow the detailed steps from Task 1 — 4.1.
Commit incrementally with meaningful messages.

### Task 1 — 4.3 Code Review & Simplification

Delegate concurrently to code-reviewer and code-simplifier sub-agents.
Review criteria:
- No file exceeds 200 lines.
- No method body exceeds 50 lines.
- Max 2 params per method (use objects if needed).
- Max 2 nesting levels.
- Private members preferred.
- Self-documenting code.
- No commented-out code.
- Proper error handling for NATS API errors.
- Tests cover happy path, missing stream, race condition, and disabled opt-in.

Generate fix/simplification plans and save to `.kilo/plans/20260714-jetstream-stream-auto-creation-task1-review.md` and `.kilo/plans/20260714-jetstream-stream-auto-creation-task1-simplify.md`.
Then delegate fixes to implementer.

### Task 1 — 4.4 Documentation

Delegate to docs-specialist sub-agent.
- Add JSDoc to `StreamAutoCreator` and updated interfaces.
- Update `docs/nats-jetstream-configuration.md` (new file) documenting:
  - Required NATS server configuration (JetStream enabled, storage directory).
  - Stream setup options (manual vs auto-creation).
  - Opt-in `autoCreateStreams` option usage.
  - Example stream creation via NATS CLI.
  - Recommended production configuration (file storage, limits retention).

### Task 1 — 4.5 Verification

Delegate to architector sub-agent.
- Verify implementation matches plan.
- Run `npm run typecheck`, `npm run lint`, `npm test`.
- Report any deviations.

### Task 1 — 4.6 Task Completion

Delegate to implementer sub-agent.
- Mark Task 1 as `[DONE]` in the TODO file.
- Commit with meaningful message.

---

## Task 2: NATS + JetStream Server Configuration Documentation

### Task 2 — 4.1 Analysis and Planning

Delegate to architector sub-agent.

**Analysis**:
The TODO requests documenting "any other required nats+jetstream required configuration." Beyond stream auto-creation, microservices need:
- NATS server with JetStream enabled (`-js` flag).
- Persistent storage directory for JetStream (`--store_dir`).
- Required stream/consumer settings for production.
- Memory vs File storage trade-offs.
- Retention policies (Limits, Interest, Workqueue).
- Maximum message/age/bytes settings.

**Implementation Plan**:
1. Create `docs/nats-jetstream-configuration.md`:
   - Section 1: NATS Server Requirements (version, JetStream flag, store_dir).
   - Section 2: JetStream Configuration for Events Toolkit.
   - Section 3: Stream Auto-Creation (`autoCreateStreams` option).
   - Section 4: Manual Stream Setup (CLI examples).
   - Section 5: Production Recommendations.
   - Section 6: Docker Compose Example.
2. Update `docs/ai-agent-guidelines.md` if it references NATS setup.
3. Update `README.md` with a link to the new doc.

Save plan to `.kilo/plans/20260714-jetstream-stream-auto-creation-task2.md`.

### Task 2 — 4.2 Implementation

Delegate to docs-specialist sub-agent.
Write `docs/nats-jetstream-configuration.md` and update cross-references.

### Task 2 — 4.3 Code Review & Simplification

Delegate to code-reviewer sub-agent.
Review documentation for accuracy, completeness, and alignment with the codebase.

### Task 2 — 4.4 Documentation

Already covered in 4.2 (this is a docs task).

### Task 2 — 4.5 Verification

Delegate to architector sub-agent.
- Verify docs match NATS 2.29.x API and toolkit options.
- Check all cross-links are valid.

### Task 2 — 4.6 Task Completion

Delegate to implementer sub-agent.
- Mark Task 2 as `[DONE]` in the TODO file.
- Commit.

---

## Step 5: TODO File Completion

Delegate to implementer sub-agent.
- Rename TODO file to `20260714-todo-2-DONE.md`.
- Ensure all changes committed on feature branch.
- Switch to `main`, merge feature branch.
- On success: delete feature branch.
- Push `main` to `origin` only.

---

## Continuation

After completion, next step for the user:
```
full read @AGENTS.md & follow /critical-workflow
do @.agent/todos/20260714/20260714-todo-0.md
```
(or whichever TODO is next)
