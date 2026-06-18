# Task 1 — Implementation Plan: NestJS v10 → v11 Upgrade

- **TODO file**: `.agent/todos/20260618/20260618-todo-0-nestjs-v11-upgrade.md` (task: "Upgrade NestJS to v11")
- **Global plan**: `.kilo/plans/20260618-nestjs-v11-upgrade.md`
- **Feature branch**: `feat/nestjs-v11-upgrade`
- **Plan author**: Architect sub-agent (Critical Workflow step 4.1)
- **Date**: 2026-06-18

---

## 1. Scope

Upgrade the `events-toolkit` NestJS library from NestJS v10 to v11:

1. Bump NestJS peer dependencies (`@nestjs/common`, `@nestjs/core`, `@nestjs/microservices`) `^10.0.0` → `^11.0.0`.
2. Bump NestJS dev dependency (`@nestjs/testing`) `^10.0.0` → `^11.0.0`.
3. Bump Node.js engine requirement `>=18.0.0` → `>=20.0.0`.
4. Reinstall dependencies and regenerate `package-lock.json`.
5. Verify the full suite passes under v11 (typecheck, lint, unit tests, build).
6. Apply contingency fixes only if a verification gate fails.
7. Update documentation that references the v10/Node-18 baseline.

**Out of scope of this task** (handled by other Critical Workflow steps):
- Package `version` field bump (Critical Workflow Step 3 — Version Update).
- Git branch creation (Critical Workflow Step 2 — already on `feat/nestjs-v11-upgrade`).
- Removing the unused `@nestjs/microservices` peer dependency (see §7 — future cleanup).

---

## 2. Key Findings (evidence-based)

### 2.1 Current NestJS dependency inventory (`package.json`)
| Section | Package | Current | Target |
|---|---|---|---|
| peerDependencies | `@nestjs/common` | `^10.0.0` | `^11.0.0` |
| peerDependencies | `@nestjs/core` | `^10.0.0` | `^11.0.0` |
| peerDependencies | `@nestjs/microservices` | `^10.0.0` | `^11.0.0` |
| devDependencies | `@nestjs/testing` | `^10.0.0` | `^11.0.0` |
| engines | `node` | `>=18.0.0` | `>=20.0.0` |

NestJS packages are **peer-only** (not duplicated in `devDependencies`); modern npm (v9+, ships with Node 20) auto-installs peers, so the dev/test environment resolves v11 automatically after the bump.

### 2.2 NestJS v11 requirements (verified via Context7 `/nestjs/nest/v11.1.16`)
- **Node.js `>= 20`** (source: `nest/package.json` `engines.node` + `CONTRIBUTING.md`). → forces `engines.node` bump.
- **TypeScript 5.9.3** used internally; compilation **target `ES2021`** (source: `nest/tsconfig.json`). This project's `tsconfig.json` already uses `target: "ES2021"` and `skipLibCheck: true`, so consuming v11 type definitions is safe regardless of the local TS patch version.
- **`Reflector.getAllAndOverride` still exists** in v11 (source: `sample/19-auth-jwt/src/auth/auth.guard.ts`). The project does **not** use `getAllAndMerge`/`getAllAndOverride`, so Reflector type-inference changes have no impact.
- **`Reflector`** remains exported from `@nestjs/core` in v11; the project imports it from `@nestjs/core` (9 files) — unchanged.
- **`Test.createTestingModule`** API is unchanged in v11 (source: multiple v11 integration specs). The ~14 spec files using it require no signature changes.
- **Durable providers** is an **additive** v11 feature (source: `packages/common/interfaces/modules/provider.interface.ts`) — no breaking impact.

### 2.3 Actual NestJS API surface used by this library
Sourced from a full `grep` of `src/` for `from '@nestjs/(common|core)'` and `@nestjs/microservices`:

- **`@nestjs/common`**: `DynamicModule`, `Module`, `Provider`, `Type`, `ForwardReference`, `InjectionToken`, `Injectable`, `Inject`, `Optional`, `Controller`, `Get`, `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy`, `SetMetadata`, `CallHandler`, `ExecutionContext`, `NestInterceptor`.
- **`@nestjs/core`**: `Reflector`, `DiscoveryService`, `MetadataScanner`, `DiscoveryModule`.
- **`@nestjs/testing`**: `Test`.
- **`@nestjs/microservices`**: **NOT imported anywhere in `src/`** (0 matches). It is a declared peerDependency only — see §7.

