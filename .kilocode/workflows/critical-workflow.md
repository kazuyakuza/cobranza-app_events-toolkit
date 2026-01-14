# CRITICAL WORKFLOW

## Initial Note

It is EXTREMELY IMPORTANT that all AI agents follow this workflow's step by step in detail.
This workflow's steps organize the task/work receiving, the understanding and analysis, generation of a global plan to work on them, handle correct agent for the exact work and steps, generation of other detailed plans for each task with implementations details, and some other things, all that along with a correct git version control.

## 1. Task Origin

- **Chat**: If a task (ie. almost any work to do) is asked/given in the chat (except the user is indicating an existing TODO file), create a new TODO file in `.ai-agent/todos/<YYYYMMDD>/<YYYYMMDD>-todo-<number>.md`. The content of the file should be the user's request.
- **TODO File**:
  - The primary source of tasks is the `.ai-agent/todos` directory, which contains TODO files that need to be processed, organized by date and numbered sequentially in their names.
  - Process TODO files in chronological and numerical order from the `.ai-agent/todos` directory.
  - The user may indicate the TODO file to work on, or just ask to look for the next one undone.
  - Files with suffix name `-DONE` are completed and must be skipped.
- **TODO File Format**: files must have one of the next formats.
  - **Line Items**: Each line is a separate task.
  - **Section Items**: Each markdown section is a separate task, potentially with additional details and/or sub-tasks.
  - **Other Formats**: If the format is unclear, ask the user for clarification.
- **Orchestrator Agent**:
  - Receives the initial chat's request/s or file/s from the user, and proceeds to: TODO file creation if not exists, or find & read the next TODO file to work on.
  - CRITICAL: Generates an overall plan of action to handle the work, following the steps from 2 to 6 detailed in this file for EACH TASK in the TODO file. Full read the Example section.
  - The plan of action must be a list of clear steps, and the tasks must be handled one by one in separated steps.
  - Orchestrator Agent must assign sub-tasks to the appropriate agents, to handle each separated step.
  - The sub-tasks must have a clear description of the expected outcome and the sub-task's steps to achieve it. It must be specially clear to the assigned agent if it should implement code or not, read/modify/create/move/rename files or not, signal completion with a clear response, generate a plan on how to implement/resolve some task/sub-task/step, etc.
  - Its IMPORTANT to prevent that an agent in a sub-task doesn't follows the work that must handle. For example, prevent that the architect agent type switch to code mode when the sub-task is asking for a plan, but not implementation.
  - Important: the Orchestrator drives the overall process. The analysis and implementation details should be handled by the appropriate agents.
- **Asker Agent**: Manages communication with the user, when asking for clarifications and providing updates is required.

## 2. Git Feature Branch Setup

Orchestrator Agent must include in the global plan this section.
It must clear for the designated ai agent to where and how to run the commands of this section.
IMPORTANT: `main` branch is the master branch.
Include next steps in the plan:

- 1º Run `git status`:
  - If there are unstaged files then commit all of them with a meaningfully comment.
- 2º Switch to the `main` branch:
  - If already in the `main` branch, then continue with step 3.
  - If not in the `main` branch, ask the user if merge that branch to `main` branch or not.
    - If yes, then merge it to `main` branch, then checkout `main` branch and remote the merged branch.
    - If no, then checkout `main` branch.
- 3º Create a new branch with a descriptive name:
  - For new features: `feat/<meaning-name>`
  - For bug fixes: `fix/<meaning-name>`
  - Create the new branch before starting work on the task, ensuring the branch name reflects the task's purpose or TODO file's name.
  - All work must be done in the feature branch. The feature branch will be merged to the `main` branch later.
- 4º Switch to the new branch created in step 3º of this section.

## 3. Version Update

- Orchestrator Agent must include in the global plan this section.
- If the project has a version number (e.g., in `package.json`), increment it following the `x.y.z` format.
- Commit this change before continue.

## 4. Task Execution

### 4.0 Overall Process Management

- IMPORTANT: the Orchestrator Agent must drive the overall process. The analysis and implementation details must be assigned to the appropriate agents. Details in the steps 4.1 to 4.6 below.
- Process tasks in the TODO file in the order they are written. Make this clear in the steps and plans.
- Before starting a new task, commit any pending changes to the current branch with a meaningful message. This must be included in the steps and plans.
- Ask user for clarifications or to confirm implementation plans when required.
- Adhere to all other defined rules and workflows; check RULES.md and WORKFLOWS.md files.
- **ATTENTION, for each task in the TODO file**: create individuals sub-tasks to handle below steps (from 4.1 to 4.6) for it.

### 4.1. Analysis and Planning

- Assign this step to the Architect Agent.
- Identifies ambiguities and areas needing user clarification.
- Analyzes the current project status.
- Researches required technologies, frameworks, libraries, dependencies, and/or APIs.
- IMPORTANT: defines a high-level approach for the implementation of an individual TODO file task, creating a step-by-step plan including steps for:
  - git handling (check steps below)
  - code writing (check steps below)
  - running console cmds (when required)
  - test build (if exists)
  - code review
  - testing implementation (if testing suit exists in the project)
  - documentation updates (check steps below)
  - mark the task inside the TODO file as DONE (check steps below)
  - any other relevant details
