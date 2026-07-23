# Plan — Idempotency Documentation & Examples (TODO #7 Task 3, Step 4.1)

- **TODO:** `.agent/todos/20260722/20260722-todo-2.md` → Task 7 (Documentation & Examples)
- **Scope:** Documentation only. NO source code changes.
- **Branch:** current feature branch (already created by Critical Workflow step 2).
- **Version target:** `0.15.0` (already bumped in `package.json`).
- **Status of feature:** Fully implemented (TODO tasks 1–6 marked `[DONE]`).

## Pre-Analysis

### Source truth (read by architector, do NOT re-derive)

- `IdempotencyService` (`src/idempotency/idempotency.service.ts`): `isDuplicate(event)`, `markAsProcessed(event, ttlSeconds?)`, `executeIfNotProcessed<T>({ event, handler, ttlSeconds? })`. Handler throws ⇒ event NOT marked (retryable).
- `buildIdempotencyKey(event)` (`src/idempotency/build-idempotency-key.util.ts`): composite key `${event.id}:${event.correlation_id}` (event.id + correlation_id).
- Backends: `'sqlite'` (`sqlitePath`, default `:memory:`), `'postgres'` (`postgres.entityManager: EntityManagerLike`), `'memory'` (tests only).
- `IdempotencyModule.forRoot` / `forRootAsync` (`src/idempotency/idempotency.module.ts`): standalone registration + exports `IdempotencyService` + `IDEMPOTENCY_REPOSITORY_TOKEN`.
- Toolkit integration (`src/events-toolkit-options.interface.ts`): `EventsToolkitIdempotencyOptions { enabled?, type, sqlitePath?, postgres?, serviceOptions?: { defaultTtlSeconds? } }`. `enabled` default `true`; omitted field = module not wired.
- `resolveCapabilities()` (`src/events-toolkit-module.imports.ts`): adds `'idempotency'` to manifest capabilities when enabled.
- Automatic usage (`src/consumer/decorators/on-event.decorator.ts` + `on-event.explorer.ts`): `@OnEvent('...', { ..., idempotent: true })` wraps handler via `IdempotencyService` when module registered; **no-op** when module absent (handler runs unwrapped, `idempotent` silently ignored).
- Testing (`src/testing/`): `MockIdempotencyService` (in-memory `Map`, mirrors real API + `processedKeys`, `count`, `clear()`); `EventsToolkitTestModule.forRoot({ idempotency: { enabled: false } })` disables mock (default enabled); mock aliased as `IdempotencyService`.
- `EntityManagerLike` contract shared with Outbox (`{ query(sql, params) }`), TypeORM-compatible.
- TTL: `defaultTtlSeconds` in `serviceOptions`; per-call override possible; omitted ⇒ keys never expire.

### Reference models (style/structure to follow)

- `docs/outbox-configuration.md` — primary structural template: Onboarding banner, TOC, "When to Use Each Backend" table, per-backend config blocks via `forRoot` + `EventsToolkitModule.forRoot`, options reference table, usage after config, cross-links.
- `docs/testing-utilities.md` — Mock Services section format (`### MockXxxService` subsections) to mirror for `MockIdempotencyService`.
- `CHANGELOG.md` v0.14.0 / v0.12.0 — category set: `Added`, `Changed`, `Documentation`, `Notes`, `Tests`. Idempotency entry uses `Added` + `Documentation` + `Notes`.

### Constraints / Rules to honor

- Docs files are exempt from the 200-line file rule (rule applies to `src/` only).
- TOC required when doc file > 100 lines (markdown-generation-rule + project-info instructions). New doc will exceed 100 lines ⇒ include TOC.
- Actual newline characters, no `\n` escapes (newline-prevention).
- Self-documenting content; minimal comments only where complex business logic is summarized.
- Only Plan Agent / Docs Specialist may create/modify doc/md files (markdown-generation-rule). Step 4.2 implementer will execute this plan; docs-specialist will own 4.4.

---

## High-Level Approach

Three documentation deliverables + cross-link sweep:

1. **New doc**: `docs/idempotency.md` — comprehensive guide modeled on `outbox-configuration.md`.
2. **README updates**: extend "What it provides", add onboarding step, add quick-reference section, add idempotency to configuration options table, add related-doc link.
3. **CHANGELOG**: add `## [0.15.0]` entry with all idempotency features.
4. **Cross-links**: wire the new doc into `outbox-configuration.md`, `testing-utilities.md`, and `docs/event-messaging-convention.md` / `ai-agent-guidelines.md` consumer idempotency rule.

All edits are to markdown files only. No `src/` changes. No git commits in this step (commits happen in step 4.2). Verification in 4.5 will check plan adherence.

---

## Plan — Detailed Steps

### STEP 1 — Create `docs/idempotency.md`

Create new file with the outline below. Each `###` is a section header (exact text shown). Body content drafted in step 4.2 by docs-specialist; here only structure + per-section content brief + key code snippets to embed.

**File header:**
```markdown
# Idempotency

> **Onboarding:** This document covers **step 8 (Idempotency)** of the [Onboarding Flow](../README.md#onboarding-flow).
> **See also:** [Outbox Configuration](outbox-configuration.md) · [Testing Utilities](testing-utilities.md) · [AI Agent Guidelines](ai-agent-guidelines.md)
```

**Table of Contents** (mandatory — file exceeds 100 lines):
```markdown
## Table of Contents

- [Overview](#overview)
- [Why Idempotency Matters](#why-idempotency-matters)
- [When to Use Each Backend](#when-to-use-each-backend)
- [Enabling / Disabling](#enabling--disabling)
- [SQLite Configuration](#sqlite-configuration)
- [PostgreSQL Configuration](#postgresql-configuration)
- [Memory Backend (Tests Only)](#memory-backend-tests-only)
- [IdempotencyServiceOptions Reference](#idempotencyserviceoptions-reference)
- [Manual Usage Patterns](#manual-usage-patterns)
- [Automatic Usage Patterns](#automatic-usage-patterns)
- [Key Generation Best Practices](#key-generation-best-practices)
- [TTL Configuration and Behavior](#ttl-configuration-and-behavior)
- [Interaction with the Outbox](#interaction-with-the-outbox)
- [Testing with MockIdempotencyService](#testing-with-mockidempotencyservice)
- [Migration / FAQ](#migration--faq)
```

**Section content briefs:**

**`## Overview`**
- One paragraph: toolkit dedup support mirroring Outbox module design (repository pattern, SQLite/PostgreSQL/memory). References `IdempotencyService` and `IdempotencyModule`. Note both tenant (`EventEnvelope`) and global (`GlobalEventEnvelope`) envelopes supported (key uses `event.id` + `correlation_id` present on both).

**`## Why Idempotency Matters`**
- At-least-once delivery (NATS JetStream redelivery, consumer restarts) ⇒ duplicate handlers risk double side effects (double charges, duplicate writes). Idempotency guard = check-then-execute-then-mark. Mention: complements but does NOT replace durable consumers; the two address different problems (resume position vs duplicate business execution).
- Embed comparison table:

| Concern | Durable Consumers | Idempotency |
|--------|-------------------|------------|
| What it prevents | Replay of entire stream history on restart | Re-execution of already-processed events |
| Layer | NATS consumer ack position | Application-level dedup key store |
| When needed | Always in production | When handlers have non-idempotent side effects |

**`## When to Use Each Backend`**
- Table mirroring outbox doc:

| Backend  | Use Case | Service Type |
|---------|----------|--------------|
| Postgres | `ms-db-gateway` + services with existing TypeORM | Shares main DB, no extra file |
| SQLite   | All other microservices | Lightweight file-based; needs Docker volume |
| Memory   | Tests only | Never in production |

- Postgres notes: shares `EntityManagerLike` contract with Outbox (`{ query(sql, params) }`); TypeORM-compatible.
- SQLite notes: persistent Docker volume required (same `volumes:` block as outbox ` - idempotency-data:/data`).

**`## Enabling / Disabling`**
- `enabled` defaults `true`. Omit the `idempotency` field entirely from `EventsToolkitModule.forRoot()` to skip wiring. Set `enabled: false` to keep config present but inactive. When disabled, `@OnEvent({ idempotent: true })` is a **no-op** (handler runs unwrapped).
- Capability `'idempotency'` added to service manifest `capabilities` array when enabled.

**`## SQLite Configuration`**
Two subsections (mirror outbox doc structure):

