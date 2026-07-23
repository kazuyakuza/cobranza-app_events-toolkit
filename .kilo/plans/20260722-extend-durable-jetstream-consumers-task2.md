# Plan — Task 2: 4.1 Analysis & Planning — Update Docs (Durable JetStream Consumers, v0.14.0)

## Scope

- **Source**: `.agent/todos/20260722/20260722-todo-1.md`, Task 6 "Update Docs".
- **Single discrete step**: produce this implementation plan only. No code changes here.
- **Target version**: `0.14.0` (already bumped in `package.json`; commit `4bcfb0e`).
- **Branch**: `feat/extend-durable-jetstream-consumers` (already created, Tasks 1–5 committed).

## Pre-Analysis (technical & architectural)

### Current state (verified)

- `package.json` version = `0.14.0`.
- Tasks 1–5 DONE (interface extension, option threading, durable resume, type exports, tests).
- New public exports confirmed in `src/consumer/index.ts`:
  - `GatewayConsumerOptions` (from `./gateway-consumer-options.interface`)
  - `resolveSubscriptionConsumerOpts` (from `./consumer-opts-merger`)
- `EventsToolkitConsumerOptions` (in `src/events-toolkit-options.interface.ts`) documents the new fields: `consumerOpts`, `durableName`, `deliverPolicy`, `ackPolicy`, `maxDeliver`, `replayPolicy`.
- Merge helper `resolveSubscriptionConsumerOpts` precedence: per-subscription builder > per-subscription `Partial<ConsumerOpts>` > gateway scalars > gateway `consumerOpts` (builder extracted via `getOpts()` or `Partial<ConsumerOpts>`) > built-in defaults from `resolveConsumerSubscribeOpts`.
- Built-in defaults: `manualAck()` + `ackExplicit()` + unique `deliverTo(createInbox())` (since v0.11.4).

### Docs state from Task 1's 4.4 step (docs-specialist)

- `CHANGELOG.md`: top entry is `## [0.13.0] — 2026-07-22`. **No `## [0.14.0]` entry exists.** Last 100 lines confirm v0.14.0 absent.
- `docs/nats-jetstream-configuration.md`: "Durable Consumers" section present (lines 244–367) — covers problem, `durableName` mechanism, `forRoot()` config, `consumerOpts` full-control example, convenience scalars, per-subscription override, recommendation table. TOC entry at line 12 links to `#durable-consumers`. "See also" (line 602) cross-links to README `#jetstream-stream-configuration`, `event-messaging-convention.md`, `ai-agent-guidelines.md`.
- `README.md` (lines 260–399):
  - Configuration Options table (line 272) lists new consumer fields.
  - "Durable Consumers (Recommended for Production)" section (lines 378–393) with quick-start snippet and link to `docs/nats-jetstream-configuration.md#durable-consumers`.
- `docs/ai-agent-guidelines.md`:
  - Consumer Quick Reference note (line 241) links to `nats-jetstream-configuration.md#durable-consumers`.
  - Public API Quick Reference (line 508) — Consumer row notes `durableName` guidance.

### Ambiguities / gaps identified

None blocking. The TODO Task 6 explicitly requires: "Update changelog and all related documentation." CHANGELOG v0.14.0 is the main missing artifact. Doc verification and cross-link integrity checks close the loop.

### Architectural decisions

- Follow existing CHANGELOG format (Keep a Changelog + SemVer), with sections `### Added`, `### Changed`, `### Documentation`, `### Notes`, matching v0.12.0 / v0.13.0 style and date format `— YYYY-MM-DD`.
- Include all new consumer-level options in a single cohesive `### Added` block (interface, scalars, helper, behavior) since they ship together and depend on each other.
- Backward compatibility note explicitly states defaults preserve ephemeral push-consumer behavior — precedent from v0.11.4 / v0.13.0.
- No new doc file needed: `docs/nats-jetstream-configuration.md` already hosts the canonical "Durable Consumers" reference (Task 4.4 created it). TODO conditional ("If not specific doc file related to ... generate a new one") is satisfied by the existing file.

## High-Level Approach

1. Insert `## [0.14.0]` entry at the top of `CHANGELOG.md` (above `## [0.13.0]`).
2. Verify Task 4.4 doc deliveries are complete and accurate (re-read each file section; check field names match source symbols).
3. Cross-link integrity sweep: ensure every doc that mentions durable consumers links to `docs/nats-jetstream-configuration.md#durable-consumers`, and the Drift section in `nats-jetstream-configuration.md` "See also" links resolve to valid README anchors.
4. Commit CHANGELOG only (docs already committed by Task 4.4).
5. No build/test required — docs-only change. Optionally run `npm run lint` / `npm run build` no-ops not needed for .md only; skip per critical-workflow (4.2 implementer decides).

