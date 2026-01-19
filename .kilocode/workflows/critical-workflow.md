# CRITICAL WORKFLOW

## Initial Notes

It is **EXTREMELY IMPORTANT** that all AI agents follow this workflow's step by step in detail.
This workflow's steps organize the task/work receiving, the understanding and analysis, generation of a global plan to work on them, handle correct agent for the exact work and steps, generation of other detailed plans for each task with implementations details, and some other things, all that along with a correct git version control.

- Check the example section before proceeding.
- Plans are saved to `.kilocode/_generated/plans/` for separation from TODO files.
- Global Plan Structure: The Orchestrator generates a single global plan that sequences all workflow steps (2-6), **explicitly including the repetition of sub-steps 4.1-4.6 as distinct entries for each TODO task**. This ensures all sub-steps are executed in order. Implementation plans (generated in 4.1) are separate, detailed guides for agents within those sub-steps.

## Steps

### 1. Task Origin

- **Chat**: If a task (ie. almost any requested work) is shared in the chat (except when the user indicates a TODO file), create a new TODO file in `.ai-agent/todos/<YYYYMMDD>/<YYYYMMDD>-todo-<number>.md`. The content of the file should be the user's request.
- **TODO File**:
  - The primary source of tasks is the `.ai-agent/todos` directory, which contains TODO files that need to be processed, named with date and sequentially.
  - Process TODO files inside `.ai-agent/todos` directory in chronological and numerical order.
  - The user may indicate the TODO file to work on, or just ask to look for the next one undone.
  - Files with suffix name `-DONE` must be skipped.
- **TODO File Format**: files have one of the next formats.
  - **Line Items**: Each line is a separate task.
  - **Section Items**: Each markdown section is a separate task, potentially with additional details and/or sub-tasks.
  - **Other Formats**: If the format is unclear, ask the user for clarification.
- **Orchestrator Agent**:
  - Receives the initial request/s or file/s from the user, and proceeds to: create TODO file if not exists, or find & read the file shared by the user.
  - **CRITICAL**:
    Generates a global plan of action to handle the work, following the defined steps from 2 to 6.
    **For EACH TASK in the TODO file, Orchestrator MUST REPEAT sub-steps of step 4 as explicit, sequential entries in the global plan (e.g., "Task X - 4.1: [description]", "Task X - 4.2: [description]", etc.).** These sub-steps are assigned as sub-tasks to agents for execution.
    Check example section for clarification.
  - The global plan must be a list of clear steps, and the tasks must be handled one by one in separated steps.
  - Orchestrator Agent must assign sub-tasks to the appropriate agents, to handle each separated step.
  - The sub-tasks must have a clear description of the expected outcome and the sub-task's steps to achieve it. It must be specially clear to the assigned agent if it should implement code or not, read/modify/create/move/rename files or not, **signal completion with a clear response (e.g., 'SUBTASK_COMPLETE: [brief outcome or file path]' or 'CLARIFICATION_NEEDED: [details]')**, generate a plan on how to implement/resolve some task/sub-task/step, etc.
  **To assert execution, Orchestrator verifies each agent's completion signal and compliance before advancing to the next global plan step.**
  - Prevention of Role Overstep: Ensure sub-task prompts include explicit boundaries, e.g., "Generate plan only; do not implement code or modify files. If unclear, return 'CLARIFICATION_NEEDED'." The Orchestrator should verify responses for compliance before proceeding to the next step (e.g., check if code was unexpectedly generated).
  - Important: the Orchestrator drives the overall process, ie. the global plan. While the steps must be handled by the appropriate agents.
- **Asker Agent**: Manages communication with the user, when some clarification, update or definition is required.

### 2. Git Feature Branch Setup

Orchestrator Agent must include this step to the global plan.
It must be clear for the designated agent to where and how to run the commands of this section.
IMPORTANT: `main` branch is the master branch.
Include next steps in the plan:

- 1º Run `git status`:
  - If there are unstaged files then commit all of them with a meaningful commit message.
- 2º Switch to the `main` branch:
  - If already in the `main` branch, then continue with step 3.
  - If not in the `main` branch, ask the user if merge that branch to `main` branch or not.
    - If yes, then checkout `main` branch, try merge it to `main` branch
      - If conflicts found, ask user to resolve them.
      - If merge success, then remove the merged branch.
    - If no, then checkout `main` branch.
- 3º Create a new branch with a descriptive name:
  - For new features: `feat/<descriptive-name>`
  - For bug fixes: `fix/<descriptive-name>`
  - Default to `feat/` unless clearly a bug; base name on TODO file summary.
  - Create the new branch before starting work on the task, ensuring the branch name reflects the task's purpose or TODO file's name.
  - All work must be done in the feature branch. The feature branch will be merged to the `main` branch later.
- 4º Switch to the new branch created in step 3º of this section.

### 3. Version Update

- Orchestrator Agent must include this step to the global plan.
- If the project has a version number (e.g., in `package.json`), increment it following the `x.y.z` format.
  Follow semver: Increment patch for fixes, minor for features, major for breaking changes; commit as 'chore: bump version to x.y.z'.
- Commit this change before continue.

### 4. Task Execution

#### 4.0 Overall Process Management

- IMPORTANT: the Orchestrator Agent must drive the overall process, ie. the global plan. The analysis and implementation details must be assigned to the appropriate agents.
- Define the steps to process tasks in the TODO file in the order they are in the TODO file.
- Before starting a new task, commit any pending changes to the current branch with a meaningful message. This must be included in the steps and plans.
- **ATTENTION**:
  **For EACH task in the TODO file, the global plan must include individual entries for sub-steps 4.1 to 4.6 (e.g., as "Task X - 4.1: Assign Architect to generate implementation plan").** These are executed via sub-tasks assigned by the Orchestrator.
  Check example section for clarification.
- Ask user for clarifications or to confirm plans when required.
- Adhere to all other defined rules (RULES.md) and workflows (WORKFLOWS.md).
- **To assert correct execution of all steps and sub-steps, Orchestrator pauses on failures (e.g., missing completion signals) and invokes Asker for user intervention.**

#### 4.1. Analysis and Planning

- **For each task, include this step in the global plan.**
- Assign this step to the Architect Agent.
- Identify task ambiguities and areas needing user clarification.
- Analyzes the current project status.
- Researches required techs, frameworks, libs, dependencies, and/or APIs.
- [IMPORTANT] define implementation plan:
  - defines a high-level approach to implement an individual TODO file task, including steps for:
    - git handling: focus git handling on task-specific actions only (e.g., commits after steps)
    - code writing
    - running console cmds (when required)
    - test build (if exists)
    - code review
    - unit test implementation (if unit testing suit exists in the project)
    - documentation updates
    - any other relevant details
  - based on the high-level approach, defines an extensive implementation plan composed by very tiny and very detailed steps, including clear files names/paths, structure, code snippets, where/how run terminal cmds, and any other relevant details.
  - Compare the original task with the generated implementation plan, to identify incorrect decisions. If any, redo the implementation plan.
  - [CRITICAL] the implementation plan MUST be saved in `.kilocode/_generated/plans/` with a unique name (e.g., `<datetime>-<plan-name>.md`).
- **Architect must present the implementation plan to the user for approval before proceeding with the next steps**.
  If the request or TODO file includes the string "Don't request me to approve the plans", then auto-approve the plans.
  **If user provides feedback or rejects, Architect revises the plan based on input and re-presents it.**
- Architect Agent is responsible for creating the implementation plan, while the Orchestrator Agent is responsible to assign it to the appropriate agents.
- General process example:
  - in the global plan, Orchestrator creates a step to generate the implementation plan in a sub-task for a **specific TODO file task**
  - in sub-task: Architect analyzes and generates an implementation plan, then returns the implementation plan file's path **with completion signal**.
  - **Orchestrator verifies and, if approved, proceeds to assign sub-task for 4.2.**
  - in another sub-task: the Coder Agent receives file's path, and follows the implementation plan.

#### 4.2. Implementation

- **For each task, include this step in the global plan.**
- Assign this step to the Coder Agent.
- In a sub-task, Coder receives and follows extremely tiny and very detailed steps from the implementation plan.
- Always checks the details of the implementation plan between each step.
- IMPORTANT: Make commits with meaningful messages any time a task is completed.

#### 4.3. Code Review

- **For each task, include this step in the global plan.**
- Assign this step to the Architect or Code Reviewer or Code Simplifier Agent.
  Choose by availability, default to Code Reviewer.
- Reviews the implemented code looking for errors or deviations from the implementation plan.
- Generates a new implementation plan to requests necessary changes to the Coder Agent.
  [CRITICAL] the new implementation plan MUST be saved in `.kilocode/_generated/plans/` with a unique name (e.g., `<datetime>-<plan-name>.md`).
- Orchestrator assigns the Coder agent the new implementation plan in a new sub-task, to work on it.
- Max 3 review cycles; escalate to user if needed.

#### 4.4. Documentation

- **For each task, include this step in the global plan.**
- Assign this step to the Documentator Agent.
- Adds comments to the code when & where necessary.
- Updates/Creates project's documentation (e.g., README, `/docs` files).

#### 4.5. Verification

- **For each task, include this step in the global plan.**
- Assign this step to the Architect.
- Before proceed, check:
  - if the implementation plan was correctly followed
  - if there are unstaged files, commit them.

#### 4.6. Task Completion

- **For each task, include this step in the global plan.**
- When a implementation plan of a task is completed, modify the TODO file to clearly mark as done the task.
- How to mark the task as done in the TODO file:
  - **Line Item Format**: Add `[DONE]` at the beginning of the line.
  - **Section Item Format**: Add `[DONE]` to the section title.
  - **Other Format**: Add `[DONE]` to the appropriate section or line. Ask user when is unclear.
  **Take care to don't delete the content of the file, or change its original content, except for the addition of the `[DONE]` mark**
- IMPORTANT: Commit all changes to the current branch with a meaningful message.
- Each task in the TODO file must be processed individually. Marking must occur in the same way, immediately after it is processed.

### 5. TODO File Completion

- Orchestrator Agent must include this step to the global plan.
- When all tasks of the TODO file are marked as done (as indicated in step 4.6), rename the file with a `-DONE` suffix (e.g., `<YYYYMMDD>-todo-<number>-DONE.md`), and commit it.
  **Take care to don't delete the file, or change its content. Only rename it**
- IMPORTANT: Ensure all files are committed in feature branch. If not, commit them before continue.
- Merge the current feature branch into the master branch:
  - Switch to the `main` branch.
  - Merge the feature branch into the `main` branch.
  - Then:
    - If feature branch was correctly merged, then delete the feature branch. It is IMPORTANT to verify BEFORE deleting the feature branch.
    - If feature branch was not correctly merged into the `main` branch, then ask the user to resolve merge conflicts and then retry the merge process.
  - If an `origin` remote repository is configured, then push the latest `main` branch commits to the remote repository.

### 6. Continuation

- After a TODO file is completed, check for any remaining TODO files.
- If other TODO files exist, ask the user whether to proceed with the next one or not. If the response is affirmative, then is preferable to start with the next file in a completely new chat, finalizing the current one.
- If no TODO files remain, the work is finished.

## Example (MUST READ)

This section is minimal example of the process to prevent commons errors.

### TODO File

In this example the TODO File is like:

```markdown
- Task 1
- Task 2
- Task 3
- Task 4
```

### Orchestrator Global Plan

The global plan that is generated by the orchestrator must includes next steps:

```markdown
- Step 1: Task Origin => Creates new TODO file (when required), reads the indicated TODO file.
- Step 2: Git Feature Branch Setup => Assign to appropriate agent (e.g., Coder) to run git commands as specified.
- Step 3: Version Update => Assign to appropriate agent to check and increment version if needed, then commit.
(some other steps...)
- Task 1: 4.1. Analysis and Planning => Assign Architect: Generate and save implementation plan for Task 1; present for approval; return path with 'SUBTASK_COMPLETE'.
- Task 1: 4.2. Implementation => Assign Coder: Follow implementation plan for Task 1; commit changes.
- Task 1: 4.3. Code Review => Assign Code Reviewer: Review code; generate fix plan if needed.
- Task 1: 4.4. Documentation => Assign Documentator: Update docs and comments.
- Task 1: 4.5. Verification => Assign Architect: Check plan adherence and commit unstaged files.
- Task 1: 4.6. Task Completion => Assign appropriate agent: Mark Task 1 as [DONE] in TODO file; commit.
(some other steps...)
- Task 2: 4.1. Analysis and Planning => Assign Architect: Generate and save implementation plan for Task 2; present for approval; return path with 'SUBTASK_COMPLETE'.
- ... (repeat for 4.2-4.6 for Task 2, 3, 4)
(some other steps...)
- Step 5: TODO File Completion => Assign appropriate agent: Rename TODO file to -DONE; commit; merge branch; push if configured.
- Step 6: Continuation => Check for next TODO; ask user if proceed.
```

Note: This example shows only the per-task 4.1–4.6 structure for clarity. **These are explicit entries in the global plan, assigned as sub-tasks.** The actual global plan MUST also include steps 2 (Git Setup), 3 (Version Update), 5 (TODO Completion), and 6 (Continuation), plus any initial setup.

### Error Handling

- On git errors, command failures, or unexpected agent outputs: Log details, commit safe changes if possible, invoke Asker Agent to notify user, and pause.
- If endless loops or repeated failures occur, escalate to user immediately.
- **If a sub-step (4.1-4.6) fails verification (e.g., no completion signal or non-compliance), Orchestrator reassigns the sub-task or escalates to user.**