All of these symbols remain available and API-compatible in NestJS v11.

### 2.4 Breaking-change checks against the codebase
| v11 breaking change | Applicable? | Evidence |
|---|---|---|
| Node.js `>= 20` engine floor | **Yes (action)** | `package.json` `engines.node` is `>=18.0.0` → bump to `>=20.0.0`. |
| Wildcard route (`/*`) deprecation | **No** | `DiscoveryController` uses `@Get('manifest')` / `@Get('schemas')` only — no `/*` routes. `grep` for `\*/\*` found only NATS-subscription wildcard comments, not HTTP routes. |
| `Reflector.getAllAndMerge`/`getAllAndOverride` | **No** | Not used (`grep` confirmed only `Reflector` DI injection). |
| `OnModuleDestroy` / destroy-order reversal | **Low** | `OnModuleDestroy` used by `EventsToolkitModule`, `OutboxService`, `DiscoveryService`, `MockDiscoveryService`. Each hook is self-contained (closes owned NATS conn / clears timer / publishes shutdown). No cross-hook ordering dependency. |
| `BeforeApplicationShutdown` / `OnApplicationShutdown` | **No** | Not used (`grep` found 0 matches). |
| `CacheModule` / `ConfigModule` / `TerminusModule` | **No** | Not used. |
| Express v5 / Fastify v5 platform | **No** | Library has no platform entry; `DiscoveryController` uses only `@nestjs/common` decorators. Platform is chosen by the consuming app. |
| `@nestjs/microservices` NATS transport | **No** | `@nestjs/microservices` is not imported; NATS access is via the raw `nats` package (`connect`, `NatsConnection`, `JetStreamClient`). |
| Module-resolution algorithm (object-reference dedup) | **Low** | See §3.2. |

### 2.5 Documentation references to update (for step 4.4)
Files that hardcode the v10 / Node-18 baseline:
- `README.md`: line 7 badge `Node.js-%3E%3E18`; lines 59–61 peer-dep example `^10.0.0`; line 70 `Node.js >= 18`.
- `.agent/project-info/tech.md`: line 7 `Node.js >= 18`; line 9 `NestJS 10.x`; lines 60–61 peer-dep example `^10.0.0`; line 74 `@nestjs/testing ^10.0.0`; line 173 `NestJS 10.x (peer dependency...)`; line 174 `Node.js >= 18.`; line 23 `Node.js >= 18.0.0`.

---

## 3. Risk Assessment

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `engines.node` bump to `>=20` raises the runtime floor for all consuming microservices | Medium (intended) | Required v11 alignment. Document in README + tech.md. Consumers must run Node 20+. |
| R2 | Module-resolution algorithm change (v11 dedups dynamic modules by object reference instead of deep-hash) could surface duplicate-module or unexpected-merge errors in tests that compile a DI container | Low | Test trees are simple: each spec imports `EventsToolkitTestModule.forRoot()` once (no duplicate dynamic-module imports within a single tree). Run `npm test` first; only if a duplicate-module error appears, apply the v11 backward-compat option per the official migration guide (`moduleIdGeneratorAlgorithm: 'deep-hash'` on the affected `Test.createTestingModule` call). **Confirm the exact option name/signature against https://docs.nestjs.com/migration-guide before applying.** |
| R3 | `@typescript-eslint` v6 + TypeScript 5.7+ (resolved by caret `^5.0.0`) emits an "unsupported TypeScript version" warning during `npm run lint` | Low (cosmetic) | `skipLibCheck: true` keeps typecheck clean. If clean lint is required, apply §5.5.2 (bump `@typescript-eslint/*` to v8 + `eslint` to `^8.57.0`, staying on ESLint 8 / no flat-config migration). |
| R4 | `better-sqlite3@^9.6.0` prebuilt binary may be unavailable for the Node 20 ABI used in CI | Low | `better-sqlite3` 9.x ships Node 20 prebuilds. Only if `npm install`/`npm test` fails on native build, bump `better-sqlite3` to `^11.0.0` (stable API). |
| R5 | NestJS peer packages are peer-only; if the dev environment uses an npm config that disables peer auto-install, `@nestjs/*@11` won't be present for tests | Low | Node 20 ships npm 9+ (peer auto-install on by default). Contingency: if tests fail with `Cannot find module '@nestjs/common'`, add `@nestjs/common`, `@nestjs/core`, `@nestjs/microservices` to `devDependencies` at `^11.0.0`. |
| R6 | `@nestjs/microservices` is an unused peer dependency — bumping it to `^11` imposes an unnecessary peer constraint on consumers | Low | Keep at `^11.0.0` for this task (scope discipline). Flag for a future cleanup task (§7). |

