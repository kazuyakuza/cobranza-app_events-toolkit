# Fix Plan: Task 4 — Enhance Existing Decorators (Code Review Findings)

**Branch:** `feat/event-discovery-module`
**Date:** 2026-06-18
**Source:** 4.3 Code Review of Task 4 4.2 Implementation

---

## Issues Found

### 1. `src/discovery/manifest.service.ts` exceeds the 200-line file limit

- **Severity:** High
- **Current:** 222 lines (lines 1–222)
- **Rule:** Max 200 lines per source file in `src/`
- **Plan deviation:** Plan Step 6 / Decision D6 explicitly required keeping `ManifestService` under 200 lines by extracting entry-building logic.
- **Fix:** Move payload-schema-ref extraction logic and the `PayloadSchemaRefParams` interface out of `ManifestService` into `ManifestEntryBuilder`, so `ManifestService` only orchestrates scanning.

### 2. Documentation still shows old decorator signatures

- **Severity:** High
- **Files / lines:**
  - `README.md` line 258 (`@EmitEvent({ domain... })`)
  - `README.md` line 297 (`@OnEvent({ domain... })`)
  - `README.md` line 313 (`@OnEvent({ domain... })`)
  - `README.md` line 440 (`@OnEvent({ domain... })`)
  - `README.md` line 462 (`@OnRequestReply({ eventType: ... })`)
  - `docs/ai-agent-guidelines.md` line 114 (`@EmitEvent({ domain... })`)
  - `docs/ai-agent-guidelines.md` line 152 (`@OnEvent({ domain... })`)
  - `docs/ai-agent-guidelines.md` line 165 (`@OnEvent({ domain... })`)
  - `docs/request-reply-patterns.md` line 229 (`@OnEvent({ domain... })`)
  - `docs/request-reply-patterns.md` line 265 (`@OnRequestReply({ eventType: ... })`)
  - `docs/request-reply-patterns.md` line 419 (`@OnEvent({ domain... })`)
  - `docs/request-reply-patterns.md` line 497 (`@OnEvent({ domain... })`)
  - `docs/outbox-configuration.md` line 295 (`@OnEvent({ domain... })`)
- **Plan deviation:** Plan Step 15 required updating `docs/event-messaging-convention.md` and `README.md` examples; the old signatures are still present across multiple docs.
- **Fix:** Replace all old decorator calls with the new string-first-arg signatures and add a `payloadExample` example in at least one doc.

### 3. `src/discovery/utils/schema-generator.spec.ts` is out of date and fails

- **Severity:** Medium
- **Errors:**
  - Line 19: `service` does not exist in `ServiceManifestDto`
  - Line 22: `heartbeatIntervalMinutes` does not exist in `ServiceManifestDto`
  - Line 45: `generateAllSchemas` is private
- **Plan deviation:** Plan Step 12 / review criterion 4 expects tests to pass.
- **Fix:** Update `createMinimalManifest()` to the current flattened `ServiceManifestDto` shape and remove or rewrite the private-method test.

### 4. `.agent/project-info/context.md` not updated with Task 4 notes

- **Severity:** Medium
- **Plan deviation:** Plan Step 16 required updating `context.md` with Task 4 completion notes.
- **Fix:** Add a "Task 4 — Enhance Existing Decorators" section under Recent Changes summarizing the decorator signature changes and new rich metadata fields.

### 5. Minor plan deviation — `ManifestEntryBuilder` signature differs from plan

- **Severity:** Low (observation, no functional impact)
- **Current:** Builder methods receive the already-resolved `payloadSchemaRef: string`.
- **Plan expectation:** Builder methods were expected to receive `prototype: object` and an `extractPayloadSchemaRef` callback.
- **Decision:** Keep the current string-based API; it keeps the builder decoupled from reflection logic. Moving the reflection helpers into the builder (see Issue 1) will naturally align the responsibilities without changing public method signatures.

---

## Fix Steps

### Step 1 — Refactor payload schema extraction into `ManifestEntryBuilder`

**File:** `src/discovery/manifest-entry.builder.ts`

1. Add imports:
   - `Reflect` (global)
   - `AnyFunction` type or inline `(...args: unknown[]) => unknown`
2. Add the `GENERIC_WRAPPER_TYPES` constant and `PayloadSchemaRefParams` interface (or inline params).
3. Add private methods:
   - `extractPayloadSchemaRef(params)`
   - `extractParamTypeName(prototype, methodName)`
   - `extractReturnTypeName(prototype, methodName)`
   - `extractClassName(type)`
4. Change method signatures to accept `prototype: object`:
   - `buildOnEventEntry(metadata, methodName, prototype)`
   - `buildOnRequestReplyEntry(metadata, methodName, prototype)`
   - `buildEmitEventEntry(metadata, methodName, prototype)`
