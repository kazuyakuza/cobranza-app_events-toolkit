# Global Plan — Extend `@cobranza-apps/events-toolkit` to Support Durable JetStream Consumers

**Date:** 2026-07-22  
**TODO:** `.agent/todos/20260722/20260722-todo-1.md`  
**Plan:** `.kilo/plans/20260722-extend-durable-jetstream-consumers.md`

---

## 1. Task Origin

Single TODO file with 6 sub-tasks. Grouped into **2 workflow tasks** for practical execution while maintaining full critical-workflow coverage.

---

## 2. Pre-Analysis & Architecture Decisions

### Problem
`EventsToolkitConsumerOptions` exposes only stream-level (`autoCreateStreams`, `streamConfig`) and toggle (`enable`, `dlqSubjectBuilder`) options. It does **not** expose JetStream **consumer-level** options (`durable_name`, `ack_policy`, `deliver_policy`, `max_deliver`, `replay_policy`). Consequently, `JetStreamConsumerService` and `RequestReplyConsumerService` always create **ephemeral push consumers** that replay the entire stream on reconnect.

### Technical Decisions

1. **Dual API — convenience fields + full `consumerOpts`**  
   `EventsToolkitConsumerOptions` will gain both:
   - `consumerOpts?: Partial<ConsumerOpts> | ConsumerOptsBuilder` — full control for power users.
   - `durableName?: string`, `deliverPolicy?: DeliverPolicy`, `ackPolicy?: AckPolicy`, `maxDeliver?: number`, `replayPolicy?: ReplayPolicy` — convenience fields for the 90% use-case.
   When both are present, convenience fields are **merged on top of** `consumerOpts` (caller wins). Per-subscription `consumerOpts` (from `SubscribeOptions`) takes ultimate precedence.

2. **Gateway-level defaults stored in service instances**  
   `JetStreamConsumerDeps` and `RequestReplyConsumerDeps` receive the new options. Each service stores them as private fields and merges them at `subscribe()` time. This avoids changing method signatures (max-2-params rule) and keeps the public API stable.

3. **Merge strategy in `subscribe-options.interface.ts`**  
   A new `mergeConsumerSubscribeOpts(gateway?: ConsumerSubscribeOpts, perSub?: ConsumerSubscribeOpts): ConsumerSubscribeOpts` helper is introduced. It handles all four combinations (undefined × builder × plain object) and applies `ensureValidConsumerConfig` so `ack_policy` and `deliver_subject` are never left undefined.

4. **Durable resume behavior**  
   When `durableName` is set, NATS persists the consumer's last acknowledged position server-side. On reconnect, the same `durable_name` causes NATS to resume from that position instead of replaying history. If `deliverPolicy` is omitted with `durableName`, NATS defaults to the durable's stored state automatically. No extra client-side bookkeeping is required.

5. **Type exports**  
   `DeliverPolicy`, `AckPolicy`, `ReplayPolicy`, `ConsumerOpts`, `ConsumerOptsBuilder` are already available from the `nats` peer dependency. We do **not** re-export them from the toolkit barrel; consumers import them directly from `nats`. We only export the new toolkit-specific types if any are created.

6. **File count & line limits**  
   - Extract merge logic to a **new file** (`merge-consumer-opts.ts`) to keep `subscribe-options.interface.ts` under 200 lines.  
   - Extract gateway opts builder to a **new file** (`build-gateway-consumer-opts.ts`) to keep `subscribe-options.interface.ts` under 200 lines.  
   - Existing services (`jetstream-consumer.service.ts`, `request-reply-consumer.service.ts`) are ~150 lines; adding a private merge call + field stays under 200.

---

## 3. Global Execution Steps

### Step 2 — Git Feature Branch Setup
- Commit any unstaged work on current branch.
- Checkout `main`, ensure clean.
- Create branch: `feat/extend-durable-jetstream-consumers`
- Switch to new branch.

