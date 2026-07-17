# Global Plan: Remove STREAM_NAME_PREFIX from buildStreamName

## Overview

The `buildStreamName()` utility currently prepends `auto-` to every auto-generated JetStream stream name via the `STREAM_NAME_PREFIX` constant. This prefix serves no purpose because the auto-generated manifest does not include it, leading to inconsistency between stream names and manifest entries. This plan removes the prefix entirely and updates all affected tests and documentation.

## Pre-Analysis

### Technical Decisions
- Remove `STREAM_NAME_PREFIX` constant from `src/consumer/build-stream-name.util.ts`.
- Update `buildStreamName()` to return the sanitized subject directly, without prefix.
- Update all test expectations in `src/consumer/stream-auto-creator.spec.ts` to match the new unprefixed names.
- Update `CHANGELOG.md` with an entry documenting this removal under the current or next version.

### Files Affected
- `src/consumer/build-stream-name.util.ts` — remove prefix constant and update function.
- `src/consumer/stream-auto-creator.spec.ts` — update test expectations for `buildStreamName` and stream creation assertions.
- `CHANGELOG.md` — add change entry.

## Global Plan Steps

1. **Step 2: Git Feature Branch Setup** → implementer
2. **Step 3: Version Update** → implementer (if needed, likely patch/minor bump)
3. **Task 1: Remove STREAM_NAME_PREFIX and update tests**
   - **4.1 Analysis & Planning** → architector
   - **4.2 Implementation** → implementer
   - **4.3 Code Review & Simplification** → code-reviewer & code-simplifier; then implementer for fixes
   - **4.4 Documentation** → docs-specialist (JSDoc/comments if needed)
   - **4.5 Verification** → architector
   - **4.6 Task Completion** → implementer
4. **Task 2: Update CHANGELOG.md**
   - **4.1 Analysis & Planning** → architector
   - **4.2 Implementation** → implementer
   - **4.3 Code Review & Simplification** → code-reviewer & code-simplifier; then implementer for fixes
   - **4.4 Documentation** → docs-specialist
   - **4.5 Verification** → architector
   - **4.6 Task Completion** → implementer
5. **Step 5: TODO File Completion** → implementer

## Notes
- The user explicitly stated "Remember to update changelog", so CHANGELOG update is a required task.
- No new dependencies or APIs are required; this is a purely internal code cleanup.
