# Plan: Task 4 — Enhance Existing Decorators

**Branch:** `feat/event-discovery-module`
**Date:** 2026-06-18

## Objective

Update `@OnEvent()`, `@EmitEvent()`, and `@OnRequestReply()` decorators to accept a string-based `eventType` as the first argument and rich metadata options as the second argument. Add `payloadExample` field. Update all consumers (explorers, interceptor, manifest service, DTOs) to work with the new signature. Update documentation.

---

## Design Decisions

### D1 — New Decorator Signatures

Current signatures use a single options object with domain/entity/action fields. The new signatures align with the TODO example:

```ts
// Before
@OnEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
@EmitEvent({ domain: 'payment', entity: 'proof', action: 'uploaded' })
@OnRequestReply({ eventType: 'payment.proof.uploaded' })

// After
@OnEvent('payment.proof.uploaded', { version: '1', description: '...', tags: ['payment'], payloadExample: { ... } })
@EmitEvent('payment.proof.uploaded', { version: '1', description: '...', tags: ['payment'], payloadExample: { ... } })
@OnRequestReply('payment.proof.uploaded', { companyId: '...', description: '...', tags: ['payment'] })
```

### D2 — Stored Metadata Structure

Each decorator merges `eventType` + options into a single metadata object stored via `SetMetadata`. This preserves the existing pattern and keeps explorer/manifest reading simple:

```ts
// OnEvent stores OnEventMetadata = { eventType, version?, description?, tags?, payloadSchemaRef?, payloadExample? }
function OnEvent(eventType: string, options?: OnEventOptions): MethodDecorator {
  const metadata: OnEventMetadata = { eventType, ...options };
  return SetMetadata(ON_EVENT_METADATA, metadata);
}
```

### D3 — Subject Building Simplification

Since `eventType` follows the convention `domain.entity.action`, subjects are built directly:

- Consumer wildcard subject: `company.*.${eventType}.v${version}`
- Producer template subject: `company.{companyId}.${eventType}.v${version}`
- OnRequestReply subject: `${eventType}` (unchanged — already uses eventType directly)

This simplifies `OnEventExplorer.buildWildcardSubject()` and `EmitEventInterceptor.buildSubject()` — no need to parse eventType into domain/entity/action.

### D4 — `payloadExample` Type and Storage

- Type: `Record<string, unknown>` — a plain object representing an example payload
- Stored in decorator metadata and manifest entry DTOs alongside other rich metadata
- NOT stored in the NATS subject (only in the manifest for discovery/documentation)

### D5 — Interface Naming

Each decorator gets two interfaces:
- `*Options` — public interface for the second argument (without eventType)
- `*Metadata` — internal stored metadata type (eventType + all optional fields)

Export both from barrel files so consumers can type-check metadata when reading via reflector.

### D6 — ManifestService Line Count

ManifestService is currently 244 lines (exceeds the 200-line limit). This task adds `payloadExample` extraction which will add a few more lines. To address this:
- Extract helper methods into a separate `src/discovery/manifest-entry.builder.ts` file
- Keep ManifestService under 200 lines

---

## Step-by-step Implementation

### Step 1 — Update `@OnEvent()` Decorator

**File:** `src/consumer/decorators/on-event.decorator.ts`

1. Define `OnEventMetadata` interface (internal stored shape):
   ```ts
   export interface OnEventMetadata {
     eventType: string;
     version?: string;
     description?: string;
     tags?: string[];
     payloadSchemaRef?: string;
     payloadExample?: Record<string, unknown>;
   }
   ```

2. Refactor `OnEventOptions` to exclude `domain`, `entity`, `action` (replaced by `eventType` first arg):
   ```ts
   export interface OnEventOptions {
     version?: string;
     description?: string;
     tags?: string[];
     payloadSchemaRef?: string;
     payloadExample?: Record<string, unknown>;
   }
   ```

3. Change decorator function signature:
   ```ts
   export function OnEvent(eventType: string, options?: OnEventOptions): MethodDecorator {
     const metadata: OnEventMetadata = { eventType, ...options };
     return SetMetadata(ON_EVENT_METADATA, metadata);
   }
   ```

