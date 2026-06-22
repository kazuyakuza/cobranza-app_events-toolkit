# Global Plan — Dependency Upgrade Review

**Date:** 2026-06-22
**TODO:** `.agent/todos/20260622/20260622-todo-0.md`
**Branch:** `feat/dependency-upgrades`

---

## Global Pre-Analysis

The `package.json` contains dependencies that are significantly behind their latest compatible versions:

- `better-sqlite3` is at `^9.6.0` while latest stable is `12.11.1` (3 major versions behind).
- `jest` ecosystem is at v29 while v30 is available.
- `@typescript-eslint` is at v6 while v8 is available.
- `eslint` is at v8.0.0 while v8.57.0 is the last v8 line (v9+ requires flat-config migration).
- `uuid` is at v10 while v14 is available.
- `@types/uuid` is a deprecated stub — `uuid` now provides its own types.
- `class-validator` cannot advance to `0.15.x` because `class-validator-jsonschema@5.1.0` peer-dep only allows `^0.14.0`.

The project runs on **Node.js >= 20** with **TypeScript 5.x**, **nodenext** module resolution, and **NestJS 11.x**. This modern baseline makes most upgrades safe.

---

## Task Pre-Analysis

### Upgrade Scope

| Category | Dependency | Current | Target | Notes |
|----------|-----------|---------|--------|-------|
| **Runtime** | `better-sqlite3` | `^9.6.0` | `^12.11.1` | API-stable; SQLite engine updates only. Node 20+ supported. |
| **Runtime** | `winston` | `^3.0.0` | `^3.19.0` | Patch/minor within v3. Safe. |
| **Runtime** | `uuid` | `^10.0.0` | `^14.0.1` | ESM-first but retains CJS exports. Project uses `nodenext`, so compatible. |
| **Runtime** | `reflect-metadata` | `^0.2.2` | `^0.2.2` | Already latest. No change. |
| **Dev** | `@jest/globals` | `^29.7.0` | `^30.4.1` | Match jest 30. |
| **Dev** | `@nestjs/testing` | `^11.0.0` | `^11.1.27` | Patch within v11. Safe. |
| **Dev** | `@types/better-sqlite3` | `^7.0.0` | `^7.6.13` | Type definitions only. Safe. |
| **Dev** | `@types/jest` | `^29.0.0` | `^30.0.0` | Match jest 30. |
| **Dev** | `@types/node` | `^20.0.0` | `^22.0.0` | Conservative bump to Node 22 LTS types. |
| **Dev** | `@types/uuid` | `^10.0.0` | **REMOVE** | Deprecated stub; `uuid` provides own types. |
| **Dev** | `@typescript-eslint/eslint-plugin` | `^6.0.0` | `^8.61.1` | Requires ESLint `^8.57.0` or `^9+`. |
| **Dev** | `@typescript-eslint/parser` | `^6.0.0` | `^8.61.1` | Same as above. |
| **Dev** | `eslint` | `^8.0.0` | `^8.57.0` | **Last v8 compatible with `.eslintrc.js`** (v9+ requires flat-config migration). |
| **Dev** | `eslint-config-prettier` | `^9.0.0` | `^10.1.8` | Safe. |
| **Dev** | `eslint-plugin-prettier` | `^5.0.0` | `^5.5.6` | Safe. |
| **Dev** | `jest` | `^29.0.0` | `^30.0.0` | Major; breaking changes are config defaults and removed aliases. Explicit configs in repo shield us. No deprecated aliases found in tests. |
| **Dev** | `prettier` | `^3.0.0` | `^3.8.4` | Safe. |
| **Dev** | `rimraf` | `^5.0.0` | `^6.1.3` | Requires Node 20+. Compatible. |
| **Dev** | `ts-jest` | `^29.0.0` | `^29.4.11` | v29 supports jest 30. Safe. |
| **Dev** | `typescript` | `^5.0.0` | `^5.9.3` | Jest 30 requires TS >= 5.4. TS 6 is available but brand-new; staying on latest 5.x is safer for a library. |
| **Peer** | `@nestjs/common` | `^11.0.0` | `^11.0.0` | Range already covers latest. No change needed. |
| **Peer** | `@nestjs/core` | `^11.0.0` | `^11.0.0` | Range already covers latest. No change needed. |
| **Peer** | `@nestjs/microservices` | `^11.0.0` | `^11.0.0` | Range already covers latest. No change needed. |
| **Peer** | `class-transformer` | `^0.5.0` | `^0.5.1` | Minimum bump to latest patch. |
| **Peer** | `class-validator` | `^0.14.0` | `^0.14.0` | **HELD BACK** — `class-validator-jsonschema@5.1.0` peer-dep blocks `0.15.x`. |
| **Peer** | `class-validator-jsonschema` | `^5.0.0` | `^5.1.0` | Safe. Still peer-depends on `class-validator ^0.14.0`. |
| **Peer** | `nats` | `^2.0.0` | `^2.29.3` | Still v2. Package is deprecated (moved to `@nats-io/transport-node`) but functionally stable. |

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| Jest 30 breaking changes | Explicit `moduleFileExtensions` and `testRegex` in configs override new defaults. No deprecated aliases found in tests. |
| ESLint v8.57.0 + @typescript-eslint v8 | Verified compatible: `@typescript-eslint@8.61.1` peer-dep accepts `eslint ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0`. No flat-config migration needed. |
| uuid v14 ESM-first | Project uses `nodenext` module resolution and Node >=20. CJS exports are still present. Low risk. |
| better-sqlite3 v12 API changes | Changelog shows only SQLite engine bumps and build fixes. No documented API breaks. |
| class-validator held back | Documented in plan. No action required. |

