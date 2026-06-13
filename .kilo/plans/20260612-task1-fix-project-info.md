# Fix Plan — Task 1: Initialize Project Info

## Review Date
2026-06-12

## Issues Found

### Issue 1: Missing `outbox.module.ts` in `architecture.md` component tree
- **File**: `.agent/project-info/architecture.md`
- **Location**: Component tree under `outbox/` (lines 62-64)
- **Problem**: `OutboxModule` is exported in the public API but `outbox.module.ts` is not listed in the component tree.
- **Fix**: Add `outbox.module.ts` to the component tree under `outbox/`.
- **Rationale**: `brief.md` section 5 lists `OutboxModule` as a main module. The component tree must reflect all files that exist in the module.

### Issue 2: Missing `event.factory.ts` in `architecture.md` component tree
- **File**: `.agent/project-info/architecture.md`
- **Location**: Component tree under `common/utils/` (lines 42-44)
- **Problem**: `createEvent` is exported from `./common/utils/event.factory` but `event.factory.ts` is not listed.
- **Fix**: Add `event.factory.ts` to the component tree under `common/utils/`.
- **Rationale**: `brief.md` section 6 mentions `createEvent<T>(options)` as a core component. The component tree must reflect all files that exist in the module.

### Issue 3: Unsupported extrapolation in `product.md`
- **File**: `.agent/project-info/product.md`
- **Location**: Line 5
- **Problem**: "Platform: Cobranza App (debt collection SaaS)" — `brief.md` does not describe the platform as "debt collection SaaS".
- **Fix**: Remove "(debt collection SaaS)" or replace with "(Cobranza App platform)" to match brief.md.
- **Rationale**: `brief.md` is the source of truth. Do not add unsupported descriptions.

### Issue 4: Minor deviation — `generateUuidV7` export not in brief.md
- **File**: `.agent/project-info/architecture.md`
- **Location**: Public API export line 188
- **Problem**: `generateUuidV7` is exported but `brief.md` section 6 does not list it as a core component.
- **Fix**: Either add `generateUuidV7` to `brief.md` section 6 or remove it from the public API in `architecture.md`.
- **Rationale**: Public API exports should match the core components listed in the source of truth.

### Issue 5: `tech.md` package.json build script
- **File**: `.agent/project-info/tech.md`
- **Location**: package.json example, scripts section
- **Problem**: `"build": "tsc"` may not be sufficient for a NestJS library with decorators.
- **Fix**: Consider `"build": "nest build"` or a proper library build configuration.
- **Rationale**: NestJS libraries typically use `@nestjs/cli` or a proper build pipeline for decorator compilation.

### Issue 6: ASCII diagram formatting in `architecture.md`
- **File**: `.agent/project-info/architecture.md`
- **Location**: Line 11
- **Problem**: Inconsistent spacing in box drawing characters.
- **Fix**: Re-align the ASCII art boxes so `events-toolkit` labels have consistent padding.
- **Rationale**: Proper formatting for readability.

## Fix Plan Summary

| # | File | Change | Priority |
|---|------|--------|----------|
| 1 | `architecture.md` | Add `outbox.module.ts` to component tree | High |
| 2 | `architecture.md` | Add `event.factory.ts` to component tree | High |
| 3 | `product.md` | Remove "(debt collection SaaS)" | Medium |
| 4 | `architecture.md` | Resolve `generateUuidV7` export | Low |
| 5 | `tech.md` | Update package.json build script | Low |
| 6 | `architecture.md` | Fix ASCII diagram spacing | Low |

## Note on brief.md
`brief.md` section 4 (folder structure) is missing `outbox.module.ts` and `event.factory.ts` despite mentioning them in sections 5 and 6. This is an internal inconsistency in the source of truth. Since the brief.md is the source of truth, the implementer should also update brief.md section 4 to include these files, or the architecture.md should align with the textual descriptions in sections 5-6.