- IMPORTANT: After the high-level approach, redefines the plan in very tiny and detailed steps, including clear files names/paths, structure, code snippets, where/how run terminal cmds, and any other relevant details.
- Always check the details of the original task to identify possible changes to the generated plan.
- CRITICAL: the plan must be saved to a file in `.kilocode/_generated/plans/` with a unique name (e.g., `<datetime>-<plan-name>.md`) in almost all cases. The Coder Agent (or any other) must receive this file, and follow it.
- **The plan MUST be presented to the user for approval before proceeding with the next steps**. Except the user included in the request or TODO file: "Don't request me to approval the plans".
- The Architect Agent is responsible for creating the plan, and the Orchestrator Agent is responsible to ensure the plan is followed and assigned to the appropriate agents.
- General process example: Orchestrator creates a step to generate the plan in a sub-task for a specific TODO file task; Architect analyzes and generates a plan file, then completes the sub-task with a respond that includes the plan file's path. Then, the Orchestrator Agent assigns to the Coder Agent to implement the plan in another sub-task.

### 4.2. Implementation

- Assign this step to the Coder Agent.
- In a sub-task, Coder receives and implements individual extremely tiny and very detailed steps from the plan.
- Always check the details of the plan before proceeding with a step.
- IMPORTANT: Make commits with meaningful messages when a TODO file task or "big step" is completed.

### 4.3. Code Review

- Assign this step to the Architect or Code Reviewer or Code Simplifier Agent.
- Reviews the implemented code for errors or deviations from the plan.
- Generates a plan to requests necessary changes to the Coder Agent.
- Orchestrator assigns the Coder agent the new plan to execute it.

### 4.4. Documentation

- Assign this step to the Documentator Agent.
- Adds comments to the code where necessary.
- Updates/Creates project's documentation (e.g., README, `/docs` files).
- Suggests and implements automated documentation tools.

### 4.5. Verification

Before proceed, check:

- if the generated plan was followed
- if there are unstaged files, decide if they need to be committed or not

### 4.6. Task Completion

- Orchestrator must be include this step in the overall plan for each TODO file task.
- When the Implementation of a plan's task is completed, the task in the TODO file MUST be clearly marked as done, as described below.
- Mark the task as done in the TODO file:
  - **Line Item Format**: Add `[DONE]` at the beginning of the line.
  - **Section Item Format**: Add `[DONE]` to the section title.
  - **Other Format**: Add `[DONE]` to the appropriate section or line as needed.
  **Take care to don't delete the content of the file, or change its original content, except for the addition of the `[DONE]` mark**
- IMPORTANT: Commit all changes to the current branch with a meaningful message.
- Orchestrator must not define a step to "Mark all subtasks in TODO file as [DONE]". This is WRONG. Mark a task just after it is completed.

## 5. TODO File Completion

- When all tasks of the TODO file are resolved (ie. marked as done as indicates the step 4.6), rename the file with a `-DONE` suffix (e.g., `<YYYYMMDD>-todo-<number>-DONE.md`), and commit it.
  **Take care to don't delete the file, or changes its content. Only rename it**
- Merge the current feature branch into the master branch:
  - IMPORTANT: Ensure all files are committed in feature branch. If not, commit them before continue.
  - Switch to the `main` branch, which is the master branch.
  - Merge the feature branch into the `main` branch.
  - Recheck the feature branch was correctly merged into `main` branch.
    - If it was correctly merged, then delete the feature branch. It is IMPORTANT to verify BEFORE deleting the feature branch.
    - If the feature branch was not correctly merged into the `main` branch, then ask the user to resolve the merge conflicts and then retry the merge process.
  - Check if an `origin` remote repository is configured, then push the latest `main` branch commits to the remote repository if it is configured.

## 6. Continuation

- After a TODO file is completed, check for any remaining TODO files.
- If other TODO files exist, ask the user whether to proceed with the next one or not. If the response is affirmative, then is preferable to start with the next file in a completely new chat, finalizing the current one.
- If no TODO files remain, the work is finished.

## Example (MUST READ)

This section has a minimal example of the process to prevent commons errors produced by the AI agent while trying to follow the workflow.

### TODO File

In this example the TODO File is like:

```markdown
- Task 1
- Task 2
```

### Orchestrator Plan

The overall plan that is generated by the orchestrator must includes next steps:

```text
(some other steps...)
- Task 1: 4.1. Analysis and Planning
- Task 1: 4.2. Implementation
- Task 1: 4.3. Code Review
- Task 1: 4.4. Documentation
- Task 1: 4.5. Verification
- Task 1: 4.6. Task Completion
(some other steps...)
- Task 2: 4.1. Analysis and Planning
- Task 2: 4.2. Implementation
- Task 2: 4.3. Code Review
- Task 2: 4.4. Documentation
- Task 2: 4.5. Verification
- Task 2: 4.6. Task Completion
(some other steps...)
```

Note: the plan in this example ONLY includes a clarification about how the tasks must be handled in the resolution. So, the plan itself is incomplete. It must include all details specified in the workflow.