4. Update JSDoc examples to reflect new signature.

### Step 2 — Update `@EmitEvent()` Decorator

**File:** `src/producer/decorators/emit-event.decorator.ts`

1. Define `EmitEventMetadata` interface:
   ```ts
   export interface EmitEventMetadata {
     eventType: string;
     version?: string;
     description?: string;
     tags?: string[];
     payloadSchemaRef?: string;
     payloadExample?: Record<string, unknown>;
   }
   ```

2. Refactor `EmitEventOptions`:
   ```ts
   export interface EmitEventOptions {
     version?: string;
     description?: string;
     tags?: string[];
     payloadSchemaRef?: string;
     payloadExample?: Record<string, unknown>;
   }
   ```

3. Change decorator function signature:
   ```ts
   export function EmitEvent(eventType: string, options?: EmitEventOptions): MethodDecorator {
     const metadata: EmitEventMetadata = { eventType, ...options };
     return SetMetadata(EMIT_EVENT_METADATA, metadata);
   }
   ```

4. Update JSDoc examples.

### Step 3 — Update `@OnRequestReply()` Decorator

**File:** `src/consumer/decorators/on-request-reply.decorator.ts`

1. Define `OnRequestReplyMetadata` interface:
   ```ts
   export interface OnRequestReplyMetadata {
     eventType: string;
     companyId?: string;
     description?: string;
     tags?: string[];
     payloadSchemaRef?: string;
     payloadExample?: Record<string, unknown>;
   }
   ```

2. Refactor `OnRequestReplyOptions` (remove `eventType` — now first arg):
   ```ts
   export interface OnRequestReplyOptions {
     companyId?: string;
     description?: string;
     tags?: string[];
     payloadSchemaRef?: string;
     payloadExample?: Record<string, unknown>;
   }
   ```

3. Change decorator function signature:
   ```ts
   export function OnRequestReply(eventType: string, options?: OnRequestReplyOptions): MethodDecorator {
     const metadata: OnRequestReplyMetadata = { eventType, ...options };
     return SetMetadata(ON_REQUEST_REPLY_METADATA, metadata);
   }
   ```

4. Update JSDoc examples.

### Step 4 — Update `ManifestEntryBase` DTO

**File:** `src/discovery/dto/manifest-entry-base.dto.ts`

Add `payloadExample`:
```ts
export interface ManifestEntryBase {
  subject: string;
  payloadSchemaRef: string;
  description: string;
  version: string;
  handler: string;
  tags: string[];
  payloadExample?: Record<string, unknown>;
}
```

### Step 5 — Create `manifest-entry.builder.ts` Helper Module

**New file:** `src/discovery/manifest-entry.builder.ts`

To keep ManifestService under 200 lines, extract the entry-building logic into a dedicated builder file.

1. Create `ManifestEntryBuilder` class (or pure functions) with:
   - `buildOnEventEntryFromMetadata(metadata: OnEventMetadata, methodName: string, prototype: object, extractPayloadSchemaRef: fn): ManifestConsumeEntry | null`
   - `buildEmitEventEntryFromMetadata(metadata: EmitEventMetadata, methodName: string, prototype: object, extractPayloadSchemaRef: fn): ManifestProduceEntry | null`
   - `buildOnRequestReplyEntryFromMetadata(metadata: OnRequestReplyMetadata, methodName: string, prototype: object, extractPayloadSchemaRef: fn): ManifestConsumeEntry | null`

2. Each function:
   - Uses `metadata.eventType` directly in subject building
   - Uses `metadata.version ?? '1'` for version
   - Includes `payloadExample` from metadata
   - Uses `COMPANY_ID_PLACEHOLDER` for producer entries
   - Returns `null` instead of `undefined` if metadata is missing (use separate validation)

3. Subject patterns:
   - Consumer: `company.*.${metadata.eventType}.v${version}`
   - Producer: `company.{COMPANY_ID_PLACEHOLDER}.${metadata.eventType}.v${version}`
   - RequestReply: `${metadata.eventType}`