**Overall risk: LOW.** No source-code changes are expected. The upgrade is primarily a `package.json` + lockfile + docs change, gated by the existing verification suite.

---

## 4. High-Level Approach

1. **Pre-flight (read-only)**: confirm branch and working-tree state.
2. **Core edits**: update `package.json` peer deps, dev dep, and `engines.node`.
3. **Install**: `npm install` to resolve v11 and regenerate `package-lock.json`.
4. **Verification gates**: `typecheck` → `lint` → `test` → `build`, in order.
5. **Contingency (only on gate failure)**: toolchain alignment (§5.5.2), module-resolution option (§5.5.3), or `better-sqlite3` bump (§5.5.4).
6. **Commit** the core upgrade.
7. **Documentation** (delegated to step 4.4): update `README.md` + `tech.md`.
8. **Final verification** (delegated to step 4.5): re-run all gates; confirm clean lockfile.
9. **Task completion** (delegated to step 4.6): mark TODO `[DONE]`; commit.

---

## 5. Detailed Implementation Steps

### 5.1 Pre-flight (read-only) — Implementer (4.2)
1. Confirm current branch is `feat/nestjs-v11-upgrade`:
   - Command: `git branch --show-current`
2. Confirm working tree is clean or commit pending changes first (per Gitignore Compliance Rule, verify no `node_modules/`, `dist/`, `coverage/` are staged):
   - Command: `git status`
   - If unstaged unrelated changes exist, commit them with a meaningful message before proceeding (do not mix them with the upgrade commit).

### 5.2 Core `package.json` edits — Implementer (4.2)
Edit `C:\projects\cobranza-app\events-toolkit\package.json` using a structured editor (`vscode-mcp-server_replace_lines_code` or `edit`). Apply exactly these changes:

- **Line 43** — `peerDependencies`:
  - Before: `    "@nestjs/common": "^10.0.0",`
  - After:  `    "@nestjs/common": "^11.0.0",`
- **Line 44**:
  - Before: `    "@nestjs/core": "^10.0.0",`
  - After:  `    "@nestjs/core": "^11.0.0",`
- **Line 45**:
  - Before: `    "@nestjs/microservices": "^10.0.0",`
  - After:  `    "@nestjs/microservices": "^11.0.0",`
- **Line 59** — `devDependencies`:
  - Before: `    "@nestjs/testing": "^10.0.0",`
  - After:  `    "@nestjs/testing": "^11.0.0",`
- **Line 77** — `engines`:
  - Before: `    "node": ">=18.0.0"`
  - After:  `    "node": ">=20.0.0"`

Do **not** modify the `version` field (handled by Critical Workflow Step 3).
Do **not** modify `dependencies` or other `devDependencies` in this step.

### 5.3 Install dependencies — Implementer (4.2)
1. Run: `npm install`
   - Expected: `@nestjs/common@11`, `@nestjs/core@11`, `@nestjs/microservices@11` (auto-installed peers), `@nestjs/testing@11` (devDep) are resolved; `package-lock.json` is regenerated.
2. Verify no gitignored dirs got staged (Gitignore Compliance Rule):
   - Command: `git status`
   - Ensure `node_modules/`, `dist/`, `coverage/` are NOT staged. Only `package.json` and `package-lock.json` should appear as modified.

### 5.4 Verification gates — Implementer (4.2) / verify in 4.5
Run each command in order; capture pass/fail. Stop and apply §5.5 contingency on the first failure.

1. **Typecheck**: `npm run typecheck`
   - Acceptance: exits 0, no type errors. (`skipLibCheck: true` mitigates v11 type-def compatibility.)
2. **Lint**: `npm run lint`
   - Acceptance: exits 0. An "unsupported TypeScript version" warning from `@typescript-eslint` is acceptable (cosmetic); any lint **error** triggers §5.5.2.
3. **Unit tests**: `npm test`
   - Acceptance: all suites pass (0 failures). ~14 spec files compile a testing module via `Test.createTestingModule`; these exercise the v11 DI container.
