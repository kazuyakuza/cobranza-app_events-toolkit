# Dependency Upgrade — Analysis Report

**Date:** 2026-06-22
**Step:** 4.1 Analysis & Planning (Critical Workflow)
**Branch:** `feat/dependency-upgrades`
**Global plan:** `.kilo/plans/20260622-dependency-upgrade.md`
**Scope:** Verify upgrade targets are correct and compatible before implementation (step 4.2).

---

## 1. Project Baseline (verified)

| Item | Value | Source |
|------|-------|--------|
| Node engine floor | `>=20.0.0` | `package.json` engines |
| CI Node version | `22.14.0` | `.github/workflows/npm-publish.yml` (line 21) |
| TS module | `nodenext` / `moduleResolution: nodenext` | `tsconfig.json` |
| Package type | CJS (no `"type"` field) | `package.json` |
| NestJS | 11.x (peer) | `package.json` peerDependencies |
| ESLint config | **Legacy `.eslintrc.js`** | `.eslintrc.js` (`module.exports`, `parser`, `extends`, `ignorePatterns`) |
| Jest configs | Explicit `moduleFileExtensions`, `testRegex`, `transform`, `testEnvironment: 'node'` | `jest.config.js`, `jest.e2e.config.js` |
| Lockfile | `package-lock.json` present (root); CI uses `npm ci` | glob + workflow line 35 |

**CI alignment:** CI runs Node 22.14.0, so bumping `@types/node` to `^22.0.0` is consistent. The `engines: node >=20` floor remains valid (types are a superset; no Node 22-only API is introduced).

---

## 2. Upgrade Target Verification

Each target was checked against the npm registry (engines, peerDependencies, exports, deprecation) and the project's actual usage.

| Dependency | Current | Target | Compatibility verdict |
|-----------|---------|--------|------------------------|
| `better-sqlite3` | `^9.6.0` | `^12.11.1` | OK. engines `20.x \|\| 22.x \|\| 23.x \|\| 24.x \|\| 25.x \|\| 26.x`. API used in repo (`new Database`, `.pragma`, `.exec`, `.prepare().run()`, `.prepare().all()`) is stable across v9 to v12. Native build via `prebuild-install` (prebuilts for Node 20/22). |
| `uuid` | `^10.0.0` | `^14.0.1` | OK. ESM-first (`"type": "module"`) but `exports["."].node` provides CJS `dist-node/index.js`. Under nodenext CJS, `import { v7 as uuidv7 } from 'uuid'` compiles to `require('uuid')` and resolves via the `node` condition. Ships own types (`dist/index.d.ts`). `v7` named export present. |
| `winston` | `^3.0.0` | `^3.19.0` | OK. Minor/patch within v3. Safe. |
| `@jest/globals` | `^29.7.0` | `^30.4.1` | OK. Matches jest 30 (referenced as `^30.4.1` in `ts-jest@29.4.11` devDeps). |
| `@nestjs/testing` | `^11.0.0` | `^11.1.27` | OK. Latest is `11.1.27`. Peer `@nestjs/common ^11`, `@nestjs/core ^11` — matches project peers. |
| `@types/better-sqlite3` | `^7.0.0` | `^7.6.13` | OK. Types only; covers stable v9 to v12 API. |
| `@types/jest` | `^29.0.0` | `^30.0.0` | OK. Latest is exactly `30.0.0`; deps `expect ^30`, `pretty-format ^30`. Range satisfiable. |
| `@types/node` | `^20.0.0` | `^22.0.0` | OK. 22.x line exists; aligns with CI Node 22.14. Range satisfiable. |
| `@types/uuid` | `^10.0.0` | **REMOVE** | OK. `uuid@14` ships own types. Removal eliminates duplicate-type conflict. Code uses only `import { v7 } from 'uuid'`. |
| `@typescript-eslint/eslint-plugin` | `^6.0.0` | `^8.61.1` | OK. Peer `eslint ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0`; `typescript >=4.8.4 <6.1.0`; engines `^18.18 \|\| ^20.9 \|\| >=21.1`. |
| `@typescript-eslint/parser` | `^6.0.0` | `^8.61.1` | OK. Same peers as above (verified on registry). |
| `eslint` | `^8.0.0` | `^8.57.0` | OK. Last v8; keeps `.eslintrc.js` legacy config (no flat-config migration). **Required** — `@typescript-eslint@8` peer minimum is `^8.57.0`. |
| `eslint-config-prettier` | `^9.0.0` | `^10.1.8` | OK. Range satisfiable. |
| `eslint-plugin-prettier` | `^5.0.0` | `^5.5.6` | OK. Latest is `5.5.6`. Peers: `eslint >=8`, `prettier >=3`, `eslint-config-prettier <10 \|\| >=10.1.0` — all satisfied by chosen versions. |
| `jest` | `^29.0.0` | `^30.0.0` | OK. engines `^18.14 \|\| ^20 \|\| ^22 \|\| >=24`. Explicit repo configs override changed defaults. No deprecated aliases in tests (see section 3). |
| `prettier` | `^3.0.0` | `^3.8.4` | OK. Within v3. Safe. |
| `rimraf` | `^5.0.0` | `^6.1.3` | OK. Requires Node 20+. Compatible. |
| `ts-jest` | `^29.0.0` | `^29.4.11` | OK. Peer `jest ^29 \|\| ^30`, `typescript >=4.3 <7`; engines `>=20`. Supports jest 30. |
| `typescript` | `^5.0.0` | `^5.9.3` | OK. Within `@typescript-eslint@8` peer `<6.1.0`. TS 6.x would be blocked by that peer — staying on 5.9.3 is correct. |
| `class-transformer` | `^0.5.0` | `^0.5.1` | OK. Allowed by `class-validator-jsonschema@5.1.0` peer (`^0.4.0 \|\| ^0.5.0`). |
| `class-validator` | `^0.14.0` | `^0.14.0` (HELD) | OK. **Cannot bump to 0.15.x** — `class-validator-jsonschema@5.1.0` peer is `^0.14.0`. Correctly held. |
| `class-validator-jsonschema` | `^5.0.0` | `^5.1.0` | OK. Peers `class-validator ^0.14.0`, `class-transformer ^0.4 \|\| ^0.5`. Both satisfied. |
| `nats` | `^2.0.0` | `^2.29.3` | ADVISORY. Latest is `2.29.3` but **deprecated** (`"Package moved. Use @nats-io/transport-node"`). Install will print a deprecation warning (not a failure). engines `>=14`. Migration out of scope. |
| `reflect-metadata` | `^0.2.2` | `^0.2.2` | OK. Already latest; no change. |

