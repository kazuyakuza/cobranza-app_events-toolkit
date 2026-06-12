# Global Plan – Initialize Project Info & Update README

## Pre-Analysis

- **Current State**: `events-toolkit` project has a well-defined `brief.md` and `docs/event-messaging-convention.md`. The `src/` directory is empty (only `.gitkeep`). Missing `.agent/project-info/` files: `product.md`, `context.md`, `architecture.md`, `tech.md`. `README.md` is still the generic base-project template.
- **Objective**: Create the missing project-info files to complete the AI-agent context system, and rewrite `README.md` to match the `events-toolkit` library scope.
- **Constraints**: No source code exists yet, so architecture and tech docs will be forward-looking based on `brief.md`. All output is markdown. Follow `docs-specialist` for review and writing standards.

## Step 2 – Git Feature Branch Setup

- `main` is master branch.
- Run `git status` and commit any unstaged files.
- Switch to `main`, create branch `feat/initialize-project-info-and-readme`.

## Step 3 – Version Update

- No `package.json` exists yet; version update step is skipped (no version to bump).

---

## Task 1 – Initialize Project Info

### Task 1 – 4.1 Analysis & Planning (Architect)

- Analyze `brief.md`, `docs/event-messaging-convention.md`, and `AGENTS.md`.
- Identify missing `.agent/project-info/` files: `product.md`, `context.md`, `architecture.md`, `tech.md`.
- Plan content for each file based on `brief.md` and project conventions.
- Save per-task plan (optional, can be inline in global plan).

### Task 1 – 4.2 Implementation (Implementer)

- Create `.agent/project-info/product.md`:
  - Core user experience, problem definition, product goals for the toolkit library.
- Create `.agent/project-info/context.md`:
  - Current work focus: project-info initialization and README update.
  - Recent changes: `brief.md` already defined.
  - Immediate next steps: create remaining info files, then start source-code implementation.
- Create `.agent/project-info/architecture.md`:
  - System architecture: NestJS modules, Producer/Consumer/Request-Reply/Outbox.
  - Design patterns: Envelope pattern, builder pattern, decorator pattern.
  - Critical paths: NATS/JetStream connection, event validation, error handling.
- Create `.agent/project-info/tech.md`:
  - Stack: NestJS, TypeScript, NATS/JetStream, class-validator, class-transformer, Winston, SQLite.
  - Dev setup: build, test, lint scripts.
  - Constraints: peerDependencies for NestJS and NATS, no domain payloads.

### Task 1 – 4.3 Code Review (Code Reviewer)

- Review created markdown files for completeness, consistency with `brief.md`, and proper formatting.
- Generate fix plan if needed.
- 4.3-fix: Implementer applies fixes.

### Task 1 – 4.4 Documentation (Docs Specialist)

- Ensure all files have proper markdown structure, headers, and clear language.
- Add JSDoc-style comments where applicable (not applicable for markdown, but check for clarity).

### Task 1 – 4.5 Verification (Implementer)

- Confirm all four missing files exist and are populated.
- Check that `AGENTS.md` links to them (update `AGENTS.md` if needed).

### Task 1 – 4.6 Task Completion (Implementer)

- Append `[DONE]` to `initialize project info` in TODO file.
- Commit with message: `docs: initialize project info files (product, context, architecture, tech)`.

---

## Task 2 – Update README File

### Task 2 – 4.1 Analysis & Planning (Architect)

- Analyze `brief.md` and `docs/event-messaging-convention.md`.
- Define README structure: title, description, installation, usage examples, architecture overview, API summary, guidelines for AI agents, contributing.
- Plan to remove all base-project template content.

### Task 2 – 4.2 Implementation (Implementer)

- Rewrite `README.md` with `events-toolkit` specific content:
  - Library name and description.
  - Installation (`npm install @cobranza/events-toolkit`).
  - Quick-start usage example (subject builder, producer, consumer).
  - Architecture overview (modules and services).
  - Link to `docs/event-messaging-convention.md`.
  - Guidelines for AI Agents section.
  - License info.

### Task 2 – 4.3 Code Review (Code Reviewer)

- Review README for accuracy, completeness, and tone.
- Check that all links are valid.
- Generate fix plan if needed.
- 4.3-fix: Implementer applies fixes.

### Task 2 – 4.4 Documentation (Docs Specialist)

- Ensure markdown formatting, code blocks, and headers are consistent.
- Verify spelling and grammar.

### Task 2 – 4.5 Verification (Implementer)

- Preview README in a markdown viewer (or check structure).
- Ensure no base-project template content remains.

### Task 2 – 4.6 Task Completion (Implementer)

- Append `[DONE]` to `update readme file` in TODO file.
- Commit with message: `docs: update README for events-toolkit library`.

---

## Step 5 – TODO File Completion

- Rename TODO file to `20260611-todo-0-DONE.md`.
- Ensure all files are committed in feature branch.
- Switch to `main`, merge feature branch.
- On success: delete feature branch.
- If `origin` is set: push `main` to `origin`.

## Step 6 – Continuation

- Check for remaining TODO files (there are `20260611-todo-1.md` and `20260611-todo-2.md`).
- If any remain, propose user to proceed in new chat with:
  ```text
  full read @AGENTS.md & follow /critical-workflow
  do @/.agent/todos/20260611/20260611-todo-1.md
  ```