## Detailed Implementation Plan (atomic, verifiable steps)

### Step 1 — Insert CHANGELOG v0.14.0 entry

- **File**: `CHANGELOG.md`
- **Action**: Insert new `## [0.14.0] — 2026-07-22` block immediately above the current `## [0.13.0] — 2026-07-22` block (i.e., after the header preamble lines 1–7, before line 8).
- **Exact insertion content** (preserve existing newline style — real newlines, no literal `\n`):

```markdown
## [0.14.0] — 2026-07-22

### Added

- **Consumer-level JetStream configuration on `EventsToolkitConsumerOptions`** — new gateway-level fields that thread through the consumer DI chain and are merged with per-subscription options by `resolveSubscriptionConsumerOpts`:
  - **`consumerOpts?: Partial<ConsumerOpts> | ConsumerOptsBuilder`** — full NATS-native consumer options. Accepts a `ConsumerOptsBuilder` (e.g. `consumerOpts().durable('x').deliverAll()`) or a plain `Partial<ConsumerOpts>`. When omitted, built-in defaults apply (manual ack, explicit ack policy, ephemeral inbox `deliver_subject`).
  - **`durableName?: string`** — durable consumer name. Enables server-side ack-position persistence and resume on reconnect instead of replaying the entire stream history. The same `durable_name` must be reused on every reconnect.
  - **`deliverPolicy?: DeliverPolicy`** — controls where a new consumer starts reading. Omit when `durableName` is set to resume from the durable's stored state automatically.
  - **`ackPolicy?: AckPolicy`** — acknowledgment policy. Default `AckPolicy.Explicit` when omitted (applied by `resolveConsumerSubscribeOpts`).
  - **`maxDeliver?: number`** — maximum delivery attempts before redelivery stops.
  - **`replayPolicy?: ReplayPolicy`** — `ReplayPolicy.Instant` (default) or `ReplayPolicy.Original`.
- **`GatewayConsumerOptions` interface** (exported from `@cobranza-apps/events-toolkit`) — the shape of the gateway-level consumer configuration block, documented inline with NATS-flavored semantics and links to upstream consumer configuration docs.
- **`resolveSubscriptionConsumerOpts(gateway, perSubscription)` helper** (exported from `@cobranza-apps/events-toolkit`) — merges gateway-level options with per-subscription options. Precedence (highest first):
  1. Per-subscription `ConsumerOptsBuilder` → returned unchanged (full override).
  2. Per-subscription `Partial<ConsumerOpts>` → spread over gateway config.
  3. Gateway scalar fields (`durableName`, `deliverPolicy`, `ackPolicy`, `maxDeliver`, `replayPolicy`) → override matching `consumerOpts` config fields.
  4. Gateway `consumerOpts` (builder extracted via `getOpts()`, or plain `Partial<ConsumerOpts>`).
  5. Built-in defaults from `resolveConsumerSubscribeOpts` (`manualAck`, `ackExplicit`, unique `deliverTo(createInbox())`).
- **Durable consumer resume behavior** — when `durableName` is set without an explicit `deliverPolicy`, NATS resumes from the durable's last acknowledged server-side position on reconnect. This prevents the duplicate event replay previously caused by ephemeral push consumers being destroyed on disconnect and recreated with `DeliverPolicy.All` on reconnect.

### Changed

- **`JetStreamConsumerService.subscribe()` and `RequestReplyConsumerService.subscribe()`** now accept gateway-level `GatewayConsumerOptions` (injected via their deps interfaces) and resolve the final subscribe options through `resolveSubscriptionConsumerOpts` instead of `resolveConsumerSubscribeOpts` directly.

### Documentation

- New "Durable Consumers" section in `docs/nats-jetstream-configuration.md` — mechanism, problem/resolve diagrams, `forRoot()` config, full-control `consumerOpts` example, convenience scalars, per-subscription override, and scenario recommendation table.
- README quick-start section "Durable Consumers (Recommended for Production)" and consumer configuration table rows for the new fields.
- `docs/ai-agent-guidelines.md` durable-consumer callout under "Consuming Events" and Public API Quick Reference Consumer row referencing `durableName`.

### Notes

- **Backward compatible**: all new fields are optional. When `durableName` and `consumerOpts` are omitted, behavior is unchanged from v0.13.0 — ephemeral push consumers with `manualAck` + `ackExplicit` + unique `deliver_subject` defaults (fixed in v0.11.4).
- **Production recommendation**: always set `durableName` for production consumers to prevent history replay on restart. For service scaling, use unique durable names per instance.

### Tests

- `src/consumer/consumer-opts-merger.spec.ts` — merge precedence matrix (gateway-only, gateway + per-subscription plain, gateway + per-subscription builder full-override, scalars overriding `consumerOpts`, `maxDeliver`/`replayPolicy`, builder `getOpts()` extraction).
- `src/consumer/jetstream-consumer.service.gateway-opts.spec.ts` — `JetStreamConsumerService` threads gateway options into `subscribe()`.
- `src/consumer/request-reply-consumer.service.gateway-opts.spec.ts` — `RequestReplyConsumerService` threads gateway options into `subscribe()`.
```

