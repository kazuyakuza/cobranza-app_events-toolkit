# Plan: Rename `GatewayConsumerOptions` → `ModuleConsumerOptions`

**Date:** 2026-07-23  
**TODO:** `.agent/todos/20260723/20260723-todo-1.md`  
**Plan:** `.kilo/plans/20260723-rename-gateway-to-module-consumer-options.md`

---

## Problem

The interface `GatewayConsumerOptions` (and its companion property `gatewayConsumerOpts`) were introduced in v0.14.0. The word **gateway** was inherited from the original TODO which referenced `ms-db-gateway` as the downstream service. This creates an unwanted coupling between the library's public API and a specific microservice name. The name should be decoupled to avoid confusion.

The chosen replacement is **`ModuleConsumerOptions`** — reflecting that these are module-level (root) consumer defaults passed through `EventsToolkitModule.forRoot()`.

The companion property `gatewayConsumerOpts` must be renamed to **`moduleConsumerOpts`** to remain internally consistent.

---

## Scope

### Files to rename
1. `src/consumer/gateway-consumer-options.interface.ts` → `src/consumer/module-consumer-options.interface.ts`

### Files to edit (interface name `GatewayConsumerOptions` → `ModuleConsumerOptions`)
1. `src/consumer/module-consumer-options.interface.ts` (renamed file) — interface declaration
2. `src/consumer/index.ts` — barrel re-export
3. `src/consumer/consumer-opts-merger.ts` — import + 3 parameter/type references
4. `src/consumer/consumer-opts-merger.spec.ts` — import + 10 variable declarations
5. `src/consumer/consumer.module.ts` — import + 1 property type
6. `src/consumer/consumer-module.providers.ts` — 4 property references in factory returns
7. `src/consumer/jetstream-consumer-deps.interface.ts` — import + 1 property type
8. `src/consumer/request-reply-consumer-deps.interface.ts` — import + 1 property type
9. `src/consumer/sync-jetstream-consumer-deps-options.interface.ts` — import + 1 property type
10. `src/consumer/sync-request-reply-consumer-deps-options.interface.ts` — import + 1 property type
11. `src/consumer/jetstream-consumer.service.ts` — import + 1 field + 2 references
12. `src/consumer/request-reply-consumer.service.ts` — import + 1 field + 2 references
13. `src/events-toolkit-options.interface.ts` — 2 JSDoc `{@link}` references
14. `src/events-toolkit.module.ts` — 2 property references

### Files to edit (property name `gatewayConsumerOpts` → `moduleConsumerOpts`)
All 14 files above plus:
- `src/consumer/jetstream-consumer.service.gateway-opts.spec.ts` — 6 occurrences
- `src/consumer/request-reply-consumer.service.gateway-opts.spec.ts` — 5 occurrences

### Files to edit (terminology "gateway-level" → "module-level")
- `src/consumer/jetstream-consumer.service.ts` — 2 JSDoc occurrences
- `src/consumer/request-reply-consumer.service.ts` — 2 JSDoc occurrences
- `src/consumer/consumer-opts-merger.ts` — 1 JSDoc occurrence
- `src/consumer/testing/extract-durable-name.ts` — 1 comment occurrence
- `docs/nats-jetstream-configuration.md` — 1 sentence occurrence
- `CHANGELOG.md` — 4 occurrences
- `.agent/project-structure.md` — 1 occurrence

### Files NOT to edit
- `.kilo/plans/20260722-*.md` — historical plan artifacts (out of scope; they describe past state)
- `.agent/todos/20260722/20260722-todo-1-DONE.md` — historical TODO (out of scope)

---

## Execution Steps

### Step 1: Rename source file
Use `vscode-mcp-server_move_file_code` to rename `gateway-consumer-options.interface.ts` → `module-consumer-options.interface.ts`.

### Step 2: Update all source references
Use `edit` with `replaceAll` for bulk string replacements across each file:
- `GatewayConsumerOptions` → `ModuleConsumerOptions`
- `gatewayConsumerOpts` → `moduleConsumerOpts`
- `gateway-level` → `module-level` (case-insensitive context matching)

### Step 3: Update tests
Same bulk replacements in the two gateway-opts spec files.

### Step 4: Update documentation
- `CHANGELOG.md` — update v0.14.0 entry
- `docs/nats-jetstream-configuration.md` — update "gateway-level" phrasing
- `.agent/project-structure.md` — update consumer folder description

### Step 5: Verification
- `npm run typecheck` — must pass
- `npm run lint` — must pass
- `npm test` — must pass (750 tests)
- `grep -r "GatewayConsumerOptions" src/ docs/ CHANGELOG.md .agent/project-structure.md` — must return empty
- `grep -r "gatewayConsumerOpts" src/ docs/ CHANGELOG.md .agent/project-structure.md` — must return empty
- `grep -r "gateway-level" src/ docs/ CHANGELOG.md .agent/project-structure.md` — must return empty

### Step 6: Commit
Commit all changes with message: `refactor: rename GatewayConsumerOptions to ModuleConsumerOptions`.

---

## Constraints

- **No functional changes** — this is a pure rename.
- **Breaking change:** The interface `GatewayConsumerOptions` was already exported in v0.14.0. Renaming it is a **breaking API change** for any consumer that has already imported it. However, v0.14.0 was just released (2026-07-22) and the downstream `ms-db-gateway` has not yet adopted it. The bump from v0.14.0 → v0.14.1 (patch) is acceptable if we treat this as an immediate correction before adoption. If the project prefers to avoid breaking changes even within 24h, we could keep `GatewayConsumerOptions` as a deprecated alias — but the user explicitly asked to rename, so we proceed with the rename.
- **Do NOT update historical plan files** (`.kilo/plans/20260722-*.md`) — they are frozen records.

---

## Verification Checklist

- [ ] `src/consumer/module-consumer-options.interface.ts` exists
- [ ] `src/consumer/gateway-consumer-options.interface.ts` does not exist
- [ ] `ModuleConsumerOptions` exported from `src/consumer/index.ts`
- [ ] No `GatewayConsumerOptions` in `src/`, `docs/`, `CHANGELOG.md`, `.agent/project-structure.md`
- [ ] No `gatewayConsumerOpts` in `src/`, `docs/`, `CHANGELOG.md`, `.agent/project-structure.md`
- [ ] No `gateway-level` in `src/`, `docs/`, `CHANGELOG.md`, `.agent/project-structure.md`
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes (750 tests)
