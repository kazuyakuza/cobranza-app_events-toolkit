# Plan: Task 6 — Documentation & DX Updates

## Pre-Analysis

### Current State
- `README.md` (489 lines): Comprehensive but missing Postgres outbox config, no `EventsToolkitModule` setup example, no links to new docs.
- `docs/event-messaging-convention.md`: Complete, authoritative, no changes needed.
- `docs/outbox-configuration.md`: Does not exist.
- `docs/ai-agent-guidelines.md`: Does not exist.

### Codebase API (verified)
- `OutboxModule.forRoot({ type, sqlite, postgres, serviceOptions })` — single entry point
- `OutboxService.saveToOutbox(event, subject)` — unified interface for both backends
- `EventsToolkitModule.forRoot({ nats, outbox, logging, consumer })` — unified root module
- `EventsToolkitOutboxOptions.type`: `'sqlite' | 'postgres'`
- Postgres uses `EntityManagerLike` (TypeORM-compatible query executor)
- SQLite uses `better-sqlite3` with file path, creates table on construction, WAL mode

### Key Observations
- README shows old API: `OutboxModule.register(...)` — must update to `forRoot(...)` or `EventsToolkitModule.forRoot(...)`
- README shows `SqliteOutboxService` but actual class is `OutboxService` (single class handles both backends)
- No Postgres example exists anywhere in README
- No unified module registration example exists (only individual module imports)
- AI Agent Guidelines are only 10 bullet points — should link to dedicated guide

---

## Step 1: Create `docs/outbox-configuration.md`

**File path**: `docs/outbox-configuration.md`

### Content Outline

```markdown
# Outbox Configuration

## Overview
- Explanation of the Outbox pattern in events-toolkit
- Two backends: SQLite and Postgres
- Unified OutboxService interface

## When to Use Each Backend

| Backend   | Use Case                        | Service Type            |
|-----------|---------------------------------|-------------------------|
| Postgres  | ms-db-gateway                   | Services with existing PostgreSQL + TypeORM |
| SQLite    | All other microservices         | Services without their own database |

- Postgres shares the main application database (no extra file to manage)
- SQLite uses a lightweight file-based DB (self-contained, needs Docker volume)

## SQLite Configuration

### Via OutboxModule.forRoot
```ts
OutboxModule.forRoot({
  type: 'sqlite',
  sqlite: { dbPath: '/data/outbox.sqlite' },
  serviceOptions: {
    processorIntervalMs: 5000,
    maxRetries: 3,
    retryBackoffBaseMs: 1000,
  },
})
```

### Via EventsToolkitModule.forRoot (Recommended)
```ts
EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  outbox: {
    type: 'sqlite',
    sqlitePath: '/data/outbox.sqlite',
    serviceOptions: { maxRetries: 3 },
  },
})
```

### Docker Volume (Required for SQLite)
```yaml
volumes:
  - outbox-data:/data
```
Without a persistent volume, the SQLite file is lost on container restart.

## PostgreSQL Configuration

### Via OutboxModule.forRoot
```ts
OutboxModule.forRoot({
  type: 'postgres',
  postgres: { entityManager: myTypeOrmEntityManager },
  serviceOptions: { maxRetries: 3 },
})
```

### Via EventsToolkitModule.forRoot (Recommended)
```ts
EventsToolkitModule.forRoot({
  nats: { servers: ['nats://localhost:4222'] },
  outbox: {
    type: 'postgres',
    postgres: { entityManager: myTypeOrmEntityManager },
    serviceOptions: { maxRetries: 3 },
  },
})
```

### EntityManagerLike Contract
```ts
interface EntityManagerLike {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}
```
Must implement parameterized query execution (TypeORM EntityManager satisfies this).

## OutboxServiceOptions Reference

| Option               | Type                          | Default                           | Description                          |
|----------------------|-------------------------------|-----------------------------------|--------------------------------------|
| enabled              | boolean                       | true                              | Enable/disable background processor  |
| processorIntervalMs  | number                        | 5000                              | Poll interval in milliseconds        |
| maxRetries           | number                        | 3                                 | Max retries before DLQ routing       |
| retryBackoffBaseMs   | number                        | 1000                              | Base backoff delay (exponential)     |
| dlqSubjectBuilder    | (subject: string) => string   | prepends `dlq.`                   | Custom DLQ subject builder           |

## Background Processor Behavior
1. Polls pending entries at configured interval
2. Publishes each entry via ProducerService
3. On success: marks entry as sent
4. On failure: increments attempt counter, applies exponential backoff
5. After maxRetries exceeded: routes to DLQ subject, marks as sent (to prevent re-processing)

## DLQ Routing
Default DLQ subject: `dlq.{original_subject}`
DLQ payload includes original envelope + `last_error`, `attempts`, `failed_at`.

## Usage After Configuration
```ts
constructor(private readonly outboxService: OutboxService) {}

async handle(event: MyEvent, context: EventContext): Promise<void> {
  const subject = this.subjectBuilder.build({ companyId, domain, entity, action, version: '1' });
  await this.outboxService.saveToOutbox(event, subject);
}
```

## Migration from 0.x API
- `SqliteOutboxService` → `OutboxService` (unified)
- `OutboxModule.register(...)` → `OutboxModule.forRoot({ type: 'sqlite' | 'postgres', ... })`
- Config: `dbPath` → `sqlite: { dbPath }` or `postgres: { entityManager }`
```

---

## Step 2: Create `docs/ai-agent-guidelines.md`

**File path**: `docs/ai-agent-guidelines.md`

### Content Outline

```markdown
# Guidelines for AI Agents & Developers

## Overview
This guide provides step-by-step instructions for creating and consuming events using events-toolkit, targeting both human developers and AI agents generating code.

## Quick Reference: Convention Rules
- Subject format: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
- Event IDs: UUIDv7 with `evt_` prefix via `generateEventId()`
- Actions: past tense (`created`, `uploaded`, `processed`)
- Version: major only (`v1`, `v2`)
- Payloads: IDs over full objects; keep under 256KB
- Consumers: MUST be idempotent

## Step-by-Step: Creating a New Event Class

1. Define the data class with `class-validator` decorators
2. Extend `EventEnvelope<T>` with your data type
3. Set readonly `type` and `version`
4. Example template available in README

Full code template (copy-paste ready) with placeholders.

## Step-by-Step: Naming New Events
Decision tree:
- Choose domain (payment, debt, bank, notification, client, company)
- Choose entity (proof, statement, schedule, attempt)
- Choose action in past tense
- Check existing events in same domain for consistency
- Register the subject pattern in your microservice

## Step-by-Step: Publishing Events
Two options shown:
1. @EmitEvent() decorator
2. ProducerService.publish() direct injection

Include builder pattern for subjects.

## Step-by-Step: Consuming Events
@OnEvent() decorator with handler signature.

## Step-by-Step: Using the Outbox
saveToOutbox() with configuration setup.

## Validation Checklist
- [ ] data class has @IsUUID, @IsString, @IsNumber, etc.
- [ ] event class extends EventEnvelope<T>
- [ ] type follows convention pattern
- [ ] version is a string like '1.0.0'
- [ ] company_id always provided in context
- [ ] actor_type and actor_id always provided

## Common Mistakes
1. Manual subject concatenation instead of SubjectBuilder
2. Using present-tense verbs for actions
3. Forgetting actor context
4. Non-idempotent consumers
5. Storing full objects instead of IDs in payloads
6. Missing @IsUUID on paymentAttemptId-style fields
7. Events > 256KB

## Reference: All Public API Symbols
(Table of key exports from index.ts grouped by concern)
```

---

## Step 3: Update `README.md`

**File path**: `README.md`

### Changes Required

#### 3.1 Fix Outbox section (lines 347-373)

**Current code uses old API** (`SqliteOutboxService`, `OutboxModule.register`).

**Replace with actual API**: `OutboxService`, `OutboxModule.forRoot` with both SQLite and Postgres examples, plus "When to use which" note.

#### 3.2 Add `EventsToolkitModule` to Setup section (after line 176)

Add a second setup example showing the unified module `EventsToolkitModule.forRoot()` with all sub-modules configured at once. The existing individual module setup block receives a subtitle `### Setup (Individual Modules)`.

#### 3.3 Enhance "Guidelines for AI Agents" section (line 431)

Add at end of the section before `---`:
```markdown
For step-by-step instructions on creating events, naming subjects, and common pitfalls, see [`docs/ai-agent-guidelines.md`](docs/ai-agent-guidelines.md).
```

#### 3.4 Update Related Documentation section (line 478)

Add two new entries:
```markdown
- [Outbox Configuration](docs/outbox-configuration.md) — SQLite vs Postgres setup, service options, and migration guide
- [AI Agent Guidelines](docs/ai-agent-guidelines.md) — Step-by-step event creation, naming, and common mistakes
```

---

## Step 4: Verification Checklist

- [ ] All file paths match actual project structure
- [ ] All code examples use actual API from `src/index.ts`
- [ ] No references to removed/deleted classes (SqliteOutboxService)
- [ ] README markdown formatting valid (no broken links)
- [ ] New docs files accessible from README
- [ ] Plan covers all requirements from TODO

## Requirements Coverage

| Requirement | Covered In |
|-------------|------------|
| Installation instructions | Already in README (no change) |
| Full setup example (module registration) | Step 3.2 — EventsToolkitModule example added |
| Producer + Consumer examples | Already in README (no change) |
| Outbox usage | Step 3.1 — Updated with correct API + both backends |
| Request-Reply example | Already in README (no change) |
| Guidelines for AI Agents / Developers | Step 2 — new dedicated doc; Step 3.3 — cross-link from README |
| Clear examples for SQLite and Postgres outbox | Step 1 — new outbox-configuration.md |
| Section explaining when to use each outbox type | Step 1 — decision table in outbox-configuration.md; Step 3.1 — inline note |
| Create documentation in /docs and refer from README | Step 2 — new ai-agent-guidelines.md; Step 3.4 — links added |
