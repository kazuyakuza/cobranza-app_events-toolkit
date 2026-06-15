# Fix Plan: Task 7 — Guidelines for Developers & AI Agents

## Review Summary

**Scope:** `docs/request-reply-guidelines.md`, `docs/ai-agent-guidelines.md`, `README.md`

**Result:** Issues found. Internal links are valid and most content is consistent with the event-messaging convention and request-reply patterns. However, there are **constructor-signature errors** in code examples and a **validation inconsistency** around `correlation_id` values that would fail runtime validation.

---

## Findings

### 1. HIGH — `EventEnvelope` subclass constructed with wrong signature

**Location 1:** `docs/ai-agent-guidelines.md` — Step-by-Step: Creating a New Event Class

```typescript
const event = new PaymentProofUploadedEvent(data, {
  type: 'payment.proof.uploaded',
  version: '1.0.0',
  // ...
});
```

**Location 2:** `README.md` — Defining an Event / Producer examples

```typescript
const event = new PaymentProofUploadedEvent(data, context);
```

**Problem:** `EventEnvelope<T>` (and therefore `EventBase<T>` subclasses) has a single-argument constructor:

```typescript
constructor(properties?: Partial<EventEnvelope<T>>)
```

It does **not** accept `(data, context)`. These examples will not compile or run as written.

**Fix:** Replace `new PaymentProofUploadedEvent(data, context)` with `createEvent(data, context)` from `@cobranza-apps/events-toolkit`, which is the supported factory for building envelopes from data + context. Alternatively, build a single `Partial<EventEnvelope<T>>` object manually, but `createEvent` is the recommended pattern shown elsewhere in the README.

---

### 2. HIGH — `correlation_id` examples use values that fail current runtime validation

**Locations:**
- `docs/ai-agent-guidelines.md` EventContext example
- `README.md` Event Context example and several code snippets

**Problem:** Examples show:

```typescript
correlationId: 'req_987fcdeb-51a2-43e8-9c4f-123456789abc'
```

`EventEnvelope.correlation_id` is decorated with `@IsUUID('4')`, which rejects any prefixed value and rejects UUIDv7.

The docs also instruct readers to generate `correlation_id` via `generateUuidV7()` (in `request-reply-guidelines.md` and `ai-agent-guidelines.md`). A UUIDv7 will also fail `@IsUUID('4')` validation.

**Fix:** Update all `correlationId` example values to plain UUID v4 strings (e.g., `'987fcdeb-51a2-43e8-9c4f-123456789abc'`) so the documented examples pass current validation. Add a note that the source-code validator currently requires UUID v4 and that a separate task should update `@IsUUID('4')` to support UUIDv7 if that is the intended format.

---

### 3. MEDIUM — `request-reply-guidelines.md` references `RequestReplyConfig.defaultTimeoutMs` without showing how to provide config

**Location:** `docs/request-reply-guidelines.md` — Timeout Recommendations / Sync Pattern

**Problem:** The doc states the default timeout comes from `RequestReplyConfig.defaultTimeoutMs` and shows per-call override syntax, but it does not explain how the consuming microservice supplies the config object (e.g., via `RequestReplyModule.forRoot({ config: { defaultTimeoutMs: 5000 } })` or the unified module).

**Fix:** Add a short paragraph or code snippet showing how to register `RequestReplyConfig` when setting up `RequestReplyModule` or `EventsToolkitModule`.

---

### 4. LOW — README Architecture tree is a high-level simplification

**Location:** `README.md` — Architecture section

**Problem:** The tree omits `producer/decorators/` and `consumer/decorators/`, which contain real production code (`EmitEventInterceptor`, `OnEventExplorer`, etc.).

**Fix:** Expand the tree to include `producer/decorators/` and `consumer/decorators/` so the README accurately reflects the source layout. Keep it concise.

---

## Proposed Edits

### `docs/ai-agent-guidelines.md`

1. In **Step-by-Step: Creating a New Event Class**, change:

```typescript
const event = new PaymentProofUploadedEvent(data, {
  type: 'payment.proof.uploaded',
  version: '1.0.0',
  producer: 'payment-service',
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  actorType: ActorType.CLIENT,
  actorId: 'clt_123e4567-e89b-12d3-a456-426614174000',
  correlationId: 'req_987fcdeb-51a2-43e8-9c4f-123456789abc',
});
```

to:

```typescript
import { createEvent } from '@cobranza-apps/events-toolkit';

const event = createEvent(data, {
  type: 'payment.proof.uploaded',
  version: '1.0.0',
  producer: 'payment-service',
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  actorType: ActorType.CLIENT,
  actorId: 'clt_123e4567-e89b-12d3-a456-426614174000',
  correlationId: '987fcdeb-51a2-43e8-9c4f-123456789abc',
});
```

2. Replace all other `req_`-prefixed `correlationId` values with plain UUID v4 strings.

### `README.md`

1. In **Defining an Event** and **Producer (Publishing Events)** sections, change:

```typescript
const event = new PaymentProofUploadedEvent(data, context);
```

and any similar usage to:

```typescript
const event = createEvent(data, context);
```

Ensure `createEvent` is imported where needed.

2. Replace all `req_`-prefixed `correlationId` example values with plain UUID v4 strings.

3. Add a short config snippet under **Request-Reply Pattern > Sync** showing how to set `defaultTimeoutMs`.

4. Update the **Architecture** tree to include:

```text
├── producer/
│   ├── decorators/             # @EmitEvent(), EmitEventInterceptor
│   ├── producer.module.ts
│   └── producer.service.ts
├── consumer/
│   ├── decorators/             # @OnEvent(), @OnRequestReply(), explorers
│   ├── consumer.module.ts
│   ├── consumer.service.ts
│   └── jetstream-consumer.service.ts
```

### `docs/request-reply-guidelines.md`

1. Add a config-registration snippet in the Sync Timeout section.
2. Clarify that `generateUuidV7()` produces UUIDv7 and that the consuming service must ensure its validator accepts UUIDv7 (or use UUID v4 until source validation is updated).

---

## Verification

- [ ] All internal markdown links still resolve.
- [ ] Code examples compile mentally against the actual `EventEnvelope` constructor and `createEvent` factory.
- [ ] All `correlationId` examples are plain UUID v4 strings (or explicitly noted as UUIDv7 with a validation caveat).
- [ ] README Architecture tree matches `src/` layout.
- [ ] No new contradictions introduced with `event-messaging-convention.md` or `request-reply-patterns.md`.
