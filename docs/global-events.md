# Global Events — When to Use Tenant vs Global Envelopes

> Decision guide for AI agents and developers.

## Table of Contents

- [TL;DR](#tldr)
- [Decision Tree](#decision-tree)
- [What Is a Tenant Event?](#what-is-a-tenant-event)
- [What Is a Global Event?](#what-is-a-global-event)
- [When to Use Global Events](#when-to-use-global-events)
- [When to Use Tenant Events](#when-to-use-tenant-events)
- [Subject Format Comparison](#subject-format-comparison)
- [Envelope Field Comparison](#envelope-field-comparison)
- [Actor Type Requirements](#actor-type-requirements)
- [Producing Global Events](#producing-global-events)
- [Consuming Global Events](#consuming-global-events)
- [Global Events and the Outbox](#global-events-and-the-outbox)
- [Global Events and Request-Reply](#global-events-and-request-reply)
- [Type Guards](#type-guards)
- [Common Mistakes](#common-mistakes)
- [Related Documentation](#related-documentation)

## TL;DR

Use `EventEnvelope` (tenant) for operations scoped to a single `company_id` — subject format `company.{company_id}.{domain}.{entity}.{action}.v{version}`. Use `GlobalEventEnvelope` (global) for tenant-less operations — subject format `global.{domain}.{entity}.{action}.v{version}` with `company_id` omitted.

| Scope | Envelope | `company_id` | Subject Format |
|-------|----------|--------------|----------------|
| Tenant | `EventEnvelope` | Required (UUID v4) | `company.{company_id}.{domain}.{entity}.{action}.v{version}` |
| Global | `GlobalEventEnvelope` | Omitted | `global.{domain}.{entity}.{action}.v{version}` |

## Decision Tree

```
Start: Does the entity dataset belong to a single tenant?
├─ YES → Can the operation be meaningful without a tenant?
│        ├─ NO  → Use a TENANT event (EventEnvelope / EventBase / createEvent)
│        └─ YES → Use a TENANT event (tenant context is still required for isolation)
└─ NO  → Is the entity itself a tenant-scoping boundary (company, user, role)?
         ├─ YES → Use a GLOBAL event (GlobalEventEnvelope / GlobalEventBase / createGlobalEvent)
         └─ NO  → Is it a system-wide config or cross-tenant aggregate query?
                  ├─ YES → Use a GLOBAL event
                  └─ NO  → Revisit; default to TENANT until proven otherwise
```

## What Is a Tenant Event?

A tenant event is scoped to one `company_id`. Its subject carries the tenant identifier (`company.{company_id}.{domain}.{entity}.{action}.v{version}`), and the envelope enforces tenant isolation by requiring `company_id` as a UUID v4. Tenant events are the default for most business operations — payments, debts, bank statements, notifications, client updates. For step-by-step instructions on creating a tenant event class, see [AI Agent Guidelines — Creating a New Event Class](ai-agent-guidelines.md#step-by-step-creating-a-new-event-class).

## What Is a Global Event?

A global event is tenant-less — `company_id` is omitted entirely. Its subject follows the format `global.{domain}.{entity}.{action}.v{version}`. Global events intentionally bypass tenant isolation; consumers must enforce their own authorization. Use `GlobalEventEnvelope` / `GlobalEventBase` classes and `createGlobalEvent()` factory to produce global events. For the wire format specification, see [Event & Messaging Convention — Global Subject Format](event-messaging-convention.md#global-subject-format).

## When to Use Global Events

- Creating cross-tenant entities: `iam.company.created`, `iam.user.created`, `iam.role.created`.
- System-wide configuration changes: `config.feature-flag.toggled`, `system.config.updated`.
- Cross-tenant aggregate queries performed with system-wide privileges: `iam.company.lookup.completed`.

## When to Use Tenant Events

- Most business operations: payments, debts, bank statements, notifications, client updates.
- Any action owned by a single `company_id`, even initiated by a `system` actor.
- Request-reply flows scoped to a tenant.

## Subject Format Comparison

| Scope | Format | Example | Builder |
|-------|--------|---------|---------|
| Tenant | `company.{company_id}.{domain}.{entity}.{action}.v{version}` | `company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1` | `SubjectBuilder.build()` / `buildSubject()` |
| Global | `global.{domain}.{entity}.{action}.v{version}` | `global.iam.company.created.v1` | `SubjectBuilder.buildGlobal()` / `buildGlobalSubject()` |
| Platform (infra) | `platform.service.{action}.v{version}` | `platform.service.register.v1` | (discovery module) |

> **Note:** `global.*` must NOT be confused with `platform.*` subjects — platform is for discovery infrastructure only (see [Event & Messaging Convention §2.2](event-messaging-convention.md#22-platform-event-subjects)).

## Envelope Field Comparison

| Field | Tenant (`EventEnvelope`) | Global (`GlobalEventEnvelope`) | Shared (`BaseEventEnvelope`) |
|-------|---------------------------|--------------------------------|------------------------------|
| `id` | required | required | shared |
| `type`, `version`, `produced_at`, `producer` | required | required | shared |
| `company_id` | **required** (UUID v4) | **omitted** | tenant-only |
| `actor_type` | required | required | shared |
| `actor_id` | required for `client`/`company_user`; optional for `system`/`scheduler`/`external_api` | same rules | shared |
| `correlation_id` | required | required | shared |
| `causation_id`, `trace_id`, `reply_to` | optional | optional | shared |
| `data` | required (typed `T`) | required (typed `T`) | shared |

> **Important:** Do NOT use a placeholder UUID for `company_id` in global events — omit it entirely.

## Actor Type Requirements

| Actor Type | `actor_id` Required? | Notes |
|------------|----------------------|-------|
| `client` | Yes | Must be a non-empty string identifying the client |
| `company_user` | Yes | Must be a non-empty string identifying the user |
| `system` | No | Automated system processes; `actor_id` may be omitted |
| `scheduler` | No | Scheduled/cron jobs; `actor_id` may be omitted |
| `external_api` | No | Third-party integrations; `actor_id` may be omitted |

> Enforced via `@IsOptionalForSystemActors()` exportable decorator.

## Producing Global Events

### Snippet A: Factory + `publish`

```typescript
import {
  createGlobalEvent, SubjectBuilder, ActorType, GlobalEventContext, ProducerService,
} from '@cobranza-apps/events-toolkit';

class IamService {
  constructor(
    private readonly subjectBuilder: SubjectBuilder,
    private readonly producerService: ProducerService,
  ) {}

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

### Snippet B: `emitGlobal` convenience

```typescript
await this.producerService.emitGlobal({
  subject,
  data: { name },
  context: {
    type: 'iam.company.created', version: '1.0.0', producer: 'iam-service',
    actorType: ActorType.SYSTEM, correlationId,
  },
});
```

> **Decorator-based:** Use `@EmitEvent(..., { scope: EventScope.GLOBAL })` to auto-route via `ProducerService.emitGlobal()`.

## Consuming Global Events

```typescript
import { OnEvent, GlobalEventEnvelope } from '@cobranza-apps/events-toolkit';

class CompanyCreatedConsumer {
  @OnEvent('iam.company.created', {
    version: '1',
    description: 'Handles company creation events',
    payloadExample: { companyId: 'uuid', name: 'Acme' },
  })
  async onCompanyCreated(event: GlobalEventEnvelope<CompanyCreatedData>): Promise<void> {
    // No event.company_id — global envelopes omit it by design.
    await this.provisionTenant(event.data);
  }
}
```

> **Important:** Consumers of global events MUST enforce their own authorization — the toolkit cannot enforce tenant isolation on tenant-less subjects.

## Global Events and the Outbox

`OutboxService.saveToOutbox()` accepts any `AnyEventEnvelope`. Pass a global envelope built via `createGlobalEvent()` to save it to the outbox just as you would a tenant event. The outbox stores and republishes both tenant and global envelopes unchanged. For full details, see [Outbox Usage Guidelines](outbox-usage-guidelines.md).

## Global Events and Request-Reply

Global request-reply uses `GlobalEventContext` (no `companyId`), `buildGlobalSubject()` for request/response subjects, and `buildGlobalResponseSubject()` to derive `.response` suffixed global subjects. `RequestReplyService.sendRequest()` detects `isGlobalContext(context)` internally and builds the right envelope. For full documentation, see [Request-Reply Patterns](request-reply-patterns.md).

## Type Guards

```typescript
import { AnyEventEnvelope, isGlobalEnvelope, AnyEventContext, isGlobalContext } from '@cobranza-apps/events-toolkit';

function handle(envelope: AnyEventEnvelope) {
  if (isGlobalEnvelope(envelope)) {
    // narrowed to GlobalEventEnvelope
  } else {
    // narrowed to EventEnvelope
  }
}
```

> **Detection:** `isGlobalEnvelope()` checks for the absence of `company_id` (`!('company_id' in envelope)`); `isGlobalContext()` checks for the absence of `companyId` (`!('companyId' in context)`). Do not rely on extra discriminator fields.

## Common Mistakes

| # | Mistake | Fix |
|---|---------|-----|
| 1 | Sending a placeholder `company_id` for a global event | Omit `company_id`; use `GlobalEventEnvelope` / `createGlobalEvent` |
| 2 | Uses `buildSubject()` for a global subject | Use `buildGlobalSubject()` / `SubjectBuilder.buildGlobal()` |
| 3 | Consume global events assuming tenant isolation | Global consumers MUST enforce their own authorization |
| 4 | Use `EventEnvelope` type for a global consumer | Use `GlobalEventEnvelope<T>` (or `AnyEventEnvelope<T>` + `isGlobalEnvelope`) |
| 5 | Set `actor_id` unnecessarily for `system` actor | Optional for `system`/`scheduler`/`external_api` |

## Related Documentation

- [Event & Messaging Convention](event-messaging-convention.md) — Wire format specification
- [AI Agent Guidelines](ai-agent-guidelines.md) — Step-by-step instructions
- [Request-Reply Patterns](request-reply-patterns.md) — Request-reply patterns
- [Outbox Usage Guidelines](outbox-usage-guidelines.md) — Outbox usage guide
- [Transactional Outbox Usage](outbox-transactional-usage.md) — Transactional outbox
- [NATS JetStream Configuration](nats-jetstream-configuration.md) — Stream configuration
- [README — Core Concepts](../README.md#core-concepts) — Overview
- [Architecture](../.agent/project-info/architecture.md) — System architecture