`### Via IdempotencyModule.forRoot`, `### Via EventsToolkitModule.forRoot (Recommended)` — code snippets:

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

@Module({
  imports: [
    EventsToolkitModule.forRoot({
      nats: { servers: ['nats://localhost:4222'] },
      idempotency: {
        type: 'sqlite',
        sqlitePath: '/data/idempotency.sqlite',
        serviceOptions: { defaultTtlSeconds: 86400 },
      },
    }),
  ],
})
export class AppModule {}
```

Plus Docker volume note (reuse `/data` volume with outbox or separate path).

**`## PostgreSQL Configuration`**
Same two-subsection structure. Snippet:

```typescript
EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  idempotency: {
    type: 'postgres',
    postgres: { entityManager: dataSource.manager },
    serviceOptions: { defaultTtlSeconds: 86400 },
  },
})
```

Plus `EntityManagerLike` contract block (reuse outbox doc wording, point to outbox doc for full definition to avoid duplication).

**`## Memory Backend (Tests Only)`**
- In-memory store, no persistence, lost on restart. Use for unit tests or via `EventsToolkitTestModule` (which registers `MockIdempotencyService`). Snippet:

```typescript
idempotency: { type: 'memory' }
```

**`## IdempotencyServiceOptions Reference`**
- Table:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultTtlSeconds` | `number` | omitted (never expires) | Default TTL applied when callers omit `ttlSeconds`. |
- Note per-call `markAsProcessed(event, ttlSeconds)` and `executeIfNotProcessed({ ..., ttlSeconds })` overrides.

**`## Manual Usage Patterns`**
- Recommended for full control. Three API methods with snippets:

`isDuplicate` + `markAsProcessed` (low-level):
```typescript
constructor(private readonly idempotency: IdempotencyService) {}

async handle(event: AnyEventEnvelope<PaymentData>): Promise<void> {
  if (await this.idempotency.isDuplicate(event)) return;
  await this.processPayment(event.data);
  await this.idempotency.markAsProcessed(event);
}
```

`executeIfNotProcessed` (high-level convenience — atomic check-execute-mark):
```typescript
const result = await this.idempotency.executeIfNotProcessed({
  event,
  handler: async () => this.processPayment(event.data),
  ttlSeconds: 3600,
});
// result === undefined when duplicate was skipped
```

- Failed-handler behavior callout: if `handler` throws, event is intentionally NOT marked → next delivery retries. Do not catch-and-swallow inside `executeIfNotProcessed` if retry is desired.

**`## Automatic Usage Patterns`**
- `@OnEvent` with `idempotent: true`. Explorer wraps handler with `IdempotencyService` automatically at startup. Snippet:

```typescript
@OnEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Handles payment proof uploads',
  payloadExample: { paymentAttemptId: 'uuid', amount: 100 },
  idempotent: true,
})
async onProofUploaded(event: AnyEventEnvelope<PaymentProofUploadedData>): Promise<void> {
  await this.processProof(event.data) // skipped on redelivery automatically
}
```

- No-op when module not registered. Manual vs automatic guidance table:

| Pattern | When to use |
|---------|------------|
| Manual (`IdempotencyService` direct) | Conditional dedup, custom key, multi-step transactions, per-branch TTL |
| Automatic (`idempotent: true`) | Simple fire-and-forget handlers with default key + TTL |

**`## Key Generation Best Practices`**
- Key = `${event.id}:${event.correlation_id}` via `buildIdempotencyKey()` (exported for custom use).
- Why composite: `event.id` (UUIDv7) uniquely identifies the event; `correlation_id` scopes to the originating request/flow so a retry-correlated re-emit of the same logical event with a new id is NOT collapsed.
- Rules: use `generateUuidV7()` / `generateEventId()` for IDs; propagate `correlationId` end-to-end (see ai-agent-guidelines). Do NOT build keys from mutable fields.
- For custom keys, call `IDEMPOTENCY_REPOSITORY_TOKEN.isProcessed(key)` / `markAsProcessed(key, ttl)` directly (bypass service) — advanced use.

**`## TTL Configuration and Behavior`**
- TTL optional. Omitted `defaultTtlSeconds` + omitted per-call ⇒ **never expires** (safe default). Set TTL when downstream may legitimately reprocess after N time (e.g. replay windows). Expired keys are lazy-filtered on read; call `repository.clearExpired()` for periodic housekeeping (optional maintenance, not auto-scheduled).
- Snippet mixing both:

```typescript
serviceOptions: { defaultTtlSeconds: 86400 }   // 1 day default
// Per-call override:
await this.idempotency.markAsProcessed(event, 3600); // 1 hour for this event
```

**`## Interaction with the Outbox`**
- Orthogonal: Outbox = transactional publish safety; Idempotency = consumer-side dedup. Both recommended for non-idempotent side effects. Can coexist (different tables/semantics). Pointer to outbox-configuration.md.

**`## Testing with MockIdempotencyService`**
- Import from `@cobranza-apps/events-toolkit/testing`. Registered by `EventsToolkitTestModule.forRoot()` by default; aliased as `IdempotencyService`. Snippet:

```typescript
import { EventsToolkitTestModule, MockIdempotencyService } from '@cobranza-apps/events-toolkit/testing';

const module = await Test.createTestingModule({
  imports: [EventsToolkitTestModule.forRoot()],
  providers: [PaymentConsumer],
}).compile();

const idempotency = module.get(MockIdempotencyService);
await idempotency.markAsProcessed(event);
expect(idempotency.processedKeys).toContain(expectedKey);
// First call executes handler, second is skipped
idempotency.clear(); // reset between tests
```

- Disable mocks: `forRoot({ idempotency: { enabled: false } })`. Cross-link to testing-utilities.md.

**`## Migration / FAQ`**
- New feature, no migration. FAQ: "Does it work with `GlobalEventEnvelope`?" → yes (key uses fields on the shared `BaseEventEnvelope`). "Does `idempotent: true` error if module not registered?" → no, silently no-op.

> **Note for step 4.2:** Keep file under ~350 lines; split examples into `docs/examples/idempotency.example.ts` ONLY if snippets push the file over a comfortable size — preferred single-file per docs-in-one-place convention (outbox-configuration.md is 334 lines as precedent). If splitting, create `docs/examples/idempotency.manual.example.ts` + `idempotency.automatic.example.ts` and link from the manual/automatic sections. Default: inline snippets, no example files.

---

### STEP 2 — Update `README.md`

**2a. Table of Contents** (line 10–23): no new top-level section required; idempotency lives under existing "Usage". Skip TOC edit (the onboarding flow step added below is reachable from "Onboarding Flow" anchor already present).

**2b. Onboarding Flow** (lines 44–57): insert a new step between current step 7 (Outbox) and step 8 (Service discovery). Renumber subsequent steps (8→9, 9→10, 10→11, 11→12). The updated onboarding becomes 12 steps.

Insert after line 52 (Outbox step):
```markdown
7. **Idempotency** — `IdempotencyService` · `@OnEvent({ idempotent: true })` · SQLite/PostgreSQL backends → [Idempotency](#idempotency-pattern)
```
Update the intro line "full 11-step path" → "full 12-step path" (line 42). Also update the AGENTS.md / contexts that reference "11-step" if any (check `.agent/project-info/CONTEXT.md` repeats "Onboarding Flow (11-step)" — include that as a cross-link fix in STEP 4).

**2c. "What it provides"** (lines 66–73): add bullet after the Outbox bullet (line 71):
```markdown
- **Idempotency Module**: Deduplication guard with SQLite, PostgreSQL, or in-memory backends; `IdempotencyService` (`isDuplicate`, `markAsProcessed`, `executeIfNotProcessed`) and automatic `@OnEvent({ idempotent: true })` handler wrapping
```

**2d. Usage section** (after Outbox Pattern section, ~line 733): add new `### Idempotency Pattern` subsection:
```markdown
### Idempotency Pattern

For consumer-side deduplication, the Idempotency module records processed event keys so redelivery is skipped. It supports the same backends as the Outbox module (SQLite, PostgreSQL, memory for tests) and is configured via `EventsToolkitModule.forRoot()`.

For detailed configuration, key generation, and manual vs automatic usage, see [`docs/idempotency.md`](docs/idempotency.md).

```typescript
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';

EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  idempotency: {
    type: 'sqlite',
    sqlitePath: '/data/idempotency.sqlite',
    serviceOptions: { defaultTtlSeconds: 86400 },
  },
})
```

**Manual usage:**
```typescript
constructor(private readonly idempotency: IdempotencyService) {}