### Step 6 — Refactor `ManifestService`

**File:** `src/discovery/manifest.service.ts`

1. Import `OnEventMetadata`, `EmitEventMetadata`, `OnRequestReplyMetadata` instead of `OnEventOptions`, `EmitEventOptions`, `OnRequestReplyOptions`.

2. Replace `buildOnEventEntry`, `buildEmitEventEntry`, `buildOnRequestReplyEntry` methods with calls to the builder from Step 5, or inline simplified logic that uses `metadata.eventType`.

3. Remove `extractPayloadSchemaRef` method and move it to the builder — or keep it in ManifestService and pass as callback.

4. Update `buildConsumeEntries` and `buildProduceEntries` to use new metadata types.

**Target:** Keep ManifestService under 200 lines by moving entry-building to the new builder file.

### Step 7 — Update `OnEventExplorer`

**File:** `src/consumer/decorators/on-event.explorer.ts`

1. Import `OnEventMetadata` instead of `OnEventOptions`.

2. Update `tryRegisterHandler`:
   - Read metadata as `OnEventMetadata`
   - Build subject from `metadata.eventType` and `metadata.version`

3. Replace `buildWildcardSubject`:
   ```ts
   private buildWildcardSubject(metadata: OnEventMetadata): string {
     const version = metadata.version ?? '1';
     return `company.*.${metadata.eventType}.v${version}`;
   }
   ```

### Step 8 — Update `EmitEventInterceptor`

**File:** `src/producer/decorators/emit-event-interceptor.ts`

1. Import `EmitEventMetadata` instead of `EmitEventOptions`.

2. Update `EmissionInput` interface to use `EmitEventMetadata`.

3. Update `buildSubject` to use `metadata.eventType`:
   ```ts
   private buildSubject(metadata: EmitEventMetadata, eventContext: EventContext): string {
     const version = metadata.version ?? '1';
     return `company.${eventContext.companyId}.${metadata.eventType}.v${version}`;
   }
   ```

4. Remove `BuildSubjectDto` import and `SubjectBuilder` usage since subject is now built directly from eventType. (Or keep if SubjectBuilder is used elsewhere.)

### Step 9 — Update `OnRequestReplyExplorer`

**File:** `src/consumer/decorators/on-request-reply.explorer.ts`

1. Import `OnRequestReplyMetadata` instead of `OnRequestReplyOptions`.

2. Update `tryRegisterHandler`:
   - Read metadata as `OnRequestReplyMetadata`
   - Use `metadata.eventType` and `metadata.companyId` directly

### Step 10 — Update `EmitEventInput` Interface

**File:** `src/producer/decorators/emit-event-interceptor.ts`

Update `EmissionInput.options` type from `EmitEventOptions` to `EmitEventMetadata` and `EmitEventInput.options` similarly.

### Step 11 — Update Barrel Exports

**File:** `src/consumer/index.ts`
- Add exports for `OnEventMetadata` and `OnRequestReplyMetadata`
- `OnEventOptions` export stays (new version)
- Remove old usage of `OnEventOptions` that included `domain/entity/action`

**File:** `src/producer/index.ts`
- Add export for `EmitEventMetadata`
- `EmitEventOptions` export stays (new version)

### Step 12 — Update All Tests

**Files to update:**

1. `src/consumer/decorators/on-event.decorator.spec.ts`
   - Update all decorator calls from `@OnEvent({ domain, entity, action })` to `@OnEvent('domain.entity.action', { version? })`
   - Add test for `payloadExample` and other rich metadata

2. `src/consumer/decorators/on-request-reply.decorator.spec.ts`
   - Update all decorator calls from `@OnRequestReply({ eventType: '...' })` to `@OnRequestReply('...')`
   - Add test for `payloadExample`

3. `src/producer/decorators/emit-event.decorator.spec.ts`
   - Update all decorator calls from `@EmitEvent({ domain, entity, action })` to `@EmitEvent('domain.entity.action', { version? })`
   - Add test for `payloadExample`

