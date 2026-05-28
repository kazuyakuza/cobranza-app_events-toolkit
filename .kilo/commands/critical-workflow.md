---
description: Critical workflow for task execution with full process management
agent: plan
---
# CRITICAL WORKFLOW

## Initial Notes

It is **EXTREMELY IMPORTANT** that all AI agents follow this workflow step by step, organizing task receipt, analysis, global planning, agent assignment, detailed per-task plans, and git version control.

- Check the example section before proceeding.
- Plans are saved to `.kilo/plans/`.
- **Global Plan Structure**: Plan Agent generates a single global plan sequencing steps 2-6, **explicitly repeating sub-steps 4.1-4.6 as distinct entries for each TODO task** (e.g., "Task X - 4.1: [description]"). Implementation plans (from 4.1) are separate guides for agents.

## State Tracking (Persistence Guardrails)

Plan Agent MUST maintain the process state in `.kilo/state.json`.

- **Begin**: checks if `.kilo/state.json` exists.
  - Exists: read & resume exactly from the last incomplete `sub_step`.
  - Not exist: create using the standard schema with `global_step: "1"`.
- **Updates**: before/after any step/sub-step (from 1 to 6, and specifically 4.1 through 4.6), the Plan Agent MUST update `state.json`.
- **Verification**: before each step, confirm that `sub_step_status` in `state.json` is set to `"COMPLETED"`.
- **Git**: The `git_branch` key in `state.json` must match the active local git branch.

### State Ownership

- **ONLY the Plan Agent** reads or writes `.kilo/state.json`. Sub-agents MUST NOT edit, create, or reference `state.json`.
- When a sub-agent completes its step, it reports completion in its return message. The Plan Agent then updates `state.json` before dispatching the next sub-task.
- Rationale: centralising all `state.json` I/O in the Plan Agent eliminates cross-mode permission prompts and avoids race conditions.

### State Lifecycle & History Cleanup

- **On new global plan start** (Step 1, before generating the plan):
  - If `current_todo_file` is `null` or differs from the TODO file being processed, reset `history` to `[]` and set `current_todo_file` to the new file path.
  - Reset `current_task` to `{ index: 0, description: "Starting", sub_step: "2.0", sub_step_status: "PENDING", attempts: 0 }`.
- **On global plan finish** (Step 5, after TODO file renamed and committed):
  - Clear `history` to `[]`.
  - Set `current_todo_file` to `null`.
  - Set `current_task.sub_step_status` to `"COMPLETED"`.
- **On resumption with stale or empty state** (Step 6, New Session Re-entry):
  - After reading `state.json`, if `current_task.sub_step` is `"1.0"` or `current_todo_file` is `null`, read the target TODO file.
  - Count how many task headings already have `[DONE]` in their title.
  - Set `current_task.index` to the first undone task and `sub_step` to `"4.1"` (or `"4.2"` if a plan file already exists for that task).

## Steps

### Sub-Agent Type Mapping

The Plan Agent delegates sub-tasks using the `task` tool. The `subagent_type` parameter MUST match the mapping below. Do NOT use `general` for steps that have a specific type.

| Step | `subagent_type` | Role |
|------|----------------|------|
| 2, 3, 4.2, 4.3-fix, 4.5, 4.6, 5 | `implementer` | Implementer sub-agent (implementation, git, builds) |
| 4.1 | `architect` | Architect sub-agent (analysis, implementation plans) |
| 4.3 | `code-reviewer` | Code Reviewer sub-agent (quality, plan deviations) |
| 4.4 | `docs-specialist` | Docs Specialist sub-agent (comments, docs) |

**Context Passing to Subagents**: When delegating via `task` tool, the Plan Agent MUST include in the task prompt:
- For `architect`: Path to the TODO file, task description, any relevant constraints
- For `implementer`: Path to the implementation plan file, specific steps to execute
- Both subagents will read project context files independently

### 1. Task Origin

- **Chat**: If a task is shared in chat (unless user indicates a TODO file), create new TODO file in `.agent/todos/<YYYYMMDD>/<YYYYMMDD>-todo-<number>.md` with the request.
- **TODO File**:
  - Primary source of tasks is `.agent/todos` directory: contains TODO files named by date & sequentially.
  - Process TODO files in chronological and numerical order.
  - User may specify file to work on, or request next undone one.
  - Skip files with `-DONE` suffix.