5. Inside each method, compute `payloadSchemaRef` by calling the private extraction helpers (pass `preferReturnType: true` only for `buildEmitEventEntry`).

**File:** `src/discovery/manifest.service.ts`

1. Remove the `AnyFunction` type alias.
2. Remove the `PayloadSchemaRefParams` interface.
3. Remove the `GENERIC_WRAPPER_TYPES` constant.
4. Remove methods: `extractPayloadSchemaRef`, `extractParamTypeName`, `extractReturnTypeName`, `extractClassName`.
5. Update calls to `entryBuilder.buildOnEventEntry`, `buildOnRequestReplyEntry`, and `buildEmitEventEntry` to pass `Object.getPrototypeOf(instance)` instead of the resolved string.
6. Verify the file is under 200 lines.

### Step 2 — Fix outdated schema-generator test

**File:** `src/discovery/utils/schema-generator.spec.ts`

1. Rewrite `createMinimalManifest()`:
   ```ts
   return {
     name: 'test-service',
     version: '1.0.0',
     description: '',
     instanceId: 'test-instance',
     consumes: [],
     produces: [],
   };
   ```
2. Remove the `describe('generateAllSchemas')` block (it tests a private method).

### Step 3 — Update decorator examples in README

**File:** `README.md`

1. Line 258: `@EmitEvent('payment.proof.uploaded', { version: '1' })`
2. Line 297: `@OnEvent('payment.proof.uploaded', { version: '1' })`
3. Line 313: `@OnEvent('payment.proof.uploaded', { version: '1' })`
4. Line 440: `@OnEvent('credit.check.requested', { version: '1' })`
5. Line 462: `@OnRequestReply('credit.check.completed')`

### Step 4 — Update decorator examples in docs

**File:** `docs/ai-agent-guidelines.md`

1. Line 114: `@EmitEvent('payment.proof.uploaded', { version: '1' })`
2. Line 152: `@OnEvent('payment.proof.uploaded', { version: '1' })`
3. Line 165: `@OnEvent('payment.proof.uploaded', { version: '1' })`

**File:** `docs/request-reply-patterns.md`

1. Line 229: `@OnEvent('credit.check.requested', { version: '1' })`
2. Line 265: `@OnRequestReply('credit.check.completed')`
3. Line 419: `@OnEvent('credit.check.requested', { version: '1' })`
4. Line 497: `@OnEvent('credit.check.requested', { version: '1' })`

**File:** `docs/outbox-configuration.md`

1. Line 295: `@OnEvent('credit.check.requested', { version: '1' })`

**File:** `docs/event-messaging-convention.md`

1. Add a short subsection under "Event Naming" documenting the new decorator signature and the optional `payloadExample` metadata field.

### Step 5 — Update `.agent/project-info/context.md`

Add a new "2026-06-18 — Task 4: Enhance Existing Decorators" entry under Recent Changes that notes:

- Decorators now accept `eventType: string` as the first argument.
- Rich metadata (`description`, `tags`, `payloadSchemaRef`, `payloadExample`) added to `@OnEvent`, `@EmitEvent`, and `@OnRequestReply`.
- Explorers and `EmitEventInterceptor` updated to use the new metadata.
- `ManifestEntryBase` DTO now includes `payloadExample`.
- `ManifestEntryBuilder` extracted to keep `ManifestService` under the line limit.

### Step 6 — Verification

Run the following commands and confirm all pass:

```bash
npm run typecheck
npm run lint
npm run build
npm run test -- --testPathPattern=decorator --no-coverage
npm run test -- --testPathPattern=schema-generator --no-coverage
npm run test -- --no-coverage
```

### Step 7 — Commit

Stage all fix files and commit with a meaningful message, e.g.:

```text
fix(task4): reduce ManifestService line count and update docs/tests

- Move payload schema extraction into ManifestEntryBuilder
- Fix outdated schema-generator.spec.ts manifest shape
- Update decorator examples in README and docs
- Add Task 4 completion notes to context.md
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/discovery/manifest-entry.builder.ts` | Add payload schema extraction helpers and accept `prototype` |
| `src/discovery/manifest.service.ts` | Remove extraction helpers; keep under 200 lines |
| `src/discovery/utils/schema-generator.spec.ts` | Update manifest shape; remove private-method test |
| `README.md` | Update decorator examples |
| `docs/ai-agent-guidelines.md` | Update decorator examples |
| `docs/request-reply-patterns.md` | Update decorator examples |
| `docs/outbox-configuration.md` | Update decorator example |
| `docs/event-messaging-convention.md` | Add decorator signature / payloadExample note |
| `.agent/project-info/context.md` | Add Task 4 completion notes |

---

## Approval Gate

After fixes, `ManifestService` must be ≤ 200 lines, all tests must pass, typecheck/lint/build must pass, and no old decorator signatures may remain in README or docs.
