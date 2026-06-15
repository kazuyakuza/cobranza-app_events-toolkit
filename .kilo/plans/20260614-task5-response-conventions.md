# Implementation Plan: Task 5 — Response Event Naming Conventions

**Date**: 2026-06-14  
**Task**: Define response event naming conventions and helpers  
**Plan Path**: `.kilo/plans/20260614-task5-response-conventions.md`

---

## 1. Pre-Analysis

### 1.1 Current State

- **Subject format**: `company.{companyId}.{domain}.{entity}.{action}.v{version}`
- **SubjectBuilder** (`src/common/utils/subject.builder.ts`, 53 lines): `build(dto: BuildSubjectDto): string` — single entry point for all subject generation.
- **BuildSubjectDto** (`src/common/dto/build-subject.dto.ts`, 53 lines): DTO with `companyId`, `domain`, `entity`, `action`, `version`.
- **Response convention** (docs/event-messaging-convention.md §2): uses `.response` suffix appended to the action: `company.{id}.payment.proof.uploaded.response.v1`
- **buildResponseEnvelope** exists in `RequestReplyService` (builds envelope preserving `correlation_id` and `causation_id` from request event).
- **buildEnvelope** exists in `request-reply.helpers.ts` (builds envelope from `EventContext` + payload).
- **validateSubject** exists in `security.utils.ts` for subject format validation.
- **request-reply-patterns.md** already documents async pattern — currently shows manual `action: 'requested.response'` in `SubjectBuilder.build()`.

### 1.2 Task Requirements

1. **Response naming convention**: Two approaches:
   - **Preferred**: Use a descriptive past-tense action (e.g., `debt.schedule.calculated.v1`). The response is just another event — no special suffix needed.
   - **Alternative**: Append `.response` to the request action (e.g., `debt.schedule.calculate.response.v1`). Useful for programmatic derivation of reply subjects.
2. **Add helper**: `buildResponseSubject(requestSubject)` that derives the `.response` subject from a request subject (for the alternative convention).
3. **Update `event-messaging-convention.md`**: Document both conventions explicitly.
4. **Update `request-reply-patterns.md`**: Add convention details and `buildResponseSubject` examples.

### 1.3 Constraints Checklist

- [x] Max 200 lines per source file
- [x] Max 50 lines per method body
- [x] Max 2 params per method — `buildResponseSubject(requestSubject)` takes 1 param
- [x] Self-documenting code — clear names, JSDoc
- [x] Prefer private members
- [x] No commented-out code

---

## 2. High-Level Approach

1. Add `RESPONSE_SUFFIX` constant and `buildResponseSubject()` function to `subject.builder.ts`.
2. Add `parseSubjectSegments()` private helper to decompose subjects (reused by `buildResponseSubject` and potentially by future utilities).
3. Create `SubjectParseResult` type for parsed subject components.
4. Export new symbols from barrel files.
5. Write unit tests for `buildResponseSubject` and `RESPONSE_SUFFIX`.
6. Update `docs/event-messaging-convention.md` — add explicit response naming convention section.
7. Update `docs/request-reply-patterns.md` — add convention details and `buildResponseSubject` usage examples.
8. No new files needed — all changes modify existing files.

---

## 3. Detailed Steps

### Step 3.1 — Add `SubjectParseResult` type and `parseSubjectSegments` to `subject.builder.ts`

**File**: `src/common/utils/subject.builder.ts`  
**Current**: 53 lines. After changes: ~110 lines (under 200 limit).

Add after the existing `buildSubject` function:

```typescript
/** Suffix appended to the action segment when deriving response subjects. */
export const RESPONSE_SUFFIX = '.response';

/** Parsed components of a NATS subject following the event-messaging convention. */
export interface SubjectParseResult {
  /** Company UUID (dashless) extracted from the subject. */
  companyId: string;
  /** Business domain extracted from the subject. */
  domain: string;
  /** Main entity extracted from the subject. */
  entity: string;
  /** Action (verb) extracted from the subject, including `.response` if present. */
  action: string;
  /** Version number string (digits only, without `v` prefix). */
  version: string;
}
```

Add `parseSubjectSegments` as a module-private function (not exported):