- **TODO File Format**:
  - **Line Items**: Each line is a task (as shown in the example below).
  - **Section Items** — apply the following patterns in order; use the first that matches:
    - **Pattern C — Tasks Section Children as Tasks**: If the file has a top-level `# Title`, then `##` sub-sections, and one of those `##` sub-sections is named **Tasks** (case-insensitive; accept *Tareas*, *Task List*, etc.), then each `### Heading` inside that Tasks section is one task.
    - **Pattern B — Sub-Sections as Tasks**: If the file has one top-level `# Title` followed by multiple `## Heading` sections (and no `## Tasks` section), each `## Heading` is one task.
    - **Pattern A — Root Sections as Tasks**: If the file has no single top-level `# Title` and instead begins directly with multiple `# Heading` sections, each `# Heading` is one task.
    - Sub-items (bullets, checklists, nested paragraphs) under a task heading belong to that task and do **not** spawn new tasks.
    - If none of these patterns match, ask the user for clarification BEFORE generating the global plan.
  - **Other Formats**: Ask user for clarification if the task format cannot be determined.
- **Plan Agent**:
  - Receives requests or files from the user, then creates or reads TODO file (or find next one undone).
  - **CRITICAL**:
    Generates global plan of action following steps from 2 to 6; don`t need to include step 1 (ie. this step).
    **For each TODO task, includes explicit sequential entries for 4.1-4.6 sub-steps** (assigned as new sub-tasks; see example).
    Note: regardless of format (line items or section items), each distinct task in the TODO file maps to one numbered Task in the global plan, with its own full 4.1–4.6 cycle. Do not group multiple TODO items into a single Task.
  - Global plan: List of clear, separate steps, that handles tasks one by one using `task` tool.
  - Assigns sub-tasks with clear outcomes/steps (e.g., code implementation yes/no, file ops yes/no).
    - **Verification**: Plan Agent checks signals/compliance/outcomes before advancing.
    - **Role Overstep Prevention**: sub-tasks include boundaries (e.g., "Plan only; no code"); verify responses.
    - **Instructions**: using `task` tool, sub-tasks include short context to guide/force assigned sub-agent; prevents sub-agent overlooks all project.
  - Important: Plan Agent drives overall process in a parent complex task; delegates steps to sub-agents using `task` tool.
- **Ask Agent**:
  - Handles user communication for clarifications/updates.
  - Being called by Plan Agent using `task` tool.

### 2. Git Feature Branch Setup

Plan Agent includes this step in global plan; assigns implementer sub-agent using `task` tool with `subagent_type: "implementer"`.
IMPORTANT: `main` is master branch.

- Run `git status`: Commit unstaged files with meaningful message. **Before committing, follow [Gitignore Compliance Rule](../.kilo/rules/gitignore-compliance.md).**
- Switch to `main`:
  - If there already, proceed.
  - Else, ask user to merge current branch:
    - Yes: Checkout `main`, merge; if conflicts, ask user to resolve; if success, remove merged branch.
    - No: Checkout `main`.
- Create new branch:
  - Features: `feat/<descriptive-name>` (default)
  - Fixes: `fix/<descriptive-name>`
  - All work in created branch; merge to `main` at the end of *Critical Workflow*.
- Switch to new branch.

### 3. Version Update

- Plan Agent includes this step in global plan; assigns implementer sub-agent using `task` tool with `subagent_type: "implementer"`.
- If version exists (e.g., `package.json`), increment per semver (patch for fixes, minor for features, major for breaking); commit as 'chore: bump version to x.y.z'.

### 4. Task Execution

#### 4.0 Overall Process Management

- IMPORTANT: Plan Agent drives global plan; assigns analysis/implementation/fixes/documentation to sub-agents using `task` tool.
- Process TODO tasks in file order.
- Before new task, include step: Commit pending changes with meaningful message.
- **CRITICAL**: Plan Agent MUST NOT assign the entire global plan or all 4.x steps for a task to a single sub-agent. Each step (4.1, 4.2, 4.3, 4.4, 4.5, 4.6) MUST be created as a separate `task` tool invocation.
- **CRITICAL**: Do NOT call `plan_exit` at any point during this workflow. The Plan Agent remains in Plan mode as orchestrator for the entire TODO file lifecycle (Steps 1–6). All delegation to sub-agents happens exclusively via the `task` tool. `plan_exit` is only safe to call after Step 6 is fully complete.
- **Compliance Self-Check**: Before executing any 4.x sub-step, the agent MUST verify:
  (a) Am I still the Plan Agent orchestrating via `task` tool?
  (b) Is this a single discrete sub-step assigned to the correct sub-agent type?
  (c) Am I using the correct `subagent_type` value as defined in the Sub-Agent Type Mapping table? If any answer is "no", stop and re-read this workflow from the beginning.
  (d) Does this task map 1:1 to a single TODO file item? If multiple TODO items are being handled as one task, stop and separate them.
- **For each task**: Global plan includes entries for 4.1 to 4.6, executed via sub-tasks using `task` tool.
- Ask user for clarifications/plan confirmations as needed using `task` tool; assigns to Ask Agent.
- Adhere to RULES.md and WORKFLOWS.md.
- On failures: Pause and invoke Ask Agent for user intervention.
- State Sync: the Plan Agent updates `.kilo/state.json` after each sub-agent signals completion.
- **Context Passing to Subagents**: When delegating via `task` tool, the Plan Agent MUST include in the task prompt:
  - For `architect`: Path to the TODO file, task description, any relevant constraints
  - For `implementer`: Path to the implementation plan file, specific steps to execute
  - Both subagents will read project context files independently

#### Sub-Task Prompt Requirements

Every `task` tool invocation from the Plan Agent MUST include the following preamble in the prompt, before the task-specific instructions:

```
SUB-AGENT TASK — SINGLE DISCRETE STEP
- You are executing exactly ONE step of a larger Critical Workflow plan.
- Do ONLY what is described below. Do NOT execute subsequent steps.
- Do NOT read or expand scope to the global plan for other tasks.
- Follow the Tool Selection Priority rule: prefer vscode-mcp-server_* and Bifrost_*
  tools over bash for code operations. Reserve bash for git, npm, builds, tests.
- The `subagent_type` parameter MUST match the type specified in the
  Sub-Agent Type Mapping table for this step.
- Signal completion with a clear summary: what was done, what was NOT done.
- If anything is ambiguous or outside your assigned scope, return the question
  to the caller. Do NOT make assumptions.
```

#### 4.1. Analysis and Planning

- **CRITICAL**: The Plan Agent (itself, via `task` tool to architect sub-agent with `subagent_type: "architect"`) executes 4.1. The implementer agent must NOT generate implementation plans.
- **In global plan for each task**; assign it to architect sub-agent using `task` tool with `subagent_type: "architect"`.
- Identify task ambiguities; analyze project status; research required techs, frameworks, libs, dependencies, and/or APIs.
- Generate implementation plan following next process:
  1. Think high-level approach to implement 1 TODO file task, including steps for:
    -> git handling task-specific actions
    -> code writing
    -> console cmds (if required)
    -> test build (if exists)
    -> code review
    -> unit test (if testing suit exists)
    -> docs updates
  2. Use approach to define extensive implementation plan, composed by very tiny and very detailed steps; include clear files names/paths, structure, code snippets, terminal cmds details, etc.
  3. [CRITICAL] Save to `.kilo/plans/<YYYYMMDD>-<plan-name>.md`.
  4. Compare to original task; redo if incorrect.
- **Plan Agent shows plan to user for approval**.
  - Auto-approve if request or TODO file includes string "Don't request me to approve plans".
  - If feedback/rejection: re-do and re-present.
- Plan Agent creates implementation plan & assigns to appropriate sub-agent using `task` tool.
- Example:
  - global plan: Plan Agent sets a sub-task to generate a specific task's implementation plan.
  - sub-task: in new `task` tool invocation, Plan Agent analyzes->generates->returns the plan.
  - **Plan Agent verifies and, if approved, proceeds to assign sub-task for 4.2.**
  - in new sub-task: implementer sub-agent (`subagent_type: "implementer"`) receives & follows implementation plan.

#### 4.2. Implementation

- **In global plan for each task**; assign it to implementer sub-agent using `task` tool with `subagent_type: "implementer"`.
- In sub-task, Implementer follows detailed steps from the implementation plan; checks plan between steps.
- IMPORTANT: commit w/meaningful messages completed task. **Before committing, follow [Gitignore Compliance Rule](../.kilo/rules/gitignore-compliance.md).**

#### 4.3. Code Review

- **In global plan for each task**; assign it to code-reviewer sub-agent using `task` tool with `subagent_type: "code-reviewer"`.
- Review for errors/deviations from the implementation plan.
- Generates a new plan for fixes; [CRITICAL] save in `.kilo/plans/<YYYYMMDD>-<plan-name>.md`.
- Plan Agent assigns fix plan in a new sub-task to implementer sub-agent using `task` tool with `subagent_type: "implementer"`.
- Max 3 review cycles; escalate to user.

#### 4.4. Documentation

- **In global plan for each task**; assign it to docs-specialist sub-agent using `task` tool with `subagent_type: "docs-specialist"`.
- Adds code comments where needed.
- Updates/Creates project's documentation (e.g., README, `/docs`).

#### 4.5. Verification

- **In global plan for each task**; assign it to implementer sub-agent using `task` tool with `subagent_type: "implementer"`.
- Check implementation plan adherence; commit unstaged files. **Before committing, follow [Gitignore Compliance Rule](../.kilo/rules/gitignore-compliance.md).**

#### 4.6. Task Completion

- **In global plan for each task**.
- When task's implementation plan is completed, add `[DONE]` to mark task as done in TODO file by format:
  - Line Item: to line.
  - Section Item: to section's title.
  - Other: to somewhere; ask user if unclear.
  **Preserve the file original content**. Just add the `[DONE]` mark.
- In sub-task assigned to implementer sub-agent (`subagent_type: "implementer"`): commit changes with meaningful message; **before committing, follow [Gitignore Compliance Rule](../.kilo/rules/gitignore-compliance.md).** After the implementer signals completion, the Plan Agent updates `.kilo/state.json` setting `current_task.sub_step` to "4.6" and `sub_step_status` to "COMPLETED".
- Process each task in TODO file individually. Mark as done immediately after completion.

### 5. TODO File Completion

- Include this step in global plan.
- When all tasks marked as done (see step 4.6), rename TODO file with a `-DONE` suffix (e.g., `<YYYYMMDD>-todo-<number>-DONE.md`), and commit it in sub-task assigned to implementer sub-agent (`subagent_type: "implementer"`).
  **Don't delete the file nor change its content.**
- Plan Agent clears `state.json` history and resets `current_todo_file` to `null`.
- IMPORTANT: Ensure all files are committed in feature branch.
- Merge feature branch:
  1. Switch to `main` branch.
  2. Merge feature branch:
    -> On success: delete feature branch (verify success first).
    -> On failure: notify user.
- If `origin` remote repository is set, push updated `main` to `origin` ONLY.
  **CRITICAL**: Do NOT push to any other remote unless explicitly instructed by the user.
  Remotes such as `base-project`, `upstream`, or `template` are read-only upstream sources —
  never push targets. Notify user if the push to `origin` fails.

### 6. Continuation

- Check for any remaining TODO files.
- If any: ask user to proceed. If yes, start with the next file in new chat with initial text:

```text
full read @AGENTS.md & follow /critical-workflow
do @/.agent/todos/<file-path>
```

- If none: work finished.
- **New Session Re-entry**: When a new session starts for Step 6 continuation:
  1. Re-read this workflow document in full.
  2. Read the saved global plan from `.kilo/plans/`.
  3. Read `.kilo/state.json` to find the last completed sub-step.
  4. Resume from the next incomplete sub-step via `task` tool delegations.
  5. Do NOT execute tasks directly.

## Example (MUST READ)

### TODO File Example (Line Items format)

```markdown
- Task 1
- Task 2
- Task 3
- Task 4
```

### Global Plan Example (Partial)

Includes next steps:

```markdown
- Step 1: Task Origin => Creates/reads TODO file.
- Step 2: Git Feature Branch Setup => Assign to implementer sub-agent (task tool, `subagent_type: "implementer"`) for git cmds.
- Step 3: Version Update => Assign to implementer sub-agent (task tool, `subagent_type: "implementer"`) to increment version if needed, then commit.
- Task 1: 4.1. Analysis and Planning => Assign to architect sub-agent (task tool, `subagent_type: "architect"`): Generate & save Task 1 implementation plan; present for approval;
- Task 1: 4.2. Implementation => Assign to implementer sub-agent (task tool, `subagent_type: "implementer"`): Follows plan for Task 1; commit.
- Task 1: 4.3. Code Review => Assign to code-reviewer (task tool, `subagent_type: "code-reviewer"`): Review code; generate fix plan if needed.
- Task 1: 4.3-fix. Apply Fixes => Assign to implementer sub-agent (task tool, `subagent_type: "implementer"`): Apply fixes from review plan.
- Task 1: 4.4. Documentation => Assign to docs-specialist (task tool, `subagent_type: "docs-specialist"`): Update docs & comments.
- Task 1: 4.5. Verification => Assign to implementer sub-agent (task tool, `subagent_type: "implementer"`): Check plan adherence & commit unstaged files.
- Task 1: 4.6. Task Completion => Assign to implementer sub-agent (task tool, `subagent_type: "implementer"`): Mark Task 1 as [DONE]; commit.
- Task 2: 4.1. Analysis and Planning => Assign to architect sub-agent (task tool, `subagent_type: "architect"`): Generate & save Task 2 implementation plan; present for approval;
- ... (repeat steps 4.2-4.6 for Task 2, then 3, then 4)
- Step 5: TODO File Completion => Assign to implementer sub-agent (task tool, `subagent_type: "implementer"`): Add -DONE suffix; commit; merge branch; push.
- Step 6: Continuation => Check/ask for next.
```

Note: example focuses on per-task 4.1–4.6 for Task 1; actual global plan must include 4.x steps for EACH task.

## Error Handling

- On errors: Log details, commit safe changes if possible, notify user, and pause.
- If endless loops or repeated failures occur, escalate to user immediately.
- **If a sub-step (4.1-4.6) fails verification (e.g., no completion signal or non-compliance), Plan agent reassigns the sub-task or escalates to user.**