- **Verification**: open `CHANGELOG.md`; confirm the new block sits between the preamble and `## [0.13.0]`, with a single blank line separating `## [0.14.0]` block end and `## [0.13.0]` heading (mirrors existing spacing between `## [0.13.0]` and `## [0.12.0]`).

### Step 2 — Verify Task 4.4 docs accuracy

For each file, re-read the relevant section and assert the field names/symbol references match the exported source. Report only; edit only if a mismatch is found (escalate to implementer per critical-workflow if edits are needed).

#### 2.1 `docs/nats-jetstream-configuration.md` — "Durable Consumers" (lines 244–367)

Assert:

- [ ] TOC (line 12) entry `- [Durable Consumers](#durable-consumers)` matches the heading `## Durable Consumers` (line 244).
- [ ] `forRoot()` snippet uses `durableName: 'payment-service-processor'` and imports from `@cobranza-apps/events-toolkit`.
- [ ] `consumerOpts` full-control snippet imports `consumerOpts, DeliverPolicy, AckPolicy` from `nats`.
- [ ] Convenience scalars snippet uses `durableName`, `deliverPolicy: DeliverPolicy.Last`, `ackPolicy: AckPolicy.Explicit`, `maxDeliver: 5` — all matching `GatewayConsumerOptions` field names.
- [ ] "Precedence" note states convenience scalars override matching `consumerOpts` fields — matches `resolveSubscriptionConsumerOpts` step ordering.
- [ ] Per-subscription override example shows `consumerOpts()` builder returned from `subscribe()` options, matching `JetStreamConsumerService.subscribe()` parameter shape.
- [ ] Recommendation table covers dev / production / one-shot / multi-instance scenarios.

#### 2.2 `README.md` — durable sections (lines 260–399)

Assert:

- [ ] Configuration Options table (line 272) consumer row lists EXACTLY: `enable`, `dlqSubjectBuilder`, `autoCreateStreams`, `streamConfig`, `durableName`, `consumerOpts`, `deliverPolicy`, `ackPolicy`, `maxDeliver`, `replayPolicy` — matches `EventsToolkitConsumerOptions` fields.
- [ ] "Durable Consumers (Recommended for Production)" section heading at line 378.
- [ ] Quick-start snippet (lines 382–391) uses `EventsToolkitModule.forRoot({...})` with `durableName: 'my-service-processor'`.
- [ ] Pointer link at line 393: `[Durable Consumers](docs/nats-jetstream-configuration.md#durable-consumers)` — resolves (file exists, anchor matches heading).

#### 2.3 `docs/ai-agent-guidelines.md`

Assert:

- [ ] Line 241 note under "Consuming Events": `> **Durable consumers:** Always set \`durableName\` ... See [Durable Consumers](nats-jetstream-configuration.md#durable-consumers) ...` — relative path correct (both files in `docs/`).
- [ ] Public API Quick Reference (line 508) "Consumer" row mentions `durableName` guidance inline and points users to set it for production consumers.

### Step 3 — Cross-link integrity sweep

Verify mutual references resolve. Use `grep` for the durable-consumer link string across `/docs` and README.

- **`README.md` → docs**: `docs/nats-jetstream-configuration.md#durable-consumers` (line 393) — anchor `#durable-consumers` must correspond to `## Durable Consumers` heading in the target file (confirmed at line 244).
- **`docs/ai-agent-guidelines.md` → docs**: `nats-jetstream-configuration.md#durable-consumers` (line 241) — same anchor; relative path within `docs/`.
- **`src/events-toolkit-options.interface.ts` JSDoc link**: line 57 `@see {@link docs/nats-jetstream-configuration.md#durable-consumers}` — informational only (TypeDoc `@link` to .md); verify the path string is well-formed relative to repo root (it is — also already shipped in Tasks 1–5 commits; do NOT edit source).
- **`docs/nats-jetstream-configuration.md` "See also" → README**: line 604 `[Deployment — JetStream Stream Configuration](../README.md#jetstream-stream-configuration)` — verify a `## JetStream Stream Configuration` (or matching anchor) heading exists in `README.md`. Action: open README and grep for `#jetstream-stream-configuration` candidate heading.
  - If the README anchor target does not exist, escalate (do NOT invent a heading) — record the broken link in the plan completion summary and request implementer/user resolution.