async handle(event: AnyEventEnvelope<MyData>): Promise<void> {
  if (await this.idempotency.isDuplicate(event)) return;
  await this.process(event.data);
  await this.idempotency.markAsProcessed(event);
}
```

**Automatic usage (recommended for simple handlers):**
```typescript
@OnEvent('payment.proof.uploaded', {
  version: '1',
  description: 'Handles payment proof uploads',
  payloadExample: { paymentAttemptId: 'uuid', amount: 100 },
  idempotent: true,
})
async onProofUploaded(event: AnyEventEnvelope<PaymentProofUploadedData>): Promise<void> {
  await this.process(event.data);
}
```
```

**2e. Configuration Options table** (lines 267–277): add row after the `outbox` row:
```markdown
| `idempotency` | `EventsToolkitIdempotencyOptions` | No | Idempotency config (`sqlite`, `postgres`, or `memory`). Omit to disable the idempotency subsystem. |
```

**2f. Deployment Environment Variables table** (lines 930–936): add row:
```markdown
| `IDEMPOTENCY_DB_PATH` | SQLite file path (SQLite idempotency only) | `/data/idempotency.sqlite` |
```
And in Health Checks SQLite persistence bullet (line 942) add: "When using the SQLite idempotency backend, mount the same persistent volume (or path under it) — see [Idempotency](docs/idempotency.md)."

**2g. Related Documentation** (lines 947–963): add bullet after the Outbox bullets (after line 953):
```markdown
- [Idempotency](docs/idempotency.md) — SQLite/PostgreSQL/memory backends, manual vs automatic usage, key generation, TTL, and MockIdempotencyService testing
```

**2h. Guidelines for AI Agents** (lines 833–848): expand rule 6 (line 842) — currently "Consumers must be idempotent — use `id` + `correlation_id` for deduplication." Add pointer to the new doc:
```markdown
6. **Idempotency**: Consumers must be idempotent — use `id` + `correlation_id` for deduplication via `IdempotencyService` or `@OnEvent({ idempotent: true })`. See [Idempotency](docs/idempotency.md).
```

---

### STEP 3 — Update `CHANGELOG.md`

Insert new entry at the **top** (after line 6, before `## [0.14.0]`). Date `2026-07-23` (matches plan creation date / feature completion).

