# Plan — Update NPM Publish Workflow (Task 1)

- **Date:** 2026-06-22
- **Target file:** `.github/workflows/npm-publish.yml`
- **Scope:** Single-file CI workflow modification. No `src/` changes.
- **Package:** `@cobranza-apps/events-toolkit` (current local version `0.7.3`)

## 1. Task Summary

Modify `.github/workflows/npm-publish.yml` to:

1. **Trigger change** — replace `on.pull_request` (types: `[closed]`, branches: `[main]`) with `on.push` to the `main` branch. Remove the `github.event.pull_request.merged == true` condition from the `publish` job `if`.
2. **Version validation** — add a step before "Publish to NPM" that queries the NPM registry for the latest published version, compares it to the local `package.json` version, and skips publish + release steps when they match.
3. **Preserve** existing behavior for `vars.PREVENT_PUBLISH`, `.npmrc` setup, `npm ci`, `npm run build`, `npm publish`, GitHub Release creation, and `permissions`.

## 2. Pre-Analysis

### 2.1 Current State (verified)

File `.github/workflows/npm-publish.yml` (52 lines):
- `name: Publish Package to NPM`
- `description`: references pull-request-merged trigger.
- Trigger: `on.pull_request` -> `types: [closed]`, `branches: [main]`.
- Job `publish`:
  - `if: github.event.pull_request.merged == true && vars.PREVENT_PUBLISH != 'true'`
  - `runs-on: ubuntu-latest`
  - `permissions: contents: write`
  - Steps (in order):
    1. `actions/checkout@v4`
    2. `actions/setup-node@v4` (node `22.14.0`, registry `https://registry.npmjs.org/`)
    3. "Set up .npmrc" — validates `NPM_PUBLISHER_TOKEN`, copies `.npmrc.sample` -> `.npmrc`, sed-replaces `YOUR_AUTH_TOKEN`.
    4. "Install dependencies" — `npm ci`
    5. "Build" — `npm run build`
    6. "Publish to NPM" — `npm publish --access ...` (public/restricted via `vars.PRIVATE_PUBLISH`)
    7. "Get package version" — reads `package.json` version into `GITHUB_OUTPUT` (`id: get_version`)
    8. "Create GitHub Release" — `softprops/action-gh-release@v1` using `steps.get_version.outputs.PACKAGE_VERSION`

### 2.2 Package Facts (verified from `package.json`)

- `name`: `@cobranza-apps/events-toolkit`
- `version`: `0.7.3`
- `publishConfig.access`: `public`

### 2.3 Design Decisions

- **Skip mechanism**: Use a step output `should_publish` (`true`/`false`) and add `if: steps.check_version.outputs.should_publish == 'true'` to the three steps that must be skipped on version match ("Publish to NPM", "Get package version", "Create GitHub Release"). This is the idiomatic GitHub Actions approach and avoids `exit 1` (which would mark the job failed).
- **Failure tolerance for `npm view`**: Use `npm view @cobranza-apps/events-toolkit version 2>/dev/null || echo ""`. When the package is not yet published (404) or the registry is unreachable, `PUBLISHED_VERSION` becomes empty -> treated as "not published yet" -> `should_publish=true`. This is fail-safe: a real duplicate-publish attempt is rejected by NPM itself (`npm publish` errors on identical version), so no destructive side effect.
- **Placement**: Insert the version-check step between "Build" and "Publish to NPM". Build always runs (verifies compilation); only publish/release are conditional. `.npmrc` is already configured by this point, so `npm view` uses the correct registry/auth.
- **`description` field**: Update wording to reflect the new push trigger (consistency with trigger change). This is a non-offitional top-level key already present in the file; updating it keeps the file self-consistent.
- **Preserved verbatim**: checkout, setup-node, .npmrc setup, npm ci, build, publish command, get-version step logic, release action + env, permissions.

### 2.4 Edge Cases Handled

| Scenario | `npm view` result | `PUBLISHED_VERSION` | `should_publish` | Outcome |
|---|---|---|---|---|
| First publish (package not on registry) | exit != 0 (E404) | `""` | `true` | Publish + release proceed |
| Local version == published version | `0.7.3` | `0.7.3` | `false` | Publish + release skipped; job succeeds |
| Local version != published version | `0.7.2` | `0.7.2` | `true` | Publish + release proceed |
| Registry unreachable (transient) | exit != 0 | `""` | `true` | Proceeds; NPM rejects if duplicate (safe) |

## 3. High-Level Approach

