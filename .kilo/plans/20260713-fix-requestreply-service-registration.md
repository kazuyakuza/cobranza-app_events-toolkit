# Global Plan: Fix RequestReplyService Registration & Add E2E Test

**Source TODO:** `.agent/todos/20260713/20260713-todo-2.md`  
**Branch:** `feat/fix-requestreply-service-registration`  
**Version bump:** `0.10.3` → `0.10.4` (patch — bug fix)

---

## Pre-analysis

### Current State
- `events-toolkit` is at **v0.10.3**.
- **Bug 1** (`forRootAsync` missing exports) and **Bug 2** (`DiscoveryModule` missing `@nestjs/core` import) are already fixed.
- **Bug 3** (`RequestReplyService` never registered) is **still open**.
  - `RequestReplyService` has `@Injectable()` but is **not present** in any module's `providers` or `exports`.
  - Its dependency token `REQUEST_REPLY_DEPS_TOKEN` is also **not provided** by any module.
  - The `forRoot` path lacks request-reply registration just like `forRootAsync`.
- `forRootAsync` currently resolves NATS via `buildAsyncJetStreamProvider`, which returns a `JetStreamClient`. `RequestReplyService` needs the underlying `NatsConnection` as well. A naive second provider would create a **duplicate NATS connection**.

### Technical Decisions
1. **Single-connection guarantee in `forRootAsync`**: Introduce an internal provider token (`RESOLVED_NATS_TOKEN`) that resolves the NATS connection **once**. Both `JETSTREAM_TOKEN` and `NATS_CONNECTION_TOKEN` will derive from it, preventing duplicate connections.
2. **Direct registration in `EventsToolkitModule`**: Add `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN` providers directly to `EventsToolkitModule.forRoot` and `forRootAsync`, and export them. This mirrors the existing top-level `EventLoggerService` provider pattern.
3. **Optional config exposure**: Add `requestReply?: Partial<RequestReplyConfig>` to `EventsToolkitModuleOptions` so consumers can override `defaultTimeoutMs`. Defaults will be applied via `resolveRequestReplyConfig()`.
4. **E2E test placement**: `src/events-toolkit.module.e2e-spec.ts` — this matches `jest.e2e.config.js` regex (`\.e2e-spec\.ts$`) and will run in CI.

### Task Breakdown (from TODO)

#### Task 1 — Fix RequestReplyService registration
- Restructure async NATS resolution (`buildAsyncJetStreamProvider`) to depend on a shared internal `RESOLVED_NATS_TOKEN`.
- Add `buildAsyncNatsConnectionProvider` that derives `NATS_CONNECTION_TOKEN` from `RESOLVED_NATS_TOKEN`.
- Add `buildRequestReplyDepsProvider` (sync + async variants) that bundles `NatsConnection`, `ProducerService`, `EventLoggerService`, and resolved config into `REQUEST_REPLY_DEPS_TOKEN`.
- Register `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN` in `EventsToolkitModule.forRoot` providers and exports.
- Register `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN` in `EventsToolkitModule.forRootAsync` providers and exports.
- Optionally update `EventsToolkitModuleOptions` with `requestReply` field.

#### Task 2 — Add end-to-end integration test
- Create `src/events-toolkit.module.e2e-spec.ts`.
- Use `Test.createTestingModule` with a global mock module for `@nestjs/core` `DiscoveryService` / `Reflector` / `MetadataScanner`.
- Call `EventsToolkitModule.forRootAsync` with all subsystems enabled (`consumer`, `outbox`, `discovery`).
- Mock `nats.connect` so the module can resolve the connection internally.
- Assert that the following services resolve from the compiled module:
  - `ProducerService`
  - `ConsumerService`
  - `OutboxService`
  - `DiscoveryService` (library)
  - `RequestReplyService`
  - `RequestReplyConsumerService`
- Ensure the test passes with `npm run test:e2e`.

---

## Execution Sequence

Each step is a separate `task` tool invocation with the appropriate `subagent_type`.

| Step | Description | Agent |
|------|-------------|-------|
| **2** | Git Feature Branch Setup | implementer |
| **3** | Version Update (0.10.3 → 0.10.4) | implementer |
| **Task 1: 4.1** | Analysis & Planning — generate per-task plan | architector |
| **Task 1: 4.2** | Implementation — apply Bug 3 fix to `forRoot` and `forRootAsync` | implementer |
| **Task 1: 4.3** | Code Review & Simplification — review for errors/simplification | code-reviewer + code-simplifier |
| **Task 1: 4.3-fix** | Apply review fixes & simplifications | implementer |
| **Task 1: 4.4** | Documentation — JSDoc updates for new providers / options | docs-specialist |
| **Task 1: 4.5** | Verification — check plan adherence | architector |
| **Task 1: 4.6** | Task Completion — mark `[DONE]` and commit | implementer |
| **Task 2: 4.1** | Analysis & Planning — generate per-task plan | architector |
| **Task 2: 4.2** | Implementation — write `events-toolkit.module.e2e-spec.ts` | implementer |
| **Task 2: 4.3** | Code Review & Simplification — review test quality | code-reviewer + code-simplifier |
| **Task 2: 4.3-fix** | Apply review fixes & simplifications | implementer |
| **Task 2: 4.4** | Documentation — test comments / docs | docs-specialist |
| **Task 2: 4.5** | Verification — check plan adherence | architector |
| **Task 2: 4.6** | Task Completion — mark `[DONE]` and commit | implementer |
| **5** | TODO File Completion — rename, merge branch, push | implementer |

---

## Acceptance Criteria
- All existing library tests pass (`npm run test`).
- New E2E test passes (`npm run test:e2e`).
- `EventsToolkitModule.forRootAsync` exports `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN`.
- `EventsToolkitModule.forRoot` exports `RequestReplyService` and `REQUEST_REPLY_DEPS_TOKEN`.
- No duplicate NATS connections are created in the async path.