---

## 3. Hidden Constraints Checked

1. **ESLint config type** — `.eslintrc.js` is **legacy eslintrc** format (confirmed: `module.exports`, `parser`, `extends`, `ignorePatterns`). ESLint `^8.57.0` retains legacy support; v9+ would force flat-config migration. Plan correctly holds at v8.57.0.
2. **`@typescript-eslint@8` requires eslint `^8.57.0` minimum** — the bump from `^8.0.0` to `^8.57.0` is therefore **mandatory** (not optional) for the `@typescript-eslint` v8 upgrade. Both must move together in step 4.2. (Plan captures this.)
3. **`@typescript-eslint@8` typescript peer `<6.1.0`** — TypeScript 6.x is blocked. Plan correctly stays on `5.9.3`.
4. **Jest 30 breaking changes** — repo configs explicitly set `moduleFileExtensions`, `testRegex`, `transform`, `testEnvironment: 'node'`, shielding against changed defaults.
5. **Deprecated Jest aliases** — grep over `src/**/*.ts` for `toBeCalled`, `toReturn`, `toReturnValues`, `calledWith`, `toThrowError`, `lastCalledWith`, `toBeCalledTimes` — **no matches**.
6. **`jest.config`/`jasmine` references** in `src` — **no matches**.
7. **`class-validator-jsonschema@5.1.0` peer deps** — verified on registry: `class-validator: ^0.14.0`, `class-transformer: ^0.4.0 || ^0.5.0`. Confirms `class-validator` hold-back and `class-transformer ^0.5.1` are correct.
8. **`uuid@14` CJS under nodenext** — `exports["."].node.default` = `dist-node/index.js` (CJS). Project compiles CJS (no `"type": "module"`), so `import { v7 } from 'uuid'` becomes `require('uuid')` and resolves to the CJS build. Types via `dist/index.d.ts`.
9. **`better-sqlite3@12.11.1` engines** — `20.x || 22.x || 23.x || 24.x || 25.x || 26.x`. Node 20+ and CI Node 22.14 supported. API surface used is unchanged.
10. **`nats@2.29.3` deprecation** — registry `deprecated` field set. `npm install` will warn but succeed. Migration to `@nats-io/transport-node` is a separate breaking task. (Documented, not blocking.)
11. **Lockfile / CI** — `package-lock.json` must be regenerated and committed (CI uses `npm ci`). Captured in plan step 4.2/4.3.
12. **`.kilo/package-lock.json`** exists — not a runtime dependency; out of scope. Noted for awareness only.

---

## 4. Issues / Concerns

- **None blocking.** All targets are satisfiable and compatible with Node >=20, nodenext CJS, NestJS 11, legacy `.eslintrc.js`, and explicit Jest configs.
- **Non-blocking advisories for implementer (step 4.2):**
  - `nats@2.29.3` will emit an npm deprecation warning during `npm install` — expected, not a failure.
  - `better-sqlite3@12` native install: `prebuild-install` fetches prebuilt binaries for Node 20/22; if unavailable for the exact runtime, `node-gyp` requires Python + C++ build tools (Windows local dev). CI (Ubuntu, Node 22.14) has prebuilts.
  - `uuid@14` + nodenext: run `npm run typecheck` and `npm test` to confirm `import { v7 } from 'uuid'` resolves cleanly. Low risk (CJS export condition verified).
  - `@types/node ^22` with engine floor 20: do not introduce Node 22-only APIs (existing code unaffected).
  - `eslint` bump to `^8.57.0` is required (not optional) by `@typescript-eslint@8` peer; ensure both are applied in the same install.

---

## 5. Conclusion

**Upgrade targets are safe to proceed.** The global plan's risk assessment and version table are accurate. The two intentional hold-backs (`class-validator` at 0.14.x; `typescript` at 5.9.3) are justified by verified peer constraints. No source-file changes are required for compatibility (any breakage will surface in `typecheck`/`lint`/`build`/`test` during 4.2 and is expected to be minimal).

**Recommended next step:** proceed to 4.2 Implementation (implementer sub-agent).
