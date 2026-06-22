# Global Plan — Update npm-publish.yml Trigger and Add Version Validation

## Task

Update `.github/workflows/npm-publish.yml` to run on push to the `main` branch (instead of on merged pull requests) and add a validation step that compares the local `package.json` version against the latest published version on NPM, skipping the publish if they match.

## Pre-Analysis

- Current trigger is `pull_request` `closed` on `main` with a `merged` check.
- Desired trigger is `push` to `main`.
- Package name: `@cobranza-apps/events-toolkit`.
- Validation can use `npm view <pkg> version` and compare with `require('./package.json').version`.
- If the package has never been published, `npm view` will fail; the validation should treat that as a new version and proceed.
- The `PREVENT_PUBLISH` variable check should be preserved.

## Steps

### Step 2: Git Feature Branch Setup
- Sub-agent: `implementer`
- Ensure `main` is clean, create branch `feat/update-npm-publish-trigger-and-version-check`.

### Step 3: Version Update
- Sub-agent: `implementer`
- Bump patch version in `package.json` (this is a CI/workflow improvement).
- Commit: `chore: bump version to x.y.z`.

### Task 1: Update npm-publish.yml

#### 4.1 Analysis and Planning
- Sub-agent: `architect`
- Analyze exact YAML changes needed, edge cases for version comparison, and draft the detailed implementation plan.
- Save detailed plan to `.kilo/plans/20260622-update-npm-publish-workflow-task1.md`.

#### 4.2 Implementation
- Sub-agent: `implementer`
- Apply the approved plan to `.github/workflows/npm-publish.yml`:
  1. Replace `on.pull_request` with `on.push` to `main`.
  2. Remove `github.event.pull_request.merged == true` job condition.
  3. Add a step before "Publish to NPM" that:
     - Runs `npm view @cobranza-apps/events-toolkit version` (tolerate failure for first publish).
     - Compares the published version with `package.json` version.
     - Sets an output or environment variable to indicate whether publishing should proceed.
  4. Make "Publish to NPM" and subsequent release steps conditional on the new version check.
- Commit with meaningful messages.

#### 4.3 Code Review
- Sub-agent: `code-reviewer`
- Review the workflow changes for correctness, security, and plan adherence.
- If fixes needed, generate a fix plan and assign to `implementer` (max 3 cycles).

#### 4.4 Documentation
- Sub-agent: `docs-specialist`
- Update any relevant docs describing the publish process if they exist.

#### 4.5 Verification
- Sub-agent: `architect`
- Verify the workflow file syntax and logic; ensure all plan items are addressed.

#### 4.6 Task Completion
- Sub-agent: `implementer`
- Mark task as `[DONE]` in the TODO file and commit.

### Step 5: TODO File Completion
- Sub-agent: `implementer`
- Rename TODO file with `-DONE` suffix, merge feature branch into `main`, and push to `origin` if configured.

## Constraints
- Follow `.kilo/rules/tool-selection-priority.md`.
- Follow [Gitignore Compliance Rule](../.kilo/rules/gitignore-compliance.md).
- Only push to `origin` remote.
