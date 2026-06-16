# Task 4 Fix Plan: Request-Reply + Outbox Integration

## Issues Found

All automated checks pass (`npm run lint`, `npm run typecheck`, `npm run test`: 442 tests passed). The implementation matches the approved plan and the source-code files respect the project rules. Two documentation/example accuracy issues were found during review:

1. **`docs/outbox-configuration.md` uses an undefined class in the low-level example.**
   - The low-level async-request snippet calls `new CreditCheckRequestedEvent({ clientId }, context)`, but `CreditCheckRequestedEvent` is never imported or defined in the document.

2. **`docs/examples/outbox-request-reply.example.ts` has unused imports and misses a type annotation.**
   - `EventEnvelope` is imported but never used.
   - `AsyncRequestEventContext` is imported but never used as a type annotation, missing the opportunity to demonstrate the compile-time `replyTo` enforcement that is the main benefit of the new API.

---

## Fix Steps

### Step 1 — Fix `docs/outbox-configuration.md` low-level example

**File:** `docs/outbox-configuration.md`

**Change 1.1:** Add `createEvent` to the import block of the low-level example.

Locate:

```markdown
import { OutboxService, SubjectBuilder, EventContext, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';
```

Replace with:

```markdown
import { OutboxService, SubjectBuilder, EventContext, ActorType, generateUuidV7, createEvent } from '@cobranza-apps/events-toolkit';
```

**Change 1.2:** Replace the undefined event class instantiation with `createEvent`.

Locate:

```typescript
    const event = new CreditCheckRequestedEvent({ clientId }, context);
```

Replace with:

```typescript
    const event = createEvent({ clientId }, context);
```

**Rationale:** Keeps the low-level example self-contained, runnable, and consistent with the README and `docs/examples/outbox-request-reply.example.ts` examples.

---

### Step 2 — Clean up `docs/examples/outbox-request-reply.example.ts`

**File:** `docs/examples/outbox-request-reply.example.ts`

**Change 2.1:** Remove the unused `EventEnvelope` import.

Locate:

```typescript
import { createEvent, EventEnvelope } from '@cobranza-apps/events-toolkit';
```

Replace with:

```typescript
import { createEvent } from '@cobranza-apps/events-toolkit';
```

**Change 2.2:** Annotate the high-level request context with `AsyncRequestEventContext`.

Locate in `DebtService.requestCreditCheck`:

```typescript
    const result = await this.outboxService.sendAsyncRequestThroughOutbox({
      subject: requestSubject,
      payload: { clientId, fullName },
      context: {
```

Replace with:

```typescript
    const context: AsyncRequestEventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const result = await this.outboxService.sendAsyncRequestThroughOutbox({
      subject: requestSubject,
      payload: { clientId, fullName },
      context,
```

**Change 2.3:** Annotate the low-level request context with `AsyncRequestEventContext` as well.

Locate in `DebtServiceLowLevel.requestCreditCheck`:

```typescript
    const context = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };
```

Replace with:

```typescript
    const context: AsyncRequestEventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };
```

**Rationale:** Removing unused imports keeps the example clean. Using `AsyncRequestEventContext` in both API examples explicitly shows that `replyTo` is required at compile time, reinforcing the key design goal documented in `docs/request-reply-guidelines.md`.

---

## Verification

After applying the fixes:

1. Run `npm run lint` — must pass.
2. Run `npm run typecheck` — must pass.
3. Run `npm run test` — all 442 tests must pass.
4. Run `npm run build` — must succeed.
5. Read the modified markdown/example snippets to confirm they are self-contained and accurate.

---

## Files to Modify

| File | Change |
| ---- | ------ |
| `docs/outbox-configuration.md` | Import `createEvent`; replace undefined `CreditCheckRequestedEvent` with `createEvent` |
| `docs/examples/outbox-request-reply.example.ts` | Remove unused `EventEnvelope` import; annotate contexts with `AsyncRequestEventContext` |
