# Global Plan — ManifestContributor Pattern (2026-07-03)

## Task Origin

- **TODO File**: `.agent/todos/20260703/20260703-todo-0.md`
- **Task Description**: Implement the `ManifestContributor` pattern for `@cobranza-apps/events-toolkit` so that microservices with dynamically registered handlers (e.g., `ms-db-gateway` with 155 generic CRUD subjects) can contribute entries to the discovery manifest without manual patching.
- **Single Task**: The entire TODO file describes one cohesive task. There is only one task in this TODO file.

---

## Global Pre-Analysis

### Problem Summary
Microservices that register subjects dynamically at runtime currently patch `DiscoveryService.getManifest().consumes` manually after the manifest is built. This causes a lifecycle ordering bug: `DiscoveryService` publishes `platform.service.register.v1` from `onApplicationBootstrap` **before** the patch runs, so the canonical registration event omits dynamic entries.

### Proposed Solution
Introduce a `ManifestContributor` interface and `registerContributor()` API on `DiscoveryService`. Contributors are invoked during `onModuleInit` **before** schema generation and before the registration event is published.

### Technical & Architecture Decisions
1. **Interface placement**: `src/discovery/manifest-contributor.interface.ts` — colocated with discovery types.
2. **Deduplication strategy**: Decorator-scanned entries take priority. Contributor entries are merged after scanning. Duplicates are identified by `subject` (for produces) and by `subject + type` (for consumes) and are skipped.
3. **Lifecycle ordering**: `registerContributor()` is a simple array push. `DiscoveryService.onModuleInit()` invokes all registered contributors during manifest generation. Services inject `DiscoveryService` in their constructors and call `registerContributor(this)` — this occurs before `onModuleInit` because NestJS resolves all providers before lifecycle hooks.
4. **Version bump**: This is a new feature (minor bump: `0.8.0` → `0.9.0`). No breaking changes.
5. **Files affected**:
   - New: `src/discovery/manifest-contributor.interface.ts`
   - New: `src/discovery/discovery.service.spec.ts`
   - New: `docs/examples/manifest-contributor.example.ts`
   - Modified: `src/discovery/discovery.service.ts`
   - Modified: `src/discovery/index.ts`
   - Modified: `src/testing/mock-discovery.service.ts`
   - Modified: `src/testing/index.ts`
   - Modified: `docs/event-discovery-and-service-registry.md`
   - Modified: `CHANGELOG.md`
   - Modified: `package.json`

---

## Execution Overview

| Step | Description | Sub-agent Type |
|------|-------------|--------------|
| 2 | Git Feature Branch Setup | implementer |
| 3 | Version Update (0.8.0 → 0.9.0) | implementer |
| 4.1 | Task 1: Analysis & Planning | architect |
| 4.2 | Task 1: Implementation | implementer |
| 4.3 | Task 1: Code Review | code-reviewer |
| 4.3-fix | Task 1: Fix Review Issues | implementer |
| 4.4 | Task 1: Documentation | docs-specialist |
| 4.5 | Task 1: Verification | architect |
| 4.6 | Task 1: Task Completion | implementer |
| 5 | TODO File Completion & Merge | implementer |

---

## Step 2: Git Feature Branch Setup

- Run `git status`, commit any unstaged files with meaningful message.
- Ensure `.gitignore` compliance (check `node_modules/`, `dist/`, `.events-toolkit/`).
- Switch to `main` branch. If not on main, ask user about merge.
- Create new branch: `feat/manifest-contributor-pattern`.
- Switch to new branch.

## Step 3: Version Update

- Update `package.json` version from `0.8.0` to `0.9.0`.
- Commit: `chore: bump version to 0.9.0`.

---

## Task 1: ManifestContributor Pattern Implementation

### 4.1 Analysis & Planning (architect)

The architect analyzes the TODO, reviews the existing codebase (DiscoveryService, ManifestService, SchemaGenerator, tests, mocks), and generates a detailed per-task implementation plan saved to `.kilo/plans/20260703-manifest-contributor-implementation.md`.

Key analysis points:
- Review `DiscoveryService.onModuleInit` / `onApplicationBootstrap` / `getOrGenerateManifest` interactions.
- Determine exact deduplication algorithm (subject key for produces, subject+type for consumes).
- Plan test coverage for `DiscoveryService` (no spec file currently exists).
- Plan mock updates for `MockDiscoveryService`.
- Plan documentation updates and new example.
- Plan barrel exports and CHANGELOG entry.

### 4.2 Implementation (implementer)

Follow the detailed plan from 4.1. Key deliverables:

1. **New interface** `ManifestContributor`:
   ```typescript
   export interface ManifestContributor {
     contributeConsumes(): ManifestConsumeEntry[];
     contributeProduces(): ManifestProduceEntry[];
   }
   ```