---

## Execution Steps

### Step 2 — Git Feature Branch Setup
**Agent:** `implementer`
- Commit any unstaged work.
- Checkout `main`.
- Create and switch to branch `feat/dependency-upgrades`.

### Step 3 — Version Update
**Agent:** `implementer`
- Bump `package.json` version from `0.7.1` → `0.7.2` (patch bump for dependency maintenance).
- Commit: `chore: bump version to 0.7.2`.

### Task: Dependency Upgrade

#### 4.1 — Analysis & Planning
**Agent:** `architect`
- Confirm no hidden constraints (e.g., CI images, deployment pipelines).
- Verify `package-lock.json` regeneration strategy.
- Produce per-dependency upgrade justification.
- Save detailed plan to `.kilo/plans/20260622-dependency-upgrade.md`.

#### 4.2 — Implementation
**Agent:** `implementer`
1. Edit `package.json` applying all upgrades from the table above.
2. Remove `@types/uuid` from `devDependencies`.
3. Run `npm install` to regenerate `package-lock.json`.
4. Run `npm run typecheck` — fix any type errors (e.g., `@types/node` changes, uuid type changes).
5. Run `npm run lint` — fix any lint issues.
6. Run `npm run build` — verify compilation.
7. Run `npm test` — fix any test failures (jest 30 changes).
8. Run `npm run test:e2e` if NATS is available; otherwise note skip.
9. Commit all changes with message: `chore: upgrade dependencies to latest compatible versions`.

#### 4.3 — Code Review
**Agent:** `code-reviewer`
- Review `package.json` changes for correctness.
- Verify `package-lock.json` was regenerated (not manually edited).
- Check that `@types/uuid` was removed, not just ignored.
- Check that `class-validator` was **not** bumped past `0.14.x`.
- Verify build, lint, and test outputs.
- If issues found: write fix plan to `.kilo/plans/20260622-dependency-upgrade-fix.md` and assign to implementer.

#### 4.4 — Documentation
**Agent:** `docs-specialist`
- Update `.agent/project-info/tech.md` dependency table to reflect new versions.
- Add a brief note in `docs/` or `README.md` about the Node >=20 requirement if not already prominent.

#### 4.5 — Verification
**Agent:** `architect`
- Confirm all upgrades from the plan are applied.
- Confirm no `.gitignore`-matching files are staged.
- Confirm all tests pass and build succeeds.
- Commit any remaining unstaged files.

#### 4.6 — Task Completion
**Agent:** `implementer`
- Append `[DONE]` to the task heading in `.agent/todos/20260622/20260622-todo-0.md`.
- Mark any sub-items as done.
- Commit: `chore: mark dependency upgrade task as done`.

### Step 5 — TODO File Completion
**Agent:** `implementer`
- Rename TODO file to `20260622-todo-0-DONE.md`.
- Merge `feat/dependency-upgrades` into `main`.
- Delete feature branch after successful merge.
- Push `main` to `origin` only.

### Step 6 — Continuation
- No further TODOs expected for this file.

---

## Notes

- **ESLint v9+ / Flat Config:** The plan intentionally keeps ESLint at `^8.57.0` (last v8) to avoid a mandatory `.eslintrc.js` → `eslint.config.js` migration. If the user wants ESLint 10 + flat config, that should be a separate task.
- **TypeScript 6:** TS 6.0.3 is available but very new. The plan stays on TS 5.9.3 (latest 5.x) for stability. Upgrading to TS 6 can be done later once the ecosystem stabilizes.
- **NATS deprecation:** `nats@2.29.3` is deprecated in favor of `@nats-io/transport-node`. Migrating to the new package is a breaking change for consumers and is out of scope for this maintenance task.