```typescript
/** Regex that matches the convention subject format and captures each segment. */
const SUBJECT_SEGMENTS_PATTERN =
  /^company\.([0-9a-f]{32})\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-.]+)\.v(\d+)$/i;

/**
 * Parses a NATS subject string into its convention segments.
 *
 * Expected format: `company.{companyId}.{domain}.{entity}.{action}.v{version}`
 * The action segment may contain dots (e.g., `calculate.response`).
 *
 * @param subject - Full NATS subject string.
 * @returns Parsed subject components.
 * @throws Error if subject does not match the convention format.
 */
function parseSubjectSegments(subject: string): SubjectParseResult {
  const match = subject.match(SUBJECT_SEGMENTS_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid subject format: "${subject}". Expected: company.{companyId}.{domain}.{entity}.{action}.v{version}`,
    );
  }
  return {
    companyId: match[1],
    domain: match[2],
    entity: match[3],
    action: match[4],
    version: match[5],
  };
}
```

> **Design note**: `parseSubjectSegments` is module-private (not exported) because external consumers should use `buildResponseSubject` or `SubjectBuilder.build()`. The regex allows dots in the action segment to support both `calculate` and `calculate.response`.

### Step 3.2 — Add `buildResponseSubject()` function to `subject.builder.ts`

Add after `parseSubjectSegments`:

```typescript
/**
 * Derives the response subject from a request subject by inserting
 * {@link RESPONSE_SUFFIX} before the version segment.
 *
 * Follows the **alternative** response naming convention where
 * response subjects append `.response` to the request action:
 * - Request:  `company.{id}.{domain}.{entity}.{action}.v{N}`
 * - Response: `company.{id}.{domain}.{entity}.{action}.response.v{N}`
 *
 * For the **preferred** convention (past-tense outcome action),
 * use {@link SubjectBuilder.build} or {@link buildSubject} directly
 * with the appropriate action name (e.g., `calculated` instead of `calculate`).
 *
 * @param requestSubject - Full NATS request subject string.
 * @returns Response subject string with `.response` appended to the action.
 * @throws Error if `requestSubject` does not match the convention format.
 *
 * @example
 * ```ts
 * buildResponseSubject('company.abc.debt.schedule.calculate.v1');
 * // => 'company.abc.debt.schedule.calculate.response.v1'
 * ```
 */
export function buildResponseSubject(requestSubject: string): string {
  const parsed = parseSubjectSegments(requestSubject);
  const responseAction = parsed.action + RESPONSE_SUFFIX;
  return `company.${parsed.companyId}.${parsed.domain}.${parsed.entity}.${responseAction}.v${parsed.version}`;
}
```

### Step 3.3 — Export new symbols from `src/common/utils/index.ts`

**File**: `src/common/utils/index.ts`  
**Current line 6**: `export { SubjectBuilder, buildSubject } from './subject.builder';`  
**Change to**:

```typescript
export {
  SubjectBuilder,
  buildSubject,
  buildResponseSubject,
  RESPONSE_SUFFIX,
} from './subject.builder';

export type { SubjectParseResult } from './subject.builder';
```

### Step 3.4 — Verify barrel export from `src/index.ts`

**File**: `src/index.ts`  
**Current**: `export * from './common';` — This already re-exports everything from `common/utils/index.ts`.

No changes needed. `buildResponseSubject`, `RESPONSE_SUFFIX`, and `SubjectParseResult` will be automatically available via the barrel chain.

### Step 3.5 — Add unit tests for `buildResponseSubject` and `RESPONSE_SUFFIX`

**File**: `src/common/utils/subject.builder.spec.ts`  
**Current**: 142 lines. New tests add ~60 lines. Spec files are exempt from the 200-line rule.

Add imports and `describe` blocks:

```typescript
// Add to existing imports at top:
import { buildResponseSubject, RESPONSE_SUFFIX } from './subject.builder';

// Add at end of file:

describe('buildResponseSubject()', () => {
  it('appends .response before version segment', () => {
    const requestSubject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
    const responseSubject = buildResponseSubject(requestSubject);
    expect(responseSubject).toBe(
      'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.response.v1',
    );
  });

  it('handles multi-part actions correctly', () => {
    const requestSubject = 'company.550e8400e29b41d4a716446655440000.credit.check.requested.v2';
    const responseSubject = buildResponseSubject(requestSubject);
    expect(responseSubject).toBe(
      'company.550e8400e29b41d4a716446655440000.credit.check.requested.response.v2',
    );
  });

  it('preserves the version number', () => {
    const requestSubject = 'company.aaaaaaaa00000000bbbbbbbbcccccccc.debt.schedule.generated.v3';
    const responseSubject = buildResponseSubject(requestSubject);
    expect(responseSubject).toBe(
      'company.aaaaaaaa00000000bbbbbbbbcccccccc.debt.schedule.generated.response.v3',
    );
  });

  it('throws Error for subject without version segment', () => {
    expect(() => buildResponseSubject('company.abc.debt.schedule.calculate')).toThrow(
      /invalid subject format/i,
    );
  });

  it('throws Error for empty string', () => {
    expect(() => buildResponseSubject('')).toThrow(/invalid subject format/i);
  });

  it('throws Error for malformed subject', () => {
    expect(() => buildResponseSubject('not-a-valid-subject')).toThrow(/invalid subject format/i);
  });
});