**Exact draft text to insert:**
```markdown
## [0.15.0] — 2026-07-23

### Added

- **Idempotency module** (`IdempotencyModule`) — consumer-side deduplication guard mirroring the Outbox module's repository pattern. Registers a global `IdempotencyRepository` provider backed by **SQLite**, **PostgreSQL**, or **in-memory** (tests only), plus an `IdempotencyService` with low-level and high-level APIs:
  - **`IdempotencyService.isDuplicate(event)`** — returns `true` when the event key exists and has not expired.
  - **`IdempotencyService.markAsProcessed(event, ttlSeconds?)`** — records the event as processed; repeated calls with the same key are idempotent (no throw/overwrite).
  - **`IdempotencyService.executeIfNotProcessed<T>({ event, handler, ttlSeconds? })`** — atomic check-execute-mark convenience wrapper. If the handler throws, the event is intentionally **not** marked as processed, allowing redelivery retries.
  - **`buildIdempotencyKey(event)`** — exported utility building the composite key `${event.id}:${event.correlation_id}` (works on both `EventEnvelope` and `GlobalEventEnvelope`).
- **Three repository implementations** — `SqliteIdempotencyRepository` (`INSERT OR IGNORE`, WAL journaling), `PostgresIdempotencyRepository` (`ON CONFLICT (key) DO NOTHING`, reuses the `EntityManagerLike` contract shared with the Outbox), and `MemoryIdempotencyRepository` (in-memory `Map`, tests only).
- **`IdempotencyRepository` interface** — `isProcessed(key)`, `markAsProcessed(key, ttlSeconds?)`, `clearExpired()`; `IdempotencyModuleOptions` / `IdempotencyModuleAsyncOptions` for sync/async registration. `IdempotencyModule.forRoot` and `forRootAsync` exported for standalone use.
- **Toolkit-level configuration** — `EventsToolkitIdempotencyOptions` on `EventsToolkitModule.forRoot()` / `forRootAsync`: `{ enabled? (default true), type: 'sqlite'|'postgres'|'memory', sqlitePath?, postgres?: { entityManager }, serviceOptions?: { defaultTtlSeconds? } }`. Omitting `idempotency` skips wiring; `enabled: false` keeps config present but inactive.
- **Automatic handler wrapping** — `@OnEvent('...', { ..., idempotent: true })` option. When `IdempotencyModule` is registered, `OnEventExplorer` wraps the handler with the dedup guard at startup (skip duplicate → execute → mark). When the module is **not** registered, the `idempotent` flag is a **silent no-op** (handler runs unwrapped). When a wrapped handler throws, the event is not marked (retried on redelivery).
- **Discovery capability** — `'idempotency'` is added to the `capabilities` array of the service manifest (`ServiceManifestDto.capabilities`) when the module is enabled, via `resolveCapabilities()`.
- **TTL support** — `IdempotencyServiceOptions.defaultTtlSeconds` applies a default TTL; per-call `ttlSeconds` override on `markAsProcessed` / `executeIfNotProcessed`. Omitted TTL means keys never expire. `IdempotencyRepository.clearExpired()` available for periodic maintenance.
- **Testing support** — `MockIdempotencyService` (in-memory `Map` mirroring the real API plus `processedKeys`, `count`, `clear()`) exported from `@cobranza-apps/events-toolkit/testing`. `EventsToolkitTestModule.forRoot()` registers and aliases it as `IdempotencyService` by default; disable with `forRoot({ idempotency: { enabled: false } })`.

### Documentation

- New guide: `docs/idempotency.md` — backend selection, configuration via `EventsToolkitModule.forRoot()` / `IdempotencyModule.forRoot`, manual vs automatic usage patterns, key generation best practices, TTL behavior, interaction with the Outbox, and `MockIdempotencyService` testing. Cross-linked from README, outbox-configuration, ai-agent-guidelines, and testing-utilities docs.
- README updated: new "Idempotency Pattern" usage section, onboarding flow step added (now 12 steps), "What it provides" bullet, configuration-options row, environment-variable row (`IDEMPOTENCY_DB_PATH`), related-documentation link, and AI-agent rule #6 enhanced with a doc pointer.
- `docs/testing-utilities.md` updated with a `MockIdempotencyService` subsection and `idempotency` test-option documentation.
- `docs/ai-agent-guidelines.md` consumer idempotency guidance links to the new doc.

### Notes

- **Backward compatible**: idempotency is opt-in. Omitting the `idempotency` field changes no behavior from v0.14.0; the `idempotent` decorator flag without the module is a no-op.
- **Memory backend is for tests only** — never use `'memory'` in production; state is lost on restart.
- **Complementary to durable consumers** — durable consumers prevent stream-history replay on restart; idempotency prevents re-execution of already-processed events. Both are recommended for production handlers with non-idempotent side effects.

### Tests

- `src/idempotency/idempotency.service.spec.ts` — service dedup/mark/executeIfNotProcessed behavior and TTL resolution.
- `src/idempotency/idempotency.module.spec.ts` — sync/async module wiring and repository resolution per backend.
- `src/idempotency/build-idempotency-key.util.spec.ts` — composite key `${id}:${correlation_id}`.
- `src/idempotency/sqlite-idempotency.repository.spec.ts` / `postgres-idempotency.repository.spec.ts` / `memory-idempotency.repository.spec.ts` — repository contracts.
- `src/consumer/decorators/on-event.explorer.idempotent.spec.ts` — automatic wrapping (wrap when service present + flag true, no-op when service absent, no-op when flag absent, retry-on-throw behavior).
- `src/testing/mock-idempotency.service.spec.ts` and `src/testing/events-toolkit-test.module.spec.ts` — mock API and test-module registration/aliasing.
- `src/events-toolkit.module.spec.ts` and `src/events-toolkit.capabilities.spec.ts` — toolkit wiring and capability resolution.
```

---

### STEP 4 — Cross-Links to Add (related docs)

**4a. `docs/outbox-configuration.md`:**
- In the Overview (lines 8–11) or a new line after the usage identical paragraph, append: "For consumer-side deduplication see [Idempotency](idempotency.md)." Add as a trailing sentence in the Overview paragraph OR as a `> **See also:**` line near the top (match the testing-utilities banner style).
- In the "Transactional Outbox" section (around line 197), add one-line callout: "Idempotency (consumer-side dedup) is complementary — it prevents re-execution of events that were already processed even if the outbox successfully republishes them. See [Idempotency](idempotency.md)."

**4b. `docs/testing-utilities.md`:**
- TOC (lines 16–22): add `- [MockIdempotencyService](#mockidempotencyservice)` entry in the "Mock Services" group (after the implicit MockOutboxService entry — check actual TOC order and mirror it). Also add a `- [Idempotency Test Options](#idempotency-test-options)` entry if a configuration-options subsection is added near the top.
- Mock Services section (after `### MockOutboxService`, line 123): add new `### MockIdempotencyService` subsection with API table (`isDuplicate`, `markAsProcessed`, `executeIfNotProcessed`, `processedKeys`, `count`, `clear`) and the snippet already drafted in the new doc's testing section (single source — testing-utilities.md holds the canonical mock reference; idempotency.md links to it). Add note: registered by default by `EventsToolkitTestModule`, aliased as `IdempotencyService`; disable via `forRoot({ idempotency: { enabled: false } })`.
- Wherever mock service imports are listed (lines 295–315 example block), add `MockIdempotencyService` to the import + `module.get(MockIdempotencyService)` access pattern if a comprehensive example exists.

**4c. `docs/ai-agent-guidelines.md`:**
- Locate the consumer idempotency rule (rule #6 equivalent in this doc) and add a `[Idempotency guide](idempotency.md)` link. (Confirm exact heading/line during step 4.2 via grep `idempoten` in that file.)

**4d. `docs/event-messaging-convention.md`:**
- If the convention doc has a consumer idempotency section, add cross-link to `idempotency.md`. Check during step 4.2; add only if a natural anchor exists (do not force a new section into the convention spec).

**4e. `.agent/project-info/CONTEXT.md`:**
- Update "Onboarding Flow (11-step)" mention (if present) → "12-step" to match the README change. Add a "Recent Changes" entry dated 2026-07-23 for "Idempotency documentation (v0.15.0)". This is a context upkeep step per project-info instructions.md "Critical Closing Step".

**4f. `.agent/project-structure.md`:**
- No change needed — `idempotency/` folder already documented (line 17). Verify the comment still accurate (it is). Skip.

---

## Verification Checklist (for step 4.5)

- [ ] `docs/idempotency.md` exists and contains TOC (file > 100 lines).
- [ ] All three backend config snippets (`sqlite`, `postgres`, `memory`) present with `EventsToolkitModule.forRoot` examples.
- [ ] Manual (`isDuplicate`/`markAsProcessed`/`executeIfNotProcessed`) and automatic (`idempotent: true`) snippets present.
- [ ] Key generation best-practice section documents `${event.id}:${event.correlation_id}`.
- [ ] TTL section documents `defaultTtlSeconds` + per-call override + "never expires" default.
- [ ] `MockIdempotencyService` testing section present + link to testing-utilities.md.
- [ ] README "What it provides" bullet added; onboarding flow is 12 steps; "Idempotency Pattern" Usage section added; config-options row + env var row + related-doc link + rule #6 pointer added.
- [ ] CHANGELOG has `## [0.15.0] — 2026-07-23` with Added / Documentation / Notes / Tests categories.
- [ ] Cross-links added in outbox-configuration.md, testing-utilities.md, ai-agent-guidelines.md.
- [ ] No `src/` files modified (docs-only task).
- [ ] Actual newlines used; no `\n` literals in written files.

---

## Out of Scope (do NOT do in step 4.2)

- Writing the full prose body of `docs/idempotency.md` beyond the section briefs above is the docs-specialist's job in step 4.4 enhancement — but step 4.2 (implementer) MUST produce complete, publishable content for all deliverables (docs-specialist only adds JSDoc-style polish and cross-checks in 4.4). Implementer follows this plan's snippets verbatim and fills briefs with prose matching the outbox-configuration.md tone.
- No code changes, no exports changes, no `package.json` version bump (already at 0.15.0).
- No git commits in this 4.1 planning step.