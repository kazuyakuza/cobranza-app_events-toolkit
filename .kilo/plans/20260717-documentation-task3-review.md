# Task 3 Documentation Review — Findings & Fix Plan

**Reviewer:** Code Reviewer (Task 3 only)  
**TODO:** `.agent/todos/20260716/20260716-todo-2.md` — Task 3  
**Implementation plan:** `.kilo/plans/20260717-documentation-task3.md`  
**Branch:** `feat/relax-envelope-validation-and-global-events`  
**Date:** 2026-07-17

---

## Summary

Documentation is largely complete and matches the implementation plan. All required files were created or updated, cross-links are present, CHANGELOG v0.12.0 covers Tasks 1–3, and the new `docs/global-events.md` decision guide follows the specified structure.

Three factual/accuracy issues were found that should be fixed before finalizing:

1. `docs/global-events.md` code example references an uninjected `producerService`.
2. `docs/global-events.md` subject-format inconsistency between paragraph and table.
3. `README.md` "Guidelines for AI Agents" rule still states `actor_id` is always required.

---

## Issue 1 — `docs/global-events.md`: `producerService` not injected

**File:** `docs/global-events.md`  
**Line:** 128  
**Severity:** Medium (code example would not compile)

### Current

```typescript
class IamService {
  constructor(private readonly subjectBuilder: SubjectBuilder) {}

  async createCompany(name: string): Promise<void> {
    const subject = this.subjectBuilder.buildGlobal({
      domain: 'iam', entity: 'company', action: 'created', version: '1',
    });
    const context: GlobalEventContext = {
      type: 'iam.company.created',
      version: '1.0.0',
      producer: 'iam-service',
      actorType: ActorType.SYSTEM,
      correlationId: '987fcdeb-51a2-43e8-9c4f-123456789abc',
    };
    const event = createGlobalEvent({ name }, context);
    await this.producerService.publish(subject, event);
  }
}
```

### Problem

`this.producerService` is used but `ProducerService` is not injected in the constructor.

### Proposed fix

Inject `ProducerService` into the constructor:

```typescript
class IamService {
  constructor(
    private readonly subjectBuilder: SubjectBuilder,
    private readonly producerService: ProducerService,
  ) {}
```

Also add `ProducerService` to the import statement on line 110.

---

## Issue 2 — `docs/global-events.md`: subject format token inconsistency

**File:** `docs/global-events.md`  
**Line:** 26  
**Severity:** Low

### Current

Paragraph in TL;DR:

```markdown
Use `EventEnvelope` (tenant) for operations scoped to a single `company_id` — subject format `company.{id}.{domain}.{entity}.{action}.v{version}`.
```

Mini table two lines below:

```markdown
| Tenant | `EventEnvelope` | Required (UUID v4) | `company.{company_id}.{domain}.{entity}.{action}.v{version}` |
```

### Problem

Paragraph uses `{id}` while the table uses `{company_id}`. All other docs use `{company_id}`. Inconsistent token naming may confuse readers.

### Proposed fix

Change paragraph to use `{company_id}`:

```markdown
Use `EventEnvelope` (tenant) for operations scoped to a single `company_id` — subject format `company.{company_id}.{domain}.{entity}.{action}.v{version}`.
```

---

## Issue 3 — `README.md`: AI Agent rule 4 still says `actor_id` is always required

**File:** `README.md`  
**Line:** 821  
**Severity:** Medium (contradicts v0.12.0 behavior)

### Current

```markdown
4. **Actor context**: Always populate `actor_type` and `actor_id` in the event context.
```

### Problem

As of v0.12.0, `actor_id` is optional for `system`, `scheduler`, and `external_api` actor types. The rule is now inaccurate and contradicts the conditional requirement documented in `docs/ai-agent-guidelines.md`, `docs/event-messaging-convention.md`, and the note on `README.md` line 212.

### Proposed fix

Update rule 4 to match the conditional requirement:

```markdown
4. **Actor context**: Always populate `actor_type`. Provide `actor_id` for `client` and `company_user`; it is optional for `system`, `scheduler`, and `external_api` actor types.
```

---

## Cross-Reference & Link Verification

All internal links were verified and resolve correctly:

| Source file | Link | Target anchor | Status |
|-------------|------|---------------|--------|
| `docs/global-events.md` | `ai-agent-guidelines.md#step-by-step-creating-a-new-event-class` | exists | OK |
| `docs/global-events.md` | `event-messaging-convention.md#global-subject-format` | exists | OK |
| `docs/global-events.md` | `event-messaging-convention.md#22-platform-event-subjects` | exists | OK |
| `docs/global-events.md` | `outbox-usage-guidelines.md` | file exists | OK |
| `docs/global-events.md` | `request-reply-patterns.md` | file exists | OK |
| `docs/event-messaging-convention.md` | `global-events.md` | file exists | OK |
| `docs/ai-agent-guidelines.md` | `global-events.md` | file exists | OK |
| `docs/request-reply-patterns.md` | `global-events.md#global-events-and-request-reply` | anchor exists | OK |
| `docs/outbox-usage-guidelines.md` | `global-events.md#global-events-and-the-outbox` | anchor exists | OK |
| `README.md` | `docs/global-events.md` | file exists | OK |
| `.agent/project-info/architecture.md` | `../../docs/global-events.md` | file exists | OK |
| `.agent/project-info/brief.md` | `../../docs/global-events.md` | file exists | OK |

---

## CHANGELOG Completeness Check

| Task | Change | CHANGELOG v0.12.0 coverage | Status |
|------|--------|---------------------------|--------|
| Task 1 | `actor_id` optional for `system`/`scheduler`/`external_api` | `Changed` bullet | OK |
| Task 1 | `@IsOptionalForSystemActors()` validator | `Added` bullet | OK |
| Task 2 | `GlobalEventEnvelope`, `GlobalEventContext`, `GlobalEventBase` | `Added` bullets | OK |
| Task 2 | Global subjects (`buildGlobalSubject`, `BuildGlobalSubjectDto`, etc.) | `Added` bullet | OK |
| Task 2 | `ProducerService.emitGlobal()` | `Added` bullet | OK |
| Task 2 | `createGlobalEvent()` | `Added` bullet | OK |
| Task 2 | `AnyEventEnvelope`, `AnyEventContext`, type guards | `Added` bullet | OK |
| Task 2 | `EventScope` enum | `Added` bullet | OK |
| Task 2 | Consumer validation dispatches by subject prefix | `Changed` bullet | OK |
| Task 2 | `OutboxService` accepts `AnyEventEnvelope` | `Changed` bullet | OK |
| Task 2 | `RequestReplyService` supports global contexts | `Changed` bullet | OK |
| Task 3 | New `docs/global-events.md` | `Documentation` bullet | OK |
| Task 3 | README / architecture / brief / CONTEXT updates | `Documentation` bullet | OK |

---

## Consistency Check

| Topic | `global-events.md` | `event-messaging-convention.md` | `ai-agent-guidelines.md` | `README.md` | Status |
|-------|--------------------|----------------------------------|--------------------------|-------------|--------|
| Tenant subject format | `company.{company_id}...` | `company.{company_id}...` | `company.{company_id}...` | `company.{company_id}...` | OK |
| Global subject format | `global.{domain}...` | `global.{domain}...` | `global.{domain}...` | `global.{domain}...` | OK |
| `actor_id` required for | `client`, `company_user` | `client`, `company_user` | `client`, `company_user` | *(note ok; rule 4 needs fix)* | Fix needed |
| `company_id` in global events | omitted | omitted | omitted | omitted | OK |

---

## Recommended Fix Order

1. `docs/global-events.md` — fix `producerService` injection (Issue 1).
2. `docs/global-events.md` — align subject-format token (Issue 2).
3. `README.md` — update AI Agent rule 4 for conditional `actor_id` (Issue 3).

No source code files need modification.