### Step 3 — Version Update
- Increment `package.json` version from `0.13.0` → `0.14.0` (minor bump — new feature).
- Commit: `chore: bump version to 0.14.0`

---

## 4. Task Breakdown

### Task 1: Extend Consumer Options & Wire Through Subscription (TODO tasks 1–5)

**Covers:**
- Extend `EventsToolkitConsumerOptions`
- Pass consumer options through to `JetStreamConsumerService` and `RequestReplyConsumerService`
- Ensure durable consumer resume on reconnect
- Update type exports
- Add tests

**4.1 Analysis & Planning** → `architector`
- Confirm exact NATS `nats` package API surface for `ConsumerOpts`, `ConsumerOptsBuilder`, `DeliverPolicy`, `AckPolicy`, `ReplayPolicy`.
- Verify no naming conflicts with existing symbols.
- Produce per-task plan: `.kilo/plans/20260722-extend-durable-jetstream-consumers-task1.md`

**4.2 Implementation** → `implementer`
Files to modify (in dependency order):

1. **`src/consumer/gateway-consumer-opts.interface.ts`** (new, ~20 lines)  
   Define `GatewayConsumerOpts` with `consumerOpts`, `durableName`, `deliverPolicy`, `ackPolicy`, `maxDeliver`, `replayPolicy`.

2. **`src/consumer/build-gateway-consumer-opts.ts`** (new, ~30 lines)  
   Function `buildGatewayConsumerOpts(gateway: GatewayConsumerOpts): ConsumerSubscribeOpts | undefined`. Converts convenience fields into a `ConsumerOptsBuilder` when no explicit `consumerOpts` is provided.

3. **`src/consumer/merge-consumer-opts.ts`** (new, ~40 lines)  
   Function `mergeConsumerSubscribeOpts(gateway?, perSub?)`. Handles builder vs plain-object precedence, applies defaults, returns safe value for `jetStream.subscribe()`.

4. **`src/consumer/subscribe-options.interface.ts`** (~+5 lines)  
   Re-export new helpers. Keep existing exports intact.

5. **`src/events-toolkit-options.interface.ts`** (~+20 lines)  
   Extend `EventsToolkitConsumerOptions` with new fields. Import `DeliverPolicy`, `AckPolicy`, `ReplayPolicy`, `ConsumerOpts`, `ConsumerOptsBuilder` from `nats`.

6. **`src/consumer/consumer.module.ts`** (~+10 lines)  
   Add new fields to `ConsumerModuleOptions`.

7. **`src/consumer/jetstream-consumer-deps.interface.ts`** (~+8 lines)  
   Add `GatewayConsumerOpts` fields.

8. **`src/consumer/request-reply-consumer-deps.interface.ts`** (~+8 lines)  
   Add `GatewayConsumerOpts` fields.

9. **`src/consumer/sync-jetstream-consumer-deps-options.interface.ts`** (~+8 lines)  
   Add `GatewayConsumerOpts` fields.

10. **`src/consumer/sync-request-reply-consumer-deps-options.interface.ts`** (~+8 lines)  
    Add `GatewayConsumerOpts` fields.

11. **`src/consumer/consumer-module.providers.ts`** (~+20 lines)  
    Forward new fields through all sync and async provider factories.

12. **`src/consumer/jetstream-consumer.service.ts`** (~+15 lines)  
    Store gateway opts in constructor. In `subscribe()`, merge with per-subscription opts via `mergeConsumerSubscribeOpts`.

13. **`src/consumer/request-reply-consumer.service.ts`** (~+10 lines)  
    Store gateway opts in constructor. In `subscribe()`, pass merged opts to `resolveConsumerSubscribeOpts`.

14. **`src/events-toolkit.module.ts`** (~+10 lines)  
    Forward new consumer options to `ConsumerModule` in both sync (`buildSyncImports`) and async (`buildConsumerAsyncImport`) paths.

15. **`src/consumer/index.ts`** (~+2 lines)  
    Export new helpers if they need to be public.

