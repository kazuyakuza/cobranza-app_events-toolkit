# Global Plan — Refactor Decorator Options + Comprehensive Documentation Overhaul

**Source TODO:** `.agent/todos/20260629/20260629-todo-0.md`
**Branch:** `feat/refactor-decorator-options-and-docs`
**Version Bump:** Minor (`0.7.4` → `0.8.0`) — breaking type changes for decorator options

---

## Pre-Analysis

### Scope Summary

The TODO contains 6 sub-tasks. Tasks 1–5 are tightly coupled code changes (type refactor + tests + immediate doc updates). Task 6 is a large, independent documentation overhaul. To keep the workflow practical, they are grouped into **two execution tasks**:

- **Task A — Refactor Decorator Options** (covers TODO Tasks 1–5)
- **Task B — Comprehensive Documentation Overhaul** (covers TODO Task 6)

### Technical Decisions

- **Type changes are breaking** for consumers: `version`, `description`, and `payloadExample` become required in decorator option interfaces. This justifies a **minor version bump**.
- `ManifestEntryBuilder` can safely drop `??` fallbacks for `version` and `description` because the type system now guarantees their presence. `tags` remains optional, so its `?? []` fallback is preserved.
- All decorator spec tests must be updated atomically with the interface changes to avoid compilation failures.
- `ManifestEntryBuilder` currently has **zero** spec coverage; a new spec file must be created.
- Documentation updates must happen in two waves: (A) immediate fixes for decorator signatures/examples, and (B) full onboarding-flow rewrite.

### Files Potentially Modified

**Task A:**
- `src/producer/decorators/emit-event.decorator.ts`
- `src/consumer/decorators/on-event.decorator.ts`
- `src/consumer/decorators/on-request-reply.decorator.ts`
- `src/discovery/manifest-entry.builder.ts`
- `src/producer/decorators/emit-event.decorator.spec.ts`
- `src/consumer/decorators/on-event.decorator.spec.ts`
- `src/consumer/decorators/on-request-reply.decorator.spec.ts`
- `src/discovery/manifest-entry.builder.spec.ts` (new)
- `docs/event-messaging-convention.md`
- `docs/event-discovery-and-service-registry.md`
- `CHANGELOG.md`

**Task B:**
- `README.md`
- `docs/ai-agent-guidelines.md`
- `docs/event-messaging-convention.md`
- `docs/event-discovery-and-service-registry.md`
- `docs/request-reply-patterns.md`
- `docs/request-reply-guidelines.md`
- `docs/outbox-configuration.md`
- `docs/outbox-usage-guidelines.md`
- `docs/outbox-transactional-usage.md`
- `docs/testing-utilities.md`
- `docs/examples/*.ts`
- `src/**/*.ts` (JSDoc/TSDoc additions)
- `.agent/project-info/*.md` (if stale)

---

## Execution Steps

### Step 2 — Git Feature Branch Setup
**Agent:** `implementer`
- Ensure `main` is clean; commit any unstaged work.
- Create and switch to `feat/refactor-decorator-options-and-docs`.

### Step 3 — Version Update
**Agent:** `implementer`
- Bump `package.json` version to `0.8.0`.
- Commit: `chore: bump version to 0.8.0`.

---

## Task A — Refactor Decorator Options

### A.1 Analysis & Planning
**Agent:** `architect`
- Confirm exact diff for each interface change.
- Identify every call site in the codebase that constructs `EmitEventOptions`, `OnEventOptions`, or `OnRequestReplyOptions` without required fields (including tests and docs examples).
- Draft the new `manifest-entry.builder.spec.ts` test plan.
- Produce detailed per-file edit instructions and save as `.kilo/plans/20260629-task-a-refactor-decorator-options.md`.