describe('RESPONSE_SUFFIX', () => {
  it('equals .response', () => {
    expect(RESPONSE_SUFFIX).toBe('.response');
  });
});
```

### Step 3.6 — Update `docs/event-messaging-convention.md`

**File**: `docs/event-messaging-convention.md`

#### 3.6.1 Add Section 2.1: Response Subject Naming Convention

Insert after line 39 (after the "Examples" block in Section 2, before Section 3):

```markdown
### 2.1 Response Subject Naming Convention

When a service responds to a request event, the response subject can follow either of two conventions:

#### Preferred: Descriptive Past-Tense Action

Use a distinct past-tense action that describes the **outcome** of the request. This treats the response as a first-class event.

- Request:  `company.{id}.debt.schedule.calculate.v1`
- Response: `company.{id}.debt.schedule.calculated.v1`

This approach is preferred because:
- Response subjects are discoverable and self-documenting.
- No special parsing is needed — the subject follows the same format as any event.
- Works with standard `@OnEvent()` handlers without special routing.

To build a preferred response subject, use `SubjectBuilder.build()` or `buildSubject()` with the appropriate action:

```ts
const responseSubject = buildSubject({
  companyId,
  domain: 'debt',
  entity: 'schedule',
  action: 'calculated',  // past-tense outcome of "calculate"
  version: '1',
});
```

#### Alternative: `.response` Suffix

Append `.response` to the request's action segment. This is useful for programmatic derivation of response subjects.

- Request:  `company.{id}.debt.schedule.calculate.v1`
- Response: `company.{id}.debt.schedule.calculate.response.v1`

To build an alternative response subject, use `buildResponseSubject()`:

```ts
import { buildResponseSubject } from '@cobranza-app/events-toolkit';

const requestSubject = 'company.abc.debt.schedule.calculate.v1';
const responseSubject = buildResponseSubject(requestSubject);
// => 'company.abc.debt.schedule.calculate.response.v1'
```

**Trade-offs**:

| Aspect | Preferred (Past-Tense) | Alternative (`.response`) |
|--------|------------------------|--------------------------|
| Discoverability | High — each response is a distinct event type | Lower — `.response` subjects are derived |
| Programmatic derivation | Manual — choose the action name | Automatic — use `buildResponseSubject()` |
| Handler routing | Standard `@OnEvent()` | Standard `@OnEvent()` with `.response` action |
| Subject parsing | Standard format | Requires awareness of `.response` suffix |

> **Rule of thumb**: Use the preferred convention when the response has a distinct semantic meaning (e.g., `calculated`, `approved`, `rejected`). Use the alternative when the response is purely a reply to the request with no distinct outcome verb.
```

#### 3.6.2 Update Section 4.2 — Response naming convention subsection

Replace the current text (around lines 129-135):

```
**Response naming convention:**

Use `action: '{original_action}.response'` in `BuildSubjectDto` to produce response subjects:

- Request: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
- Response: `company.{company_id}.{domain}.{entity}.{action}.response.v{version}`
```

With:

```
**Response naming convention:**

See [Section 2.1](#21-response-subject-naming-convention) for the full convention specification.

Quick reference:
- **Preferred**: Use a descriptive past-tense action (e.g., `calculated` for a `calculate` request).
- **Alternative**: Use `buildResponseSubject(requestSubject)` to derive the `.response` suffix automatically.
```

### Step 3.7 — Update `docs/request-reply-patterns.md`

**File**: `docs/request-reply-patterns.md`

#### 3.7.1 Update async requester side code example

In the "Code example — Requester side" section (around lines 123-131), replace:

```typescript
    // Build response subject: set action to include ".response"
    // Produces: company.{id}.credit.check.requested.response.v1
    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested.response',
      version: '1',
    });
```

With two approaches shown in separate code examples. Update the import line to include `buildSubject` and `buildResponseSubject`.

**Alternative convention — `buildResponseSubject()`:**

```typescript
    import { buildSubject, buildResponseSubject } from '@cobranza-app/events-toolkit';

    const requestSubject = buildSubject({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });
    const replySubject = buildResponseSubject(requestSubject);
    // => 'company.{id}.credit.check.requested.response.v1'
```

**Preferred convention — past-tense action:**

```typescript
    import { buildSubject } from '@cobranza-app/events-toolkit';

    const replySubject = buildSubject({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'calculated',
      version: '1',
    });
    // => 'company.{id}.credit.check.calculated.v1'
```

#### 3.7.2 Add "Building Response Subjects" subsection

Insert a new subsection after the "Code example — Responder side" (after line ~191) and before "Code example — Response handler":

```markdown
#### Building Response Subjects

The toolkit provides two approaches for constructing response subjects:

**Preferred approach — Descriptive past-tense action:**

```typescript
import { buildSubject } from '@cobranza-app/events-toolkit';

const responseSubject = buildSubject({
  companyId: event.company_id,
  domain: 'credit',
  entity: 'check',
  action: 'calculated',
  version: '1',
});
// => 'company.550e...credit.check.calculated.v1'
```

**Alternative approach — `.response` suffix via `buildResponseSubject`:**

```typescript
import { buildResponseSubject } from '@cobranza-app/events-toolkit';

const responseSubject = buildResponseSubject(
  'company.550e8400e29b41d4a716446655440000.credit.check.requested.v1',
);
// => 'company.550e8400e29b41d4a716446655440000.credit.check.requested.response.v1'
```

See [Event & Messaging Convention §2.1](event-messaging-convention.md#21-response-subject-naming-convention) for the full convention details.
```

#### 3.7.3 Update Section 9 (API Reference)

Add a "Subject Utility Functions" subsection after the existing `RequestReplyConfig` table (after line ~436):

```markdown
### Subject Utility Functions

| Function | Description |
|----------|-------------|
| `buildResponseSubject(requestSubject)` | Derives a response subject by appending `.response` to the action segment of a request subject |
| `RESPONSE_SUFFIX` | Constant `.response` — the suffix appended by `buildResponseSubject` |
```

### Step 3.8 — Verify file line counts stay under 200

After all changes:

| File | Current Lines | Expected Lines | Under 200? |
|------|--------------|----------------|-----------|
| `src/common/utils/subject.builder.ts` | 53 | ~110 | ✅ |
| `src/common/utils/index.ts` | 11 | ~17 | ✅ |
| `src/common/utils/subject.builder.spec.ts` | 142 | ~200 | ✅ (spec exempt) |
| `docs/event-messaging-convention.md` | 166 | ~230 | ✅ (doc exempt) |
| `docs/request-reply-patterns.md` | 444 | ~480 | ✅ (doc exempt) |

### Step 3.9 — Run tests

```bash
npm test -- --testPathPattern="subject.builder"
```

Verify all existing tests pass and new tests pass.

### Step 3.10 — Code review checklist

- [ ] `buildResponseSubject` takes exactly 1 param (≤2 constraint met)
- [ ] `parseSubjectSegments` takes exactly 1 param (≤2 constraint met)  
- [ ] No method body exceeds 50 lines
- [ ] No file exceeds 200 lines (source files in `src/`)
- [ ] No commented-out code in source files
- [ ] Self-documenting names: `buildResponseSubject`, `RESPONSE_SUFFIX`, `SubjectParseResult`, `parseSubjectSegments`
- [ ] Private helper `parseSubjectSegments` is not exported
- [ ] All exports properly barrel-rolled through `common/utils/index.ts` → `common/index.ts` → `index.ts`
- [ ] Documentation is consistent between `event-messaging-convention.md` and `request-reply-patterns.md`
- [ ] Both naming conventions (preferred past-tense and alternative `.response`) are documented

### Step 3.11 — Verify no `.agent/project-structure.md` update needed

No new folders or files were created. All changes are to existing files. No update needed.

### Step 3.12 — Update `.agent/project-info/context.md`

After implementation, update `context.md` to reflect the new helper and conventions.

---

## 4. Git Actions

1. **Branch**: Already on feature branch from earlier workflow steps.
2. **Commit message**: `feat: add buildResponseSubject helper and response naming conventions`
3. **No push** until the entire Critical Workflow completes.

---

## 5. Files Modified Summary

| File | Action | Description |
|------|--------|-------------|
| `src/common/utils/subject.builder.ts` | MODIFY | Add `RESPONSE_SUFFIX`, `SubjectParseResult`, `parseSubjectSegments`, `buildResponseSubject` |
| `src/common/utils/index.ts` | MODIFY | Export `buildResponseSubject`, `RESPONSE_SUFFIX`, `SubjectParseResult` |
| `src/common/utils/subject.builder.spec.ts` | MODIFY | Add test suite for `buildResponseSubject` and `RESPONSE_SUFFIX` |
| `docs/event-messaging-convention.md` | MODIFY | Add §2.1 Response naming convention with both approaches |
| `docs/request-reply-patterns.md` | MODIFY | Add response subject helper section, update examples, update API ref |

---

## 6. What Was NOT Done

- No changes to `RequestReplyService` or `request-reply.helpers.ts` — `buildResponseEnvelope` already exists and works correctly.
- No new files created — all modifications to existing files.
- No changes to `BuildSubjectDto` — the existing DTO is sufficient; response subject building via `buildResponseSubject` operates on string subjects.
- No changes to `event.factory.ts` — `createEvent` is unrelated to subject building.