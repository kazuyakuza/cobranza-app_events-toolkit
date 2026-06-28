# Plan: Fix EventsToolkitModule Export Bug — Task 2 (Documentation & Changelog)

## Task Reference
- TODO: `.agent/todos/20260627/20260627-todo-0.md` → Task 4 "Changelog and Documentation"
- Global plan: `.kilo/plans/20260627-fix-module-export-bug.md`
- Task 1 (fix) plan: `.kilo/plans/20260627-fix-module-export-bug-task1.md`
- Current version: `0.7.4` (already bumped by Step 3 of Critical Workflow)

## Pre-Analysis

### What was fixed (Task 1)
- Removed the redundant `exports` arrays from `EventsToolkitModule.forRoot()` and `forRootAsync()`.
- The module previously listed `exports: [ProducerService, ConsumerService, OutboxService, EventLoggerService, DiscoveryService]` while only `EventLoggerService` was declared in its own `providers`. The other four tokens are providers of the imported sub-modules.
- NestJS 11's `Module.validateExportedProvider` rejected this, causing `nest start` and `Test.createTestingModule` to fail with "Nest cannot export a provider/module that is not a part of the currently processed module (EventsToolkitModule)".
- Because `ProducerModule`, `ConsumerModule`, `OutboxModule`, and `DiscoveryModule` are all `global: true` (and `EventsToolkitModule` itself is `global: true`), every one of those providers is already available application-wide. Removing the `exports` array is both valid and non-breaking for consumers.

### API impact
- **Public API unchanged.** Consumers continue to inject `ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, and `DiscoveryService` via constructor DI exactly as before — the global DI registry still provides them.
- No code changes required in any dependent microservice (e.g. `ms-db-gateway`).
- No runtime behavioural change beyond "startup now succeeds on NestJS 11".

### Docs review findings
- Searched `docs/*.md` and `README.md` for any statement that `EventsToolkitModule` exports / re-exports the affected services.
- **No documentation claims that `EventsToolkitModule` exports those services.** The docs only describe `forRoot` / `forRootAsync` registration and injection of the services directly.
- Conclusion: no doc file's content becomes incorrect due to the fix. No factual correction needed in `docs/*.md`.
- Optional improvements only:
  - `README.md` "Related Documentation" section currently lacks a CHANGELOG link — add it once `CHANGELOG.md` exists.

### CHANGELOG format
- Adopt [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 1.1.0 conventions.
- Adherence to [Semantic Versioning](https://semver.org/).
- No previous `CHANGELOG.md` exists — this Task creates the file with its initial entry.
- First entry covers the `0.7.4` patch release describing the bug fix and upgrade notes.
- Earlier history is omitted on purpose for this initial file; future releases will append forward.

## High-Level Approach
1. Create a new `CHANGELOG.md` at repository root using Keep a Changelog structure.
2. Document the `0.7.4` release under a `Fixed` entry with a clear description, root cause, symptoms, and zero-action upgrade notes.
3. Add a CHANGELOG link in `README.md`'s "Related Documentation" list.
4. No edits to any `docs/*.md` file (none reference the removed exports).
5. Commit the new file and the README link with a `docs:` message.

## Detailed Steps

### Step 1 — Create `CHANGELOG.md` (repository root)
- Path: `CHANGELOG.md`
- Exact content:

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.4] - 2026-06-27

### Fixed

- Fixed a NestJS 11 module compilation failure in `EventsToolkitModule.forRoot()` and `EventsToolkitModule.forRootAsync()`. The module previously declared an `exports` array containing `ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, and `DiscoveryService`, but only `EventLoggerService` was declared in the module's own `providers` array. The remaining tokens belong to the imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`).
- NestJS 11 introduced stricter provider-export validation (`Module.validateExportedProvider`), which rejects exporting a token that is neither declared in the module's own `providers` nor directly re-exported from an `imports` entry. This caused production startup (`nest start`) and test compilation (`Test.createTestingModule`) to fail with: `Nest cannot export a provider/module that is not a part of the currently processed module (EventsToolkitModule)`.
- Removed the redundant `exports` arrays from both `forRoot()` and `forRootAsync()`. Because `ProducerModule`, `ConsumerModule`, `OutboxModule`, and `DiscoveryModule` are all registered with `global: true` (and `EventsToolkitModule` itself is `global: true`), their providers remain available application-wide through the global DI registry. The `exports` array was both invalid and functionally redundant.

### Upgrade Notes

- **No code changes are required for consumers.** Continue to inject `ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, and `DiscoveryService` via constructor dependency injection as before.
- Services remain available application-wide; nothing in the public API or consumption pattern changed.
- If you depend on `EventsToolkitModule` explicitly re-exporting those services (non-standard), switch to injecting them directly — they are globally available.
```

### Step 2 — Add CHANGELOG link to `README.md`
- Path: `README.md`
- Target: the "Related Documentation" list.
- Insert a new bullet as the first item of the list (before the convention entry).
- Exact change: prepend `- [Changelog](CHANGELOG.md) — Notable release changes and upgrade notes`

### Step 3 — No `docs/*.md` edits
- Confirmed via search: no `docs/*.md` file asserts that `EventsToolkitModule` exports the affected services. Therefore no doc file content is invalidated by the fix.
- Do not modify `docs/ai-agent-guidelines.md`, `docs/event-discovery-and-service-registry.md`, `docs/outbox-configuration.md`, or any other doc for this task.

### Step 4 — Commit
- Commit message: `docs: add CHANGELOG.md and document 0.7.4 module export fix`
- Do NOT push to any remote (handled later by the Critical Workflow completion step, which pushes to `origin` only).

## Verification (Definition of Done for Task 2)
- [ ] `CHANGELOG.md` exists at repository root with the Keep a Changelog header and a `[0.7.4] - 2026-06-27` section containing the `Fixed` and `Upgrade Notes` entries shown above.
- [ ] `README.md` "Related Documentation" section contains a new link to `CHANGELOG.md`.
- [ ] No `docs/*.md` file was modified for this task.
- [ ] No source files in `src/` were modified for this task.
- [ ] Changes are committed on the feature branch with a meaningful message; no push performed.

## Out of Scope
- Adding historical entries for releases prior to `0.7.4` (initial CHANGELOG covers only the current release).
- Any source code or test changes (handled by Task 1).
- Pushing to `origin` or any remote (handled by the Critical Workflow Step 5 / TODO completion step).
