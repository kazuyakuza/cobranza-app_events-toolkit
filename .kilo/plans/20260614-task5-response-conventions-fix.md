# Fix Plan: Task 5 — Response Event Naming Conventions

**Date**: 2026-06-15  
**Review Step**: 4.3 Code Review  
**Fix Plan Path**: `.kilo/plans/20260614-task5-response-conventions-fix.md`

---

## Review Summary

The implementation in Task 5 mostly follows the plan and project rules. New tests pass and `tsc --noEmit` succeeds. However, several issues were identified in the Task 5 files that need correction before the task can be considered complete.

### Issues Found

1. **Prettier / ESLint errors in modified source files**
   - `src/common/utils/index.ts:6` — multi-line export block violates Prettier rules.
   - `src/common/utils/subject.builder.spec.ts:4` — multi-line import block violates Prettier rules.
   - `src/common/utils/subject.builder.spec.ts:150,153,159,162,168,171,177,187` — string literals and function arguments incorrectly wrapped across lines.

2. **Invalid example subject in JSDoc**
   - `src/common/utils/subject.builder.ts:121` — JSDoc example uses `company.abc...` as the company ID segment, but the parser regex requires a 32-character hexadecimal UUID. The example would throw at runtime.

3. **Invalid example subject and wrong package name in `docs/event-messaging-convention.md`**
   - `docs/event-messaging-convention.md:79` — example imports from `@cobranza-app/events-toolkit` (missing the `s`); the package name is `@cobranza-apps/events-toolkit`.
   - `docs/event-messaging-convention.md:81` — example uses `company.abc...` as a request subject, which is invalid per the parser regex.

4. **Wrong package name in `docs/request-reply-patterns.md`**
   - `docs/request-reply-patterns.md:220` — imports from `@cobranza-app/events-toolkit` instead of `@cobranza-apps/events-toolkit`.
   - `docs/request-reply-patterns.md:235` — same package-name typo.

5. **Commented-out code in documentation example**
   - `docs/request-reply-patterns.md:127-133` — the "preferred" convention example is shown as commented-out code inside the requester-side code block. The implementation plan specified two separate code examples, not commented-out code. This also conflicts with the **No Commented Code Rule**.

---

## Detailed Fix Steps

### Step 1 — Fix Prettier/ESLint errors

**File**: `src/common/utils/index.ts`

Change:

```typescript
export {
  SubjectBuilder,
  buildSubject,
  buildResponseSubject,
  RESPONSE_SUFFIX,
} from './subject.builder';
```

To:

```typescript
export { SubjectBuilder, buildSubject, buildResponseSubject, RESPONSE_SUFFIX } from './subject.builder';
```

Then run `npm run lint` to confirm the error is resolved.

**File**: `src/common/utils/subject.builder.spec.ts`

Change:

```typescript
import {
  SubjectBuilder,
  buildSubject,
  buildResponseSubject,
  RESPONSE_SUFFIX,
} from './subject.builder';
```

To:

```typescript
import { SubjectBuilder, buildSubject, buildResponseSubject, RESPONSE_SUFFIX } from './subject.builder';
```

Reformat the new `buildResponseSubject()` tests to satisfy Prettier. After reformatting, each `expect(...).toThrow(...)` call should fit on a single line where Prettier allows it. Run `npm run lint` after edits.

The cleanest approach is to run `npm run lint:fix` (or `npx prettier --write src/common/utils/index.ts src/common/utils/subject.builder.spec.ts`) and then verify the result.

---

### Step 2 — Correct invalid company ID in JSDoc example

**File**: `src/common/utils/subject.builder.ts`

Replace the JSDoc `@example` block (lines 119-123):

```typescript
 * @example
 * ```ts
 * buildResponseSubject('company.abc.debt.schedule.calculate.v1');
 * // => 'company.abc.debt.schedule.calculate.response.v1'
 * ```
```

With a valid 32-character hexadecimal UUID:

