# Global Plan — Upgrade NestJS from v10 to v11

## Request
Upgrade the `events-toolkit` library from NestJS v10 to v11, ensuring compatibility and passing all tests.

## Pre-Analysis (Global)

This is a **library** (not an application) with NestJS packages declared as `peerDependencies`. The key impacts of the v10→v11 migration are:

1. **Node.js v20+ required** (was v16/v18)
2. **Module resolution algorithm** changed from deep-hash to object-reference deduplication — affects dynamic modules heavily used by this library and its tests
3. **Lifecycle hook destroy order** now reverses init order — minor risk for services using `OnModuleDestroy`
4. **Reflector type inference** improvements — no impact since `getAllAndMerge`/`getAllAndOverride` are not used
5. **Express v5 / Fastify v5** changes — irrelevant; this library uses `@nestjs/microservices` with NATS only
6. **Cache/Config/Terminus** module changes — not used in this project

The upgrade is low-risk for this codebase because the library has no HTTP layer and does not use the affected subsystems.

## Steps

### Step 2: Git Feature Branch Setup
- Check git status, commit any unstaged changes
- Create and switch to branch `feat/nestjs-v11-upgrade`

### Step 3: Version Update
- Bump `package.json` version (patch or minor per semver)
- Commit as `chore: bump version to x.y.z`

### Task 1: Upgrade NestJS to v11

#### Task 1 Pre-Analysis
- This task involves updating dependency versions, reinstalling packages, and verifying the build/test suite passes under NestJS v11.
- The main risk areas are: (a) module resolution algorithm change affecting tests with `Test.createTestingModule`, and (b) potential type/compiler issues from `@nestjs/testing` v11.
- No new files are expected; only `package.json` modifications and possible test config adjustments.

#### Task 1: 4.1 Analysis & Planning
- Review current `package.json` for all NestJS-related deps
- Confirm NestJS v11 release notes for any additional microservices-specific changes
- Generate detailed implementation plan saved to `.kilo/plans/20260618-task1-nestjs-v11-upgrade.md`

#### Task 1: 4.2 Implementation
- Update `peerDependencies`:
  - `@nestjs/common`: `^10.0.0` → `^11.0.0`
  - `@nestjs/core`: `^10.0.0` → `^11.0.0`
  - `@nestjs/microservices`: `^10.0.0` → `^11.0.0`
- Update `devDependencies`:
  - `@nestjs/testing`: `^10.0.0` → `^11.0.0`
- Update `engines.node`: `>=18.0.0` → `>=20.0.0`
- Run `npm install` to regenerate `package-lock.json`
- Commit changes

#### Task 1: 4.3 Code Review
- Review `package.json` changes for correctness
- Check if any test files fail due to module resolution algorithm change
- If failures occur, generate fix plan and apply via implementer

#### Task 1: 4.4 Documentation
- Update `README.md` if Node.js version requirement is documented there
- Update any docs mentioning NestJS version compatibility

#### Task 1: 4.5 Verification
- Run `npm test` — all tests must pass
- Run `npm run lint` — no new lint errors
- Run `npm run typecheck` — no type errors
- Run `npm run build` — build succeeds
- Verify `package-lock.json` is clean and committed

#### Task 1: 4.6 Task Completion
- Append `[DONE]` to the task in the TODO file
- Commit as `feat: upgrade NestJS to v11`

### Step 5: TODO File Completion
- Rename TODO file to `20260618-todo-0-nestjs-v11-upgrade-DONE.md`
- Merge feature branch into `main`
- Push `main` to `origin`

## Constraints
- All source code must remain in `src/` folder
- Respect max 200 lines per file, max 50 lines per method, max 2 depth, max 2 params
- Preserve existing code structures and functionality
- No Express/Fastify-specific changes needed
- Do not modify NATS transport configuration