- **`docs/nats-jetstream-configuration.md` "See also" → docs**: lines 605–606 `event-messaging-convention.md`, `ai-agent-guidelines.md` — both files exist in `docs/`.

Sweep command (delegated to implementer, included here for reference):

```powershell
# From repo root
rg -n "nats-jetstream-configuration.md#durable-consumers" README.md docs
rg -n "README.md#jetstream-stream-configuration" docs
rg -n "#durable-consumers" docs README.md
```

### Step 4 — No further doc files required

- Confirm no separate "available configurations" doc file needs creation. The "Durable Consumers" section inside `docs/nats-jetstream-configuration.md` serves as the canonical reference per TODO Task 6 ("If not specific doc file related ... then generate a new one"). Condition satisfied — skip new file creation.
- Confirm `.agent/project-structure.md` `docs/` entry does not require a new subfolder (no new file added).

### Step 5 — Update `index.ts` exports note (verification only)

- Verify `src/consumer/index.ts` exports `GatewayConsumerOptions` (line 44) and `resolveSubscriptionConsumerOpts` (line 45). Already shipped — no source edits. CHANGELOG `### Added` references depend on these being public; confirmed true.

### Step 6 — Git commit (delegated to implementer in step 4.2)

- Stage only `CHANGELOG.md`.
- Verify `.gitignore` compliance: `git status` should show only `CHANGELOG.md` modified (plus the plan file in `.kilo/plans/` — also allowed per markdown-generation-rule).
- Commit message: `docs: add CHANGELOG v0.14.0 entry for durable JetStream consumer options`
- Do NOT amend prior commits. Do NOT push (git-remote-safety: only `origin`, and only at workflow step 5).

### Step 7 — Self-verification before signaling completion

- Open `CHANGELOG.md`; confirm order is `## [0.14.0] — 2026-07-22` → `## [0.13.0] — 2026-07-22` → `## [0.12.0]` ...
- Confirm all nine TODO Task 6 acceptance signals are satisfied:
  1. CHANGELOG v0.14.0 entry present ✅
  2. `consumerOpts` field documented ✅
  3. `durableName` field documented ✅
  4. `deliverPolicy` field documented ✅
  5. `ackPolicy` field documented ✅
  6. `maxDeliver` field documented ✅
  7. `replayPolicy` field documented ✅
  8. `GatewayConsumerOptions` interface documented ✅
  9. `resolveSubscriptionConsumerOpts` helper documented ✅
  10. Durable consumer resume behavior documented ✅
  11. Backward compatibility note present ✅
- Confirm `docs/nats-jetstream-configuration.md`, `README.md`, `docs/ai-agent-guidelines.md` updates verified (Step 2).
- Confirm cross-link integrity swept (Step 3).

## Files to Modify

| File | Change | Owner step |
|------|--------|-----------|
| `CHANGELOG.md` | Insert `## [0.14.0]` block | 4.2 implementer |

## Files to Verify (no changes expected; flag mismatches)

| File | Section | Owner step |
|------|---------|-----------|
| `docs/nats-jetstream-configuration.md` | "Durable Consumers" (lines 244–367), TOC, "See also" | 4.5 architector |
| `README.md` | Configuration Options table + durable section | 4.5 architector |
| `docs/ai-agent-guidelines.md` | durable callout + Public API row | 4.5 architector |
| `src/consumer/index.ts` | public exports (`GatewayConsumerOptions`, `resolveSubscriptionConsumerOpts`) | 4.5 architector |

## Out of Scope (explicitly)

- No source-code edits (`src/**`).
- No new doc file creation (existing "Durable Consumers" section covers it).
- No `.agent/project-info/*` updates (handled separately at workflow close / context upkeep).
- No tests, no build, no lint (docs-only).
- No push, no PR, no branch merge (workflow steps 5/6).

## Verifiers / Acceptance for This Plan Step (4.1)

- Plan file saved at `.kilo/plans/20260722-extend-durable-jetstream-consumers-task2.md`.
- Plan covers all three caller-mandated areas: CHANGELOG update, docs verification, cross-link check.
- Returned plan file path to caller for approval before 4.2.