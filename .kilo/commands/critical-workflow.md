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
- **Updates**: before/after any step/sub-step (from 1 to 6, and specifically 4.1 through 4.6), the assigned agent MUST update `state.json`.
- **Verification**: before each step, confirm that `sub_step_status` in `state.json` is set to `"COMPLETED"`.
- **Git**: The `git_branch` key in `state.json` must match the active local git branch.

## Steps

### 1. Task Origin

- **Chat**: If a task is shared in chat (unless user indicates a TODO file), create new TODO file in `.agent/todos/<YYYYMMDD>/<YYYYMMDD>-todo-<number>.md` with the request.
- **TODO File**:
  - Primary source of tasks is `.agent/todos` directory: contains TODO files named by date & sequentially.
  - Process TODO files in chronological and numerical order.
  - User may specify file to work on, or request next undone one.
  - Skip files with `-DONE` suffix.
- **TODO File Format**:
  - **Line Items**: Each line is a task.
  - **Section Items**: Each markdown section a task, with additional details and/or sub-tasks.
  - **Other Formats**: Ask user for clarification if unclear.
- **Plan Agent**:
  - Receives requests or files from the user, then creates or reads TODO file (or find next one undone).
  - **CRITICAL**:
    Generates global plan of action following steps from 2 to 6; don`t need to include step 1 (ie. this step).
    **For each TODO task, includes explicit sequential entries for 4.1-4.6 sub-steps** (assigned as new sub-tasks; see example).
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

Plan Agent includes this step in global plan; assigns Code sub-agent using `task` tool.
IMPORTANT: `main` is master branch.

- Run `git status`: Commit unstaged files with meaningful message.
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

- Plan Agent includes this step in global plan; assigns Code sub-agent using `task` tool.
- If version exists (e.g., `package.json`), increment per semver (patch for fixes, minor for features, major for breaking); commit as 'chore: bump version to x.y.z'.

### 4. Task Execution

#### 4.0 Overall Process Management

- IMPORTANT: Plan Agent drives global plan; assigns analysis/implementation/fixes/documentation to sub-agents using `task` tool.
- Process TODO tasks in file order.
- Before new task, include step: Commit pending changes with meaningful message.
- **CRITICAL**: Plan Agent MUST NOT assign the entire global plan or all 4.x steps for a task to a single sub-agent. Each step (4.1, 4.2, 4.3, 4.4, 4.5, 4.6) MUST be created as a separate `task` tool invocation.
- **For each task**: Global plan includes entries for 4.1 to 4.6, executed via sub-tasks using `task` tool.
- Ask user for clarifications/plan confirmations as needed using `task` tool; assigns to Ask Agent.
- Adhere to RULES.md and WORKFLOWS.md.
- On failures: Pause and invoke Ask Agent for user intervention.
- State Sync: when committed, update `.kilo/state.json` reflecting current and next sub-step status.

#### 4.1. Analysis and Planning

- **CRITICAL**: The Plan Agent (itself, via `task` tool to Plan sub-agent) executes 4.1. The code agent must NOT generate implementation plans.
- **In global plan for each task**; assign it to Plan sub-agent using `task` tool.
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
  - in new sub-task: Code sub-agent receives & follows implementation plan.

#### 4.2. Implementation

- **In global plan for each task**; assign it to Code sub-agent using `task` tool.
- In sub-task, Coder follows detailed steps from the implementation plan; checks plan between steps.
- IMPORTANT: commit w/meaningful messages completed task.

#### 4.3. Code Review

- **In global plan for each task**; assign it to Code Reviewer sub-agent using `task` tool.
- Review for errors/deviations from the implementation plan.
- Generates a new plan for fixes; [CRITICAL] save in `.kilo/plans/<YYYYMMDD>-<plan-name>.md`.
- Plan Agent assigns new plan in a new sub-task to Code sub-agent using `task` tool.
- Max 3 review cycles; escalate to user.

#### 4.4. Documentation

- **In global plan for each task**; assign it to Docs Specialist sub-agent using `task` tool.
- Adds code comments where needed.
- Updates/Creates project's documentation (e.g., README, `/docs`).

#### 4.5. Verification

- **In global plan for each task**; assign it to Code sub-agent using `task` tool.
- Check implementation plan adherence; commit unstaged files.

#### 4.6. Task Completion

- **In global plan for each task**.
- When task's implementation plan is completed, add `[DONE]` to mark task as done in TODO file by format:
  - Line Item: to line.
  - Section Item: to section's title.
  - Other: to somewhere; ask user if unclear.
  **Preserve the file original content**. Just add the `[DONE]` mark.
- In sub-task assigned to Code sub-agent: commit changes with meaningful message; update `.kilo/state.json` setting `current_task.sub_step` to "4.6" and `sub_step_status` to "COMPLETED".
- Process each task in TODO file individually. Mark as done immediately after completion.

### 5. TODO File Completion

- Include this step in global plan.
- When all tasks marked as done (see step 4.6), rename TODO file with a `-DONE` suffix (e.g., `<YYYYMMDD>-todo-<number>-DONE.md`), and commit it in sub-task assigned to Code sub-agent.
  **Don't delete the file nor change its content.**
- IMPORTANT: Ensure all files are committed in feature branch.
- Merge feature branch:
  1. Switch to `main` branch.
  2. Merge feature branch:
    -> On success: delete feature branch (verify success first).
    -> On failure: notify user.
- If `origin` remote repository is set, push updated `main`. Notify user if fail.

### 6. Continuation

- Check for any remaining TODO files.
- If any: ask user to proceed. If yes, start with the next file in new chat.
- If none: work finished.

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
- Step 2: Git Feature Branch Setup => Assign to sub-agent (using `task` tool) for git cmds.
- Step 3: Version Update => Assign to sub-agent (using `task` tool) to increment version if needed, then commit.
- Task 1: 4.1. Analysis and Planning => Assign to sub-agent (using `task` tool): Generate & save Task 1 implementation plan; present for approval;
- Task 1: 4.2. Implementation => Assign to sub-agent (using `task` tool): Follows plan for Task 1; commit.
- Task 1: 4.3. Code Review => Assign to sub-agent (using `task` tool): Review code; fix Task 1 plan if needed.
- Task 1: 4.4. Documentation => Assign to sub-agent (using `task` tool): Update docs & comments.
- Task 1: 4.5. Verification => Assign to sub-agent (using `task` tool): Check plan adherence & commit unstaged files.
- Task 1: 4.6. Task Completion => Assign to sub-agent (using `task` tool): Mark Task 1 as [DONE]; commit.
- Task 2: 4.1. Analysis and Planning => Assign to sub-agent (using `task` tool): Generate & save Task 2 implementation plan; present for approval;
- ... (repeat steps 4.2-4.6 for Task 2, then 3, then 4)
- Step 5: TODO File Completion => Assign to sub-agent (using `task` tool): Add -DONE suffix; commit; merge branch; push.
- Step 6: Continuation => Check/ask for next.
```

Note: example focuses on per-task 4.1–4.6 for Task 1; actual global plan must include 4.x steps for EACH task.

## Error Handling

- On errors: Log details, commit safe changes if possible, notify user, and pause.
- If endless loops or repeated failures occur, escalate to user immediately.
- **If a sub-step (4.1-4.6) fails verification (e.g., no completion signal or non-compliance), Plan agent reassigns the sub-task or escalates to user.**