4. `src/consumer/decorators/on-event.explorer.spec.ts`
   - Update all `@OnEvent` decorator usages in test classes
   - Update subject expectations from `company.*.payment.proof.uploaded.v1` (should be same)
   - Add test for rich metadata propagation

5. `src/consumer/decorators/on-request-reply.explorer.spec.ts`
   - Update `@OnRequestReply` calls in test classes
   - Add test for rich metadata propagation

6. `src/producer/decorators/emit-event-interceptor.spec.ts`
   - Update `@EmitEvent` calls
   - Update subject expectations
   - Add test for payloadExample in metadata

7. `src/discovery/manifest.service.spec.ts` (if exists)
   - Update all test cases to use new metadata shape
   - Add test for payloadExample inclusion in manifest entries

### Step 13 — Check and Update `registerHandlerOptions.interface.ts`

**File:** `src/consumer/register-handler-options.interface.ts`

Check if `RegisterHandlerOptions` references any old field names. Update if needed.

### Step 14 — Verify Build and Tests

```bash
npm run build
npm run test
npm run typecheck
npm run lint
```

### Step 15 — Update Documentation

**File:** `docs/event-messaging-convention.md` (or appropriate doc)
- Update decorator usage examples to reflect new signatures
- Document `payloadExample` usage
- Document how eventType replaces domain/entity/action

**File:** `README.md` (if applicable)
- Update decorator examples

### Step 16 — Update `context.md`

After implementation, update `.agent/project-info/context.md` with Task 4 completion notes.

---

## Files Modified (Summary)

| # | File | Change |
|---|------|--------|
| 1 | `src/consumer/decorators/on-event.decorator.ts` | New signature + metadata types |
| 2 | `src/producer/decorators/emit-event.decorator.ts` | New signature + metadata types |
| 3 | `src/consumer/decorators/on-request-reply.decorator.ts` | New signature + metadata types |
| 4 | `src/discovery/dto/manifest-entry-base.dto.ts` | Add `payloadExample` |
| 5 | `src/discovery/manifest-entry.builder.ts` | **NEW** — extracted builder logic |
| 6 | `src/discovery/manifest.service.ts` | Refactor to use builder + new metadata types |
| 7 | `src/discovery/index.ts` | Export builder if public |
| 8 | `src/consumer/decorators/on-event.explorer.ts` | Use `OnEventMetadata`, simplify subject building |
| 9 | `src/producer/decorators/emit-event-interceptor.ts` | Use `EmitEventMetadata`, simplify subject building |
| 10 | `src/consumer/decorators/on-request-reply.explorer.ts` | Use `OnRequestReplyMetadata` |
| 11 | `src/consumer/index.ts` | Export new metadata types |
| 12 | `src/producer/index.ts` | Export new metadata types |
| 13 | `src/consumer/decorators/on-event.decorator.spec.ts` | Update tests |
| 14 | `src/consumer/decorators/on-request-reply.decorator.spec.ts` | Update tests |
| 15 | `src/producer/decorators/emit-event.decorator.spec.ts` | Update tests |
| 16 | `src/consumer/decorators/on-event.explorer.spec.ts` | Update tests |
| 17 | `src/consumer/decorators/on-request-reply.explorer.spec.ts` | Update tests |
| 18 | `src/producer/decorators/emit-event-interceptor.spec.ts` | Update tests |
| 19 | `.agent/project-structure.md` | Add `manifest-entry.builder.ts` entry if under discovery/ |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| ManifestService exceeds 200 lines | Extract builder logic to `manifest-entry.builder.ts` |
| Broken subject patterns after refactor | Verify with existing tests + add new tests for `eventType`-based subjects |
| `BuildSubjectDto` and `SubjectBuilder` may become unused | Remove imports after interceptor refactor if no longer needed; keep if used elsewhere |
| Type safety for `eventType` format | Optional: add a runtime validation function `isValidEventType(str)` that checks `str.split('.').length >= 3` |