### A.2 Implementation
**Agent:** `implementer`
- Apply decorator option interface changes (make `version`, `description`, `payloadExample` required where applicable).
- Update `ManifestEntryBuilder` to remove `??` fallbacks for `version` and `description`.
- Update all decorator spec files to pass required fields.
- Create `manifest-entry.builder.spec.ts` with coverage for all three builder methods + `tags` fallback.
- Update `docs/event-messaging-convention.md` Section 4.1 options table.
- Update `docs/event-discovery-and-service-registry.md` code examples to include required fields.
- Update `CHANGELOG.md` with breaking changes.
- Run `npm run build` and `npm test` to verify no compilation or test failures.
- Commit with meaningful messages.

### A.3 Code Review
**Agent:** `code-reviewer`
- Review all changes from A.2 against the architect plan.
- Check that no `??` fallback remains for `version`/`description`.
- Check that `tags` fallback is preserved.
- Verify tests pass and new spec has adequate coverage.
- If issues found, generate `.kilo/plans/20260629-task-a-fix.md` and assign to implementer.

### A.4 Documentation (Refactor-Specific)
**Agent:** `docs-specialist`
- Add JSDoc updates to the three decorator files and `ManifestEntryBuilder` if needed.
- Ensure doc files updated in A.2 have consistent formatting.

### A.5 Verification
**Agent:** `architect`
- Confirm implementation matches the plan from A.1.
- Report any deviations and whether they are acceptable.

### A.6 Task Completion
**Agent:** `implementer`
- Add `[DONE]` to Task A lines in the TODO file (append to relevant `###` headings).
- Commit.

---

## Task B — Comprehensive Documentation Overhaul

### B.1 Analysis & Planning
**Agent:** `architect`
- Read every doc file in scope and audit against the 11-step onboarding flow defined in the TODO.
- Identify gaps, stale signatures, missing cross-links, and JSDoc gaps across `src/`.
- Produce a prioritized change list and save as `.kilo/plans/20260629-task-b-docs-overhaul.md`.

### B.2 Implementation
**Agent:** `implementer`
- Rewrite/add README **Quickstart** section at the top.
- Audit and improve all `docs/*.md` files following the onboarding flow.
- Add JSDoc/TSDoc to every exported symbol in `src/` (classes, interfaces, methods, decorators) with `@param` and `@returns` where applicable.
- Add cross-links between related doc files.
- Commit with meaningful messages.

### B.3 Code Review
**Agent:** `code-reviewer`
- Review doc changes for accuracy, broken links, and stale code examples.
- Verify JSDoc coverage on exported symbols.
- If issues found, generate `.kilo/plans/20260629-task-b-fix.md` and assign to implementer.

### B.4 Documentation
**Agent:** `docs-specialist`
- Final pass on tone, formatting, and consistency across all markdown files.
- Ensure onboarding flow is clearly represented.

### B.5 Verification
**Agent:** `architect`
- Confirm the 11-step onboarding flow is complete across the doc surface.
- Confirm every exported symbol in `src/` has JSDoc.
- Confirm README Quickstart section exists.

### B.6 Task Completion
**Agent:** `implementer`
- Add `[DONE]` to Task B lines in the TODO file.
- Commit.

---

## Step 5 — TODO File Completion
**Agent:** `implementer`
- Rename `.agent/todos/20260629/20260629-todo-0.md` to `.agent/todos/20260629/20260629-todo-0-DONE.md`.
- Merge `feat/refactor-decorator-options-and-docs` into `main`.
- Push `main` to `origin` only.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Type changes break internal test compilation | Update all specs atomically in Task A.2 |
| Doc rewrite scope is very large | Architect produces prioritized list; implementer tackles high-impact files first |
| JSDoc coverage on ~70 source files is tedious | Use B.1 audit to identify files with zero/missing JSDoc; batch similar files |
| Merge conflicts on `main` | Step 2 ensures branch is created from latest `main`; rebase if needed before Step 5 |

---

## Approval Options

1. **Approve Global and Task Plans** — execute A.1 and B.1 planning, then auto-approve per-task plans and proceed with implementation.
2. **Approve Global Plan Only** — execute A.1 and B.1 planning, then present per-task plans for individual approval.
