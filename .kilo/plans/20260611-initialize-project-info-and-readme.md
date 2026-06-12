# Global Plan — 20260611-todo-0

**TODO File**: `.agent/todos/20260611/20260611-todo-0.md`
**Date**: 2026-06-11

---

## Global Pre-Analysis

### Project State
- **Project**: `cobranza-apps/events-toolkit` — shared NestJS library for NATS + JetStream event messaging
- **brief.md**: Comprehensive content already defined (purpose, objectives, tech decisions, folder structure, modules, core components, subject builder, examples, outbox strategy)
- **Missing project info files**: `product.md`, `context.md`, `architecture.md`, `tech.md`
- **`.initialized`**: Exists — marks default/uninitialized state
- **README.md**: Contains base template content from `base-project-ai-agent-driven`, not events-toolkit content
- **No `package.json`**: Project root has no `package.json`; version bump (step 3) is N/A
- **Source code**: No `src/` folder exists yet — no code files to analyze for project info generation

### Tasks (Line Items)
1. initialize project info
2. update readme file

---

## Step 2: Git Feature Branch Setup
**Agent**: `implementer`

- Run `git status`; commit unstaged files with meaningful message if any
- Switch to `main` branch
- Create feature branch `feat/initialize-project-info-and-readme`
- Switch to new branch

---

## Step 3: Version Update
**Agent**: `implementer`

- **N/A**: No `package.json` exists at project root. Skip version bump.

---

## Task 1: "initialize project info"

### 4.1 Analysis & Planning
**Agent**: `architect`

**Scope**:
- Analyze existing `brief.md` content to derive content for missing project info files
- Since no `src/` code exists yet, `architecture.md` and `tech.md` derive from `brief.md` decisions
- Plan creation of:
  - `product.md` — user experience, problem definition, product goals
  - `context.md` — current work focus, recent changes, next steps
  - `architecture.md` — system architecture, design patterns, critical paths
  - `tech.md` — stack, development setup, technical constraints
- Plan deletion of `.agent/project-info/.initialized` after all files created
- Save plan to `.kilo/plans/20260611-initialize-project-info.md`

### 4.2 Implementation
**Agent**: `implementer`

- Follow architect's plan to create the 4 project info files
- Delete `.agent/project-info/.initialized`
- Commit with meaningful message

### 4.3 Code Review
**Agent**: `code-reviewer`

- Review created project info files for completeness, consistency with `brief.md`
- Generate fix plan if needed; max 3 review cycles

### 4.4 Documentation
**Agent**: `docs-specialist`

- Ensure project info files are well-documented
- Verify internal cross-references between project info files

### 4.5 Verification
**Agent**: `implementer`

- Verify all 4 project info files exist and have content
- Verify `.initialized` is removed
- Verify content consistency with `brief.md`
- Commit any unstaged files

### 4.6 Task Completion
**Agent**: `implementer`

- Append `[DONE]` to task line in TODO file

---

## Task 2: "update readme file"

### 4.1 Analysis & Planning
**Agent**: `architect`

**Scope**:
- Analyze `brief.md` for content to populate README
- Analyze current README (base template) — identify sections to preserve vs. replace
- Research NestJS library README conventions via webfetch/Context7
- Plan README structure: project overview, installation, usage examples, module breakdown, contributing
- Save plan to `.kilo/plans/20260611-update-readme.md`

### 4.2 Implementation
**Agent**: `implementer`

- Follow architect's plan to rewrite README.md
- Preserve `.kilo/` and `.agent/` structure documentation where still relevant but adapt for events-toolkit
- Commit with meaningful message

### 4.3 Code Review
**Agent**: `code-reviewer`

- Review README for accuracy, completeness, consistency with `brief.md`
- Generate fix plan if needed; max 3 review cycles

### 4.4 Documentation
**Agent**: `docs-specialist`

- Verify README is clear for human developers and AI agents
- Add any missing references to docs/ folder

### 4.5 Verification
**Agent**: `implementer`

- Verify README accurately reflects events-toolkit project
- Verify no base-template remnants remain where inappropriate
- Commit any unstaged files

### 4.6 Task Completion
**Agent**: `implementer`

- Append `[DONE]` to task line in TODO file

---

## Step 5: TODO File Completion
**Agent**: `implementer`

- Rename TODO file: `20260611-todo-0.md` → `20260611-todo-0-DONE.md`
- Ensure all files committed in feature branch
- Merge feature branch to `main`
- Delete feature branch on success
- Push `main` to `origin` ONLY

---

## Step 6: Continuation

- Check remaining TODO files: `20260611-todo-1.md`, `20260611-todo-2.md`
- If any exist, propose user to proceed in new chat