4. **Build**: `npm run build`
   - Acceptance: `dist/` is produced, `tsc -p tsconfig.build.json` exits 0, declaration files generated.

> **e2e tests** (`npm run test:e2e`) require a running NATS server. They are **out of scope** for the automated upgrade verification. Run manually only if a NATS server is available (`docker run -p 4222:4222 nats:latest -js`).

### 5.5 Contingency fixes (apply ONLY if the corresponding gate fails)

#### 5.5.1 If `npm test` fails with `Cannot find module '@nestjs/common'` (or core/microservices)
Peer auto-install is disabled in the local npm config. Add the Nest packages to `devDependencies` at `^11.0.0`:
- Add to `devDependencies` (alphabetical position): `@nestjs/common`, `@nestjs/core`, `@nestjs/microservices` each `^11.0.0`.
- Re-run `npm install`, then re-run `npm test`.

#### 5.5.2 If `npm run lint` errors (or clean lint is required) due to `@typescript-eslint` v6 + TS 5.7+
Bump the ESLint stack while **staying on ESLint 8** (no flat-config migration):
- `devDependencies`:
  - `eslint`: `^8.0.0` → `^8.57.0`
  - `@typescript-eslint/eslint-plugin`: `^6.0.0` → `^8.0.0`
  - `@typescript-eslint/parser`: `^6.0.0` → `^8.0.0`
  - `typescript`: `^5.0.0` → `^5.7.0` (aligns with the v11 era; optional but recommended).
- Run `npm install`, then `npm run lint`. `typescript-eslint` v8 works with ESLint `>=8.57` and supports TS 5.7.
- If `npm run lint` reports config errors, inspect `.eslintrc.js` (the `plugin:@typescript-eslint/recommended` extend remains valid in v8); adjust only the failing rule/config key. Do **not** migrate to flat config in this task.

#### 5.5.3 If `npm test` fails with a duplicate-module / unexpected-module-merge error
The v11 module-resolution algorithm dedups dynamic modules by object reference. Apply the v11 backward-compatibility option to the **affected** `Test.createTestingModule` call only:
- **Before applying**, confirm the exact option name and signature against the official migration guide: https://docs.nestjs.com/migration-guide (the project TODO references `moduleIdGeneratorAlgorithm: 'deep-hash'`).
- Apply to the failing spec file(s) only (e.g., `src/testing/events-toolkit-test.module.spec.ts`), not globally.
- Re-run `npm test`.
- Document each applied site in the commit message.

#### 5.5.4 If `npm install` or `npm test` fails on `better-sqlite3` native build
- `dependencies`: `better-sqlite3`: `^9.6.0` → `^11.0.0` (API-stable; ships Node 20 prebuilds).
- Run `npm install`, then re-run `npm test` and `npm run build`.

### 5.6 Commit the core upgrade — Implementer (4.2)
After all gates pass (with any contingency fixes applied):
1. Stage only the intended files:
   - Command: `git add package.json package-lock.json`
   - If §5.5.2/§5.5.4 were applied, those `package.json` changes are already included — no separate action needed.
   - If §5.5.3 was applied, also stage the modified spec file(s): `git add src/.../<file>.spec.ts`.
2. Verify staged set (Gitignore Compliance Rule):
   - Command: `git status`
3. Commit:
   - Message: `feat: upgrade NestJS from v10 to v11`
   - If contingency fixes were applied, append a body listing them, e.g.:
     ```
     feat: upgrade NestJS from v10 to v11

     - Bump @nestjs/{common,core,microservices} peer deps and @nestjs/testing devDep to ^11.0.0
     - Raise engines.node floor from >=18.0.0 to >=20.0.0
     - [if applied] bump @typescript-eslint to v8 + eslint 8.57
     - [if applied] set moduleIdGeneratorAlgorithm: 'deep-hash' in <spec>
     ```
   - Command: `git commit -m "feat: upgrade NestJS from v10 to v11"` (use a HEREDOC or the editor if a body is needed).

### 5.7 Documentation updates — Docs Specialist (4.4)
Per the Markdown Generation Rule, `README.md` and `.agent/project-info/tech.md` are documentation files editable by the Docs Specialist. Apply:

**`README.md`** (`C:\projects\cobranza-app\events-toolkit\README.md`):
- Line 7 badge: replace `Node.js-%3E%3E18` with `Node.js-%3E%3E20`.
- Lines 59–61 peer-dep example: change `@nestjs/common`, `@nestjs/core`, `@nestjs/microservices` from `^10.0.0` to `^11.0.0`.
- Line 70: change `Node.js >= 18` to `Node.js >= 20`.
- Scan the rest of `README.md` for any other `^10.0.0` / `NestJS 10` / `Node 18` references and update consistently.

**`.agent/project-info/tech.md`** (`C:\projects\cobranza-app\events-toolkit\.agent\project-info\tech.md`):
- Line 7: `Node.js >= 18` → `Node.js >= 20`.
- Line 9: `NestJS 10.x` → `NestJS 11.x`.
- Line 23: `Node.js >= 18.0.0` → `Node.js >= 20.0.0`.
- Lines 60–61 peer-dep example: `@nestjs/common`, `@nestjs/microservices` `^10.0.0` → `^11.0.0` (also set `@nestjs/core` to `^11.0.0` if present).
- Line 74: `@nestjs/testing` `^10.0.0` → `^11.0.0`.
- Line 173: `NestJS 10.x (peer dependency...)` → `NestJS 11.x (peer dependency...)`.
- Line 174: `Node.js >= 18.` → `Node.js >= 20.`

> The Docs Specialist should re-read each file before editing (line numbers may shift) and preserve all unrelated content.

### 5.8 Final verification — Architect (4.5)
1. Re-run the full gate sequence to confirm a clean state:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
2. Confirm all four exit 0.
3. Confirm `package-lock.json` is committed and no gitignored files are staged:
   - `git status`
4. Confirm the TODO task is not yet marked done (done in 4.6).

### 5.9 Task completion — Implementer (4.6)
1. Mark the task done in `.agent/todos/20260618/20260618-todo-0-nestjs-v11-upgrade.md`:
   - Under `### Upgrade NestJS to v11`, append ` [DONE]` to the section title (preserve original content; mark any `[ ]` → `[x]` if present).
2. If documentation (5.7) produced uncommitted changes, commit them:
   - `git add README.md .agent/project-info/tech.md`
   - `git commit -m "docs: reflect NestJS v11 and Node.js 20 baseline"`
3. Commit the TODO mark:
   - `git add .agent/todos/20260618/20260618-todo-0-nestjs-v11-upgrade.md`
   - `git commit -m "chore: mark NestJS v11 upgrade task done"`

---

## 6. Acceptance Criteria

The task is complete when ALL of the following hold:
- [ ] `package.json` peer deps `@nestjs/common`, `@nestjs/core`, `@nestjs/microservices` = `^11.0.0`.
- [ ] `package.json` devDep `@nestjs/testing` = `^11.0.0`.
- [ ] `package.json` `engines.node` = `>=20.0.0`.
- [ ] `package-lock.json` regenerated and committed; no gitignored dirs staged.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0 (cosmetic TS-version warning acceptable).
- [ ] `npm test` exits 0 (all unit suites pass).
- [ ] `npm run build` exits 0 (`dist/` produced).
- [ ] `README.md` and `.agent/project-info/tech.md` reflect v11 + Node 20.
- [ ] TODO task marked `[DONE]` and committed.

---

## 7. Out of Scope / Future Cleanup

- **Remove unused `@nestjs/microservices` peer dependency.** `grep` across `src/` found zero imports of `@nestjs/microservices`; the library talks to NATS via the raw `nats` package. Keeping the peer at `^11.0.0` for this task preserves scope, but a follow-up task should evaluate removing it to reduce the consumer peer-dep burden. (Risk: some consumers may rely on its transitive presence — verify before removing.)
- **ESLint 9 flat-config migration.** Only if §5.5.2 is insufficient; out of scope here.
- **`npm run test:e2e`** (requires NATS server) — run manually if needed; not an automated gate.

---

## 8. Constraints Compliance

- All changes are confined to `package.json`, `package-lock.json`, `README.md`, `.agent/project-info/tech.md`, and (only if §5.5.3 triggers) one or more existing spec files. No new `src/` files. No source-code logic changes expected.
- Max-lines/depth/params rules: not triggered (no source files modified unless §5.5.3).
- Gitignore Compliance: verified via `git status` after every `npm install`.
- Git Remote Safety: no push in this task; branch merge/push handled by Critical Workflow Step 5 (to `origin` only).
- Self-documenting / no-commented-code / prefer-private-members: unaffected (no source edits).