```typescript
 * @example
 * ```ts
 * buildResponseSubject('company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.v1');
 * // => 'company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.response.v1'
 * ```
```

---

### Step 3 — Correct `docs/event-messaging-convention.md`

**File**: `docs/event-messaging-convention.md`

Replace the example block under "Alternative: `.response` Suffix" (lines 78-84):

```typescript
import { buildResponseSubject } from '@cobranza-app/events-toolkit';

const requestSubject = 'company.abc.debt.schedule.calculate.v1';
const responseSubject = buildResponseSubject(requestSubject);
// => 'company.abc.debt.schedule.calculate.response.v1'
```

With:

```typescript
import { buildResponseSubject } from '@cobranza-apps/events-toolkit';

const requestSubject = 'company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.v1';
const responseSubject = buildResponseSubject(requestSubject);
// => 'company.550e8400e29b41d4a716446655440000.debt.schedule.calculate.response.v1'
```

---

### Step 4 — Correct `docs/request-reply-patterns.md`

**File**: `docs/request-reply-patterns.md`

#### 4.1 Fix package-name typos

Replace:

```typescript
import { buildSubject } from '@cobranza-app/events-toolkit';
```

With:

```typescript
import { buildSubject } from '@cobranza-apps/events-toolkit';
```

And replace:

```typescript
import { buildResponseSubject } from '@cobranza-app/events-toolkit';
```

With:

```typescript
import { buildResponseSubject } from '@cobranza-apps/events-toolkit';
```

#### 4.2 Remove commented-out code and show two separate examples

Replace the current requester-side code block (lines 104-155) that contains commented-out preferred-convention code with two clearly separated examples.

**Alternative-convention example** (active in the main flow):

```typescript
import { RequestReplyService, SubjectBuilder, buildResponseSubject, EventContext, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<string> {
    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    // Alternative convention — buildResponseSubject()
    // Produces: company.{id}.credit.check.requested.response.v1
    const replySubject = buildResponseSubject(requestSubject);

    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const payload = new CreditCheckRequestedData({ clientId });
    const result = await this.requestReply.sendRequest({
      subject: requestSubject,
      payload,
      context,
    });

    return result.correlationId;
  }
}
```

Then add a separate **preferred-convention example** immediately after the alternative example:

```typescript
import { RequestReplyService, SubjectBuilder, buildSubject, EventContext, ActorType, generateUuidV7 } from '@cobranza-apps/events-toolkit';

class DebtService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(clientId: string, companyId: string): Promise<string> {
    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    // Preferred convention — descriptive past-tense action
    // Produces: company.{id}.credit.check.calculated.v1
    const replySubject = buildSubject({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'calculated',
      version: '1',
    });

    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const payload = new CreditCheckRequestedData({ clientId });
    const result = await this.requestReply.sendRequest({
      subject: requestSubject,
      payload,
      context,
    });

    return result.correlationId;
  }
}
```

This removes the commented-out code and provides two complete, runnable examples as the plan intended.

---

### Step 5 — Verification

After applying all fixes, run the following commands and confirm they pass:

```bash
npm run lint
npm run typecheck
npm test -- --testPathPattern="subject.builder"
```

Additionally, verify the following:

- `src/common/utils/subject.builder.ts` line count remains under 200.
- No method body exceeds 50 lines.
- No source file contains commented-out code.
- All imports in the modified docs reference `@cobranza-apps/events-toolkit`.
- The JSDoc example and doc examples use valid 32-character hexadecimal company IDs.

---

## Files to Modify

| File | Reason |
|------|--------|
| `src/common/utils/index.ts` | Prettier formatting |
| `src/common/utils/subject.builder.spec.ts` | Prettier formatting |
| `src/common/utils/subject.builder.ts` | Correct invalid JSDoc example |
| `docs/event-messaging-convention.md` | Correct package name and example subject |
| `docs/request-reply-patterns.md` | Correct package names and remove commented-out code |