1. Edit the trigger block (`on:`) — swap `pull_request` for `push`.
2. Edit the `publish` job `if:` — drop the merged-PR condition, keep `PREVENT_PUBLISH`.
3. Insert the "Check published version" step after "Build".
4. Add `if` guards to "Publish to NPM", "Get package version", "Create GitHub Release".
5. Update the `description` line wording.
6. Validate YAML locally (lint/parse).
7. Commit.

## 4. Detailed Steps

### Step 4.1 — Update the `description` line (line 2)

**Before:**
```yaml
description: This workflow publishes the package to NPM when a pull request is merged into the main branch.
```

**After:**
```yaml
description: This workflow publishes the package to NPM when a push is made to the main branch.
```

### Step 4.2 — Replace the trigger block (lines 4-8)

**Before:**
```yaml
on:
  pull_request:
    types: [closed]
    branches:
      - main
```

**After:**
```yaml
on:
  push:
    branches:
      - main
```

### Step 4.3 — Update the `publish` job `if` condition (line 12)

**Before:**
```yaml
    if: github.event.pull_request.merged == true && vars.PREVENT_PUBLISH != 'true'
```

**After:**
```yaml
    if: vars.PREVENT_PUBLISH != 'true'
```

### Step 4.4 — Insert "Check published version" step after "Build"

Insert immediately after the existing "Build" step (`run: npm run build`) and before "Publish to NPM".

**New step:**
```yaml
      - name: Check published version
        id: check_version
        shell: bash
        run: |
          LOCAL_VERSION=$(node -p "require('./package.json').version")
          PUBLISHED_VERSION=$(npm view @cobranza-apps/events-toolkit version 2>/dev/null || echo "")
          if [ -z "$PUBLISHED_VERSION" ]; then
            echo "Package not published yet. Proceeding with publish."
            echo "should_publish=true" >> $GITHUB_OUTPUT
          elif [ "$PUBLISHED_VERSION" = "$LOCAL_VERSION" ]; then
            echo "Published version ($PUBLISHED_VERSION) matches local version ($LOCAL_VERSION). Skipping publish."
            echo "should_publish=false" >> $GITHUB_OUTPUT
          else
            echo "Published version ($PUBLISHED_VERSION) differs from local version ($LOCAL_VERSION). Proceeding with publish."
            echo "should_publish=true" >> $GITHUB_OUTPUT
          fi
```

**Notes:**
- `node -p "require('./package.json').version"` reads the local version directly (no extra dependency).
- `2>/dev/null` suppresses NPM error output (e.g., `npm ERR! code E404`).
- `|| echo ""` guarantees a non-failing exit code so the step never fails on a missing package.
- `$(...)` strips trailing newlines, so version strings compare cleanly.

### Step 4.5 — Add `if` guard to "Publish to NPM"

**Before:**
```yaml
      - name: Publish to NPM
        run: npm publish --access ${{ vars.PRIVATE_PUBLISH == 'true' && 'restricted' || 'public' }}
```

**After:**
```yaml
      - name: Publish to NPM
        if: steps.check_version.outputs.should_publish == 'true'
        run: npm publish --access ${{ vars.PRIVATE_PUBLISH == 'true' && 'restricted' || 'public' }}
```

### Step 4.6 — Add `if` guard to "Get package version"

**Before:**
```yaml
      - name: Get package version
        id: get_version
        run: echo "PACKAGE_VERSION=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
```

**After:**
```yaml
      - name: Get package version
        id: get_version
        if: steps.check_version.outputs.should_publish == 'true'
        run: echo "PACKAGE_VERSION=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
```

### Step 4.7 — Add `if` guard to "Create GitHub Release"

**Before:**
```yaml
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ steps.get_version.outputs.PACKAGE_VERSION }}
          name: Release ${{ steps.get_version.outputs.PACKAGE_VERSION }}
          body: "Release of version ${{ steps.get_version.outputs.PACKAGE_VERSION }}"
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**After:**
```yaml
      - name: Create GitHub Release
        if: steps.check_version.outputs.should_publish == 'true'
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ steps.get_version.outputs.PACKAGE_VERSION }}
          name: Release ${{ steps.get_version.outputs.PACKAGE_VERSION }}
          body: "Release of version ${{ steps.get_version.outputs.PACKAGE_VERSION }}"
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 5. Complete Resulting File

Full contents of `.github/workflows/npm-publish.yml` after all steps:

```yaml
name: Publish Package to NPM
description: This workflow publishes the package to NPM when a push is made to the main branch.

on:
  push:
    branches:
      - main

jobs:
  publish:
    if: vars.PREVENT_PUBLISH != 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22.14.0"
          registry-url: "https://registry.npmjs.org/"
      - name: Set up .npmrc
        run: |
          if [ -z "$NPM_PUBLISHER_TOKEN" ]; then
            echo "NPM_PUBLISHER_TOKEN secret is missing!"
            exit 1
          fi
          cp .npmrc.sample .npmrc
          sed -i "s|YOUR_AUTH_TOKEN|$NPM_PUBLISHER_TOKEN|g" .npmrc
        shell: bash
        env:
          NPM_PUBLISHER_TOKEN: ${{ secrets.NPM_PUBLISHER_TOKEN }}
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Check published version
        id: check_version
        shell: bash
        run: |
          LOCAL_VERSION=$(node -p "require('./package.json').version")
          PUBLISHED_VERSION=$(npm view @cobranza-apps/events-toolkit version 2>/dev/null || echo "")
          if [ -z "$PUBLISHED_VERSION" ]; then
            echo "Package not published yet. Proceeding with publish."
            echo "should_publish=true" >> $GITHUB_OUTPUT
          elif [ "$PUBLISHED_VERSION" = "$LOCAL_VERSION" ]; then
            echo "Published version ($PUBLISHED_VERSION) matches local version ($LOCAL_VERSION). Skipping publish."
            echo "should_publish=false" >> $GITHUB_OUTPUT
          else
            echo "Published version ($PUBLISHED_VERSION) differs from local version ($LOCAL_VERSION). Proceeding with publish."
            echo "should_publish=true" >> $GITHUB_OUTPUT
          fi
      - name: Publish to NPM
        if: steps.check_version.outputs.should_publish == 'true'
        run: npm publish --access ${{ vars.PRIVATE_PUBLISH == 'true' && 'restricted' || 'public' }}
      - name: Get package version
        id: get_version
        if: steps.check_version.outputs.should_publish == 'true'
        run: echo "PACKAGE_VERSION=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
      - name: Create GitHub Release
        if: steps.check_version.outputs.should_publish == 'true'
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ steps.get_version.outputs.PACKAGE_VERSION }}
          name: Release ${{ steps.get_version.outputs.PACKAGE_VERSION }}
          body: "Release of version ${{ steps.get_version.outputs.PACKAGE_VERSION }}"
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 6. Verification

### 6.1 YAML syntax validation

Run a YAML parse check locally (PowerShell):

```powershell
# Option A — Python (if available)
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/npm-publish.yml',encoding='utf-8')); print('YAML OK')"

# Option B — Node-based npx yaml-lint (requires network)
npx --yes yaml-lint .github/workflows/npm-publish.yml
```

**Expected:** `YAML OK` (or a passing lint) with no parse errors.

### 6.2 Diff review

```powershell
git diff .github/workflows/npm-publish.yml
```

Confirm exactly these changes and nothing else:
- `description` wording updated.
- `on:` block is `push` -> `branches` -> `main` (no `pull_request`).
- `if:` line no longer references `github.event.pull_request.merged`.
- New "Check published version" step present between "Build" and "Publish to NPM".
- `if: steps.check_version.outputs.should_publish == 'true'` present on "Publish to NPM", "Get package version", and "Create GitHub Release".
- All other steps/fields unchanged.

### 6.3 Local shell-logic sanity check (optional)

Simulate the comparison logic outside CI:

```powershell
# Verify npm view behavior for the real package
npm view @cobranza-apps/events-toolkit version
```

**Expected:** prints `0.7.3` (or current published version). If unreachable, the `|| echo ""` path is exercised.

## 7. Git Actions (for implementer step 4.2)

- This plan only defines the changes. The implementer sub-agent will:
  1. Apply the edits to `.github/workflows/npm-publish.yml`.
  2. Run YAML validation (section 6.1).
  3. `git add .github/workflows/npm-publish.yml`
  4. Commit: `ci: trigger npm publish on push to main and skip on version match`
- No `src/` files affected. No dependency changes. No version bump (workflow-only change).

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `npm view` transient failure causes redundant publish attempt | NPM rejects re-publish of identical version; job fails safely without side effects. Acceptable per task's "tolerate failure" requirement. |
| Push to `main` without version bump triggers skip | Intended behavior — avoids duplicate publishes/releases. Developers must bump `package.json` version before pushing to `main` to trigger a publish. |
| `GITHUB_OUTPUT` append mode | Standard pattern; `>>` appends correctly. |
| Scoped package registry resolution | `.npmrc` configured before the check step; `actions/setup-node` sets `registry-url`. Resolved. |

## 9. Out of Scope

- No changes to `package.json`, `src/`, `.npmrc.sample`, or other workflows.
- No changes to secrets or repo variables (`NPM_PUBLISHER_TOKEN`, `PREVENT_PUBLISH`, `PRIVATE_PUBLISH`).
- No new dependencies or GitHub Actions versions.
- No documentation files (handled in step 4.4 if required).
