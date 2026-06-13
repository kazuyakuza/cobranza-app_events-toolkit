# Global Plan: Initialize Project Info and Update README

## Date: 2026-06-12
## TODO File: `.agent/todos/20260611/20260611-todo-0.md`

---

## Global Pre-Analysis

**Project**: `cobranza-apps/events-toolkit` — a NestJS library for NATS+JetStream event handling across the Cobranza App platform.

**Current State**:
- `brief.md` exists and is well-defined with detailed project scope, objectives, and technical decisions.
- `product.md`, `context.md`, `architecture.md`, `tech.md` are **missing** from `.agent/project-info/`.
- `README.md` still contains the **base project template** content (generic AI-agent driven development template), not the project-specific README.
- `src/` directory is empty (only `.gitkeep`).
- `package.json` does not exist.
- `project-structure.md` shows no folders in `src/`.

**Goal**: Complete the project info initialization and update the README with project-specific documentation.

---

## Task 1: Initialize Project Info

### Pre-Analysis
This task requires creating the missing core project info files (`product.md`, `context.md`, `architecture.md`, `tech.md`) based on the existing `brief.md` and the `docs/event-messaging-convention.md` document. The Architect sub-agent will analyze the project requirements and generate the missing files.

### Steps

#### Step 2: Git Feature Branch Setup
- Sub-agent: `implementer`
- Create branch `feat/initialize-project-info-and-readme`

#### Step 3: Version Update
- No version file exists (no `package.json`). Skip this step.

#### Task 1: 4.1 Analysis & Planning
- Sub-agent: `architect`
- Analyze `brief.md` and `docs/event-messaging-convention.md`
- Generate detailed implementation plan for creating the 4 missing project info files
- Save plan to `.kilo/plans/20260612-task1-initialize-project-info.md`

#### Task 1: 4.2 Implementation
- Sub-agent: `implementer`
- Create `product.md` — Core user experience, problem definition, and product goals for the events toolkit
- Create `context.md` — Current work focus, recent changes, and immediate next steps
- Create `architecture.md` — System architecture, paths, design patterns, and critical paths for the library
- Create `tech.md` — Stack, development setup, technical constraints, and tool usage patterns
- Update `.agent/project-info/.initialized` to remove the default marker

#### Task 1: 4.3 Code Review
- Sub-agent: `code-reviewer`
- Review project info files for consistency, accuracy, and alignment with `brief.md`
- Generate fix plan if needed

#### Task 1: 4.3-fix (if needed)
- Sub-agent: `implementer`
- Apply fixes from code review

#### Task 1: 4.4 Documentation
- Sub-agent: `docs-specialist`
- Ensure all files are properly formatted and cross-referenced
- Add links in `AGENTS.md` if needed

#### Task 1: 4.5 Verification
- Sub-agent: `implementer`
- Verify all 4 files exist and are consistent with `brief.md`
- Verify `.initialized` is updated

#### Task 1: 4.6 Task Completion
- Sub-agent: `implementer`
- Append `[DONE]` to "initialize project info" in TODO file
- Commit with meaningful message

---

## Task 2: Update README File

### Pre-Analysis
This task requires replacing the base project template README with a project-specific README for the `events-toolkit` library. The README should cover: installation, usage, examples, architecture overview, and developer guidelines. The Docs Specialist will lead this task.

### Steps

#### Task 2: 4.1 Analysis & Planning
- Sub-agent: `architect`
- Analyze existing `brief.md` and project info for README content
- Generate detailed implementation plan for README rewrite
- Save plan to `.kilo/plans/20260612-task2-update-readme.md`

#### Task 2: 4.2 Implementation
- Sub-agent: `implementer`
- Rewrite `README.md` with project-specific content:
  - Project title and description
  - Installation and setup
  - Usage examples (Producer, Consumer, Request-Reply, Outbox)
  - Architecture overview
  - Subject builder usage
  - Event envelope examples
  - Guidelines for AI Agents
  - Contributing section

#### Task 2: 4.3 Code Review
- Sub-agent: `code-reviewer`
- Review README for accuracy, completeness, and alignment with project info
- Generate fix plan if needed

#### Task 2: 4.3-fix (if needed)
- Sub-agent: `implementer`
- Apply fixes from code review

#### Task 2: 4.4 Documentation
- Sub-agent: `docs-specialist`
- Ensure README formatting is correct and all links work

#### Task 2: 4.5 Verification
- Sub-agent: `implementer`
- Verify README is complete and accurate

#### Task 2: 4.6 Task Completion
- Sub-agent: `implementer`
- Append `[DONE]` to "update readme file" in TODO file
- Commit with meaningful message

---

## Step 5: TODO File Completion

- Sub-agent: `implementer`
- Rename TODO file to `20260611-todo-0-DONE.md`
- Ensure all changes are committed in feature branch
- Merge `feat/initialize-project-info-and-readme` into `main`
- Delete feature branch

---

## Step 6: Continuation

- Check for remaining TODO files
- If any, propose user to proceed in new chat