**4.3 Code Review & Simplification** → `code-reviewer` + `code-simplifier`
- Review for max-lines-per-file, max-lines-per-method, max-depth, max-params compliance.
- Verify no breaking changes to existing `SubscribeOptions` or `ConsumerModuleOptions` shapes.
- Simplify merge logic if possible.
- Fix plan saved to `.kilo/plans/20260722-extend-durable-jetstream-consumers-task1-review.md`
- Implementer applies fixes.

**4.4 Documentation (code comments)** → `docs-specialist`
- Add JSDoc to `GatewayConsumerOpts`, `buildGatewayConsumerOpts`, `mergeConsumerSubscribeOpts`.
- Update JSDoc on `EventsToolkitConsumerOptions` to reference the new fields and link to NATS docs.

**4.5 Verification** → `architector`
- Check that every modified file is under 200 lines.
- Check that every new method body is under 50 lines.
- Check that `durableName` reaches `jetStream.subscribe()` in both services.
- Check that `buildConsumerAsyncImport` forwards the new options.
- Report any deviations.

**4.6 Task Completion** → `implementer`
- Mark task 1 as `[DONE]` in TODO file.
- Commit with meaningful message.

---

### Task 2: Update Documentation & Changelog (TODO task 6)

**4.1 Analysis & Planning** → `architector`
- Identify all docs that need updates.
- Plan new doc file if needed.
- Per-task plan: `.kilo/plans/20260722-extend-durable-jetstream-consumers-task2.md`

**4.2 Implementation** → `implementer`
Files to modify:
1. **`docs/nats-jetstream-configuration.md`** — Add new section "Durable Consumers" covering:
   - Why durable consumers matter (reconnect resume vs replay).
   - How to configure `durableName` via `EventsToolkitModule.forRoot()`.
   - How to use `consumerOpts` for full control.
   - Per-subscription override vs gateway default.
   - Example code snippets.

2. **`CHANGELOG.md`** — Add `## [0.14.0]` entry with all new consumer-level options.

3. **`README.md`** — Update consumer setup example if it currently shows only `autoCreateStreams`.

4. **`docs/ai-agent-guidelines.md`** — Update Public API Quick Reference table if it lists `EventsToolkitConsumerOptions` fields.

5. **`docs/event-messaging-convention.md`** — If consumer configuration is mentioned, cross-link to the new durable-consumer docs.

**4.3 Code Review & Simplification** → `code-reviewer` + `code-simplifier`
- Check for broken internal links, formatting, and consistency with existing docs.

**4.4 Documentation** → `docs-specialist`
- Ensure all code examples compile and use correct imports.
- Add cross-references.

**4.5 Verification** → `architector`
- Verify docs accurately describe the implemented behavior.
- Verify no broken links.

**4.6 Task Completion** → `implementer`
- Mark task 2 as `[DONE]` in TODO file.
- Commit with meaningful message.

---

## 5. TODO File Completion

- Rename `.agent/todos/20260722/20260722-todo-1.md` → `.agent/todos/20260722/20260722-todo-1-DONE.md`
- Ensure all files are committed in feature branch.
- Merge feature branch to `main`.
- Push `main` to `origin`.

---

## 6. Continuation Prompt

```
full read @AGENTS.md & follow /critical-workflow
do @.agent/todos/<next-undone-file>
```

---

## Risk Mitigation

- **Breaking changes:** None. All new fields are optional. Existing consumers default to ephemeral behavior unchanged.
- **NATS version compatibility:** `durable_name`, `ack_policy`, `deliver_policy`, `max_deliver`, `replay_policy` are stable in NATS 2.29.x (peer dependency). No new runtime dependency is added.
- **File size overflow:** Merge logic extracted to new files to stay under 200-line limit.
- **Test regression:** Existing tests for `resolveConsumerSubscribeOpts`, `JetStreamConsumerService`, and `RequestReplyConsumerService` must continue to pass. New tests only add coverage; they do not modify existing assertions.