2. **DiscoveryService updates**:
   - Add `private readonly contributors: ManifestContributor[] = []`.
   - Add `registerContributor(contributor: ManifestContributor): void`.
   - Modify `getOrGenerateManifest()` to:
     a. Get base manifest from `ManifestService`.
     b. Collect contributor entries via `contributors.flatMap(c => c.contributeConsumes())` and `contributors.flatMap(c => c.contributeProduces())`.
     c. Merge and deduplicate with decorator-scanned entries.
     d. Return merged manifest.
   - Deduplication logic: create a `Set` of existing keys; for each contributor entry, if key not in set, append it.
   - Ensure contributor entries participate in schema generation (they are included before `schemaGenerator.generateSchemasForManifest()` is called).

3. **Barrel exports**:
   - Export `ManifestContributor` from `src/discovery/index.ts`.
   - `src/index.ts` already re-exports `src/discovery`, so no change needed there.

4. **Tests**:
   - Create `src/discovery/discovery.service.spec.ts`:
     - Test `registerContributor()` adds consume and produce entries.
     - Test deduplication: when decorator-scanned entry and contributor entry share the same subject, result has exactly one entry (decorator wins).
     - Test lifecycle: `onModuleInit` generates manifest including contributors, then calls `schemaGenerator.generateSchemasForManifest()`.
     - Test `getManifest()` returns cached merged manifest on repeated calls.
   - Update existing tests if any break.

5. **Mock updates**:
   - Update `MockDiscoveryService` to support `registerContributor()` with same semantics.
   - Add `contributors` array and merge logic in `generateManifest()` / `getManifest()`.
   - Ensure `MockDiscoveryService` deduplicates the same way as the real service.

6. **Example**:
   - Create `docs/examples/manifest-contributor.example.ts` showing a service that implements `ManifestContributor` and registers itself with `DiscoveryService`.

7. **Documentation**:
   - Add `ManifestContributor` section to `docs/event-discovery-and-service-registry.md`.
   - Document usage, deduplication behavior, and migration from manual patching.

8. **CHANGELOG**:
   - Add `[0.9.0]` entry with `Added` bullets for `ManifestContributor`, `registerContributor`, deduplication, and example.

### 4.3 Code Review (code-reviewer)

Review the implementation against the plan from 4.1. Check:
- Interface correctness and type safety.
- Deduplication logic correctness (edge cases: empty arrays, multiple contributors, same subject different type).
- Test coverage completeness (happy path, dedup, lifecycle, mock parity).
- No commented-out code.
- Self-documenting code (clear variable names).
- Max 2 params, max 2 depth, max 50 lines per method, max 200 lines per file.
- Documentation accuracy.

Generate fix plan `.kilo/plans/20260703-manifest-contributor-fix.md` if needed.

### 4.3-fix Fix Review Issues (implementer)

Apply fixes from the code review fix plan. Max 3 review cycles. Escalate to user on repeated failures.

### 4.4 Documentation (docs-specialist)

- Add JSDoc/TSDoc to `ManifestContributor` interface and `registerContributor` method.
- Update `docs/event-discovery-and-service-registry.md` with:
  - New section: "ManifestContributor — Dynamic Entries".
  - Interface definition.
  - `registerContributor` usage pattern.
  - Deduplication behavior explanation.
  - Migration note from manual patching.
  - Cross-links to example file.
- Ensure example file `docs/examples/manifest-contributor.example.ts` has inline comments and follows conventions.
- Verify all new public symbols are exported via barrel files and documented.

### 4.5 Verification (architect)

- Verify all plan steps were completed.
- Run `npm run test`, `npm run typecheck`, `npm run lint` to confirm no regressions.
- Report any deviations from the implementation plan.
- If deviations are not acceptable, propose changes in a new TODO file.

### 4.6 Task Completion (implementer)

- Mark task in TODO file with `[DONE]`:
  - For this TODO format (Pattern B: `# Title` → `## Heading`), append `[DONE]` to the `## Task` section title.
- Preserve original content; only add `[DONE]` mark.
- Commit changes with meaningful message.

---

## Step 5: TODO File Completion

- Rename TODO file to `20260703-todo-0-DONE.md` (do not delete or change content).
- Ensure all changes are committed in the feature branch.
- Merge `feat/manifest-contributor-pattern` into `main`:
  1. Switch to `main`.
  2. Merge feature branch.
     - On success: delete feature branch.
     - On failure: notify user.
- If `origin` remote is set, push `main` to `origin` ONLY. Do NOT push to other remotes. Notify user on failure.

---

## Continuation

After completion, the next step is to run the full test suite and lint across all modules as noted in `context.md`.
