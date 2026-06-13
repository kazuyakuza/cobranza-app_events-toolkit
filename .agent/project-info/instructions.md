# Project Info Instructions

AI Agents must follow defined behaviour in this file.

## Initial Instruction

AI agents MUST evaluate project info files at the start of EVERY task. The project info files are located in `.agent/project-info` folder.

When starting a task, include `[Project Info: Active]` at the beginning of response if successfully read the project info files, or `[Project Info: Missing]` if the folder doesn't exist or is empty. If project info is missing, warn the user about potential issues and suggest initialization.

## Integration in AGENTS.md

All project info files must be referenced/linked in AGENTS.md file at root.

## Project Info Structure

The project info consists of core files and optional context files, all in Markdown format.

### Core Files (Required)

1. `brief.md` - Core requirements, goals, and source of truth for project scope.
2. `product.md` - Core user experience, problem definition, and product goals.
3. `context.md` - Factual log: Current work focus, recent changes, and immediate next steps.
4. `architecture.md` - System architecture, paths, design patterns, and critical paths.
5. `tech.md` - Stack, development setup, technical constraints, and tool usage patterns.

### Additional Files

Create additional files/folders within project-info/ when they help organize: complex feature doc, integration specs, API doc, testing strategies, deployment procedures, etc.

## Core workflows

### Project Info Initialization (Plan Mode Trigger)

When the user requests initialization via the phrase "initialize project info" **while in Plan Mode**, perform an exhaustive analysis of the repository (source code, configs, structures, and dependencies).
After analysis:

- Provide a technical summary to the user.
- Create the `.agent/project-info/` structure and files.
- Remove `.agent/project-info/.initialized` file.
- Ask for user approval before finishing the Plan step.

### Project Info Update

#### Project Info updates occur when

1. Discovering new project patterns
2. After implementing significant changes
3. When user explicitly requests with the phrase **update project info** (MUST review ALL files)
4. When context needs clarification

#### To execute project info update

1. Review ALL project files
2. Document current state
3. Document Insights & Patterns
4. If requested with additional context (e.g., "update project info using information from @/Makefile"), focus special attention on that source

### Regular Task Execution & Context Upkeep

1. **Automatic Read**: At the start of EVERY task, you MUST automatically read `.agent/project-info/context.md` to understand the current state of the project.
2. **On-Demand Read**: read `architecture.md`, `tech.md`, or `product.md` when task directly impacts them or you need specific technical patterns.
3. **Visual Anchor**: Include `[Project Info: Active]` at the beginning of your first response to confirm `context.md` was successfully parsed.

Acknowledge alignment like this:
"[Project Info: Active] I understand we're building a [App Name]. Currently working on [Context Focus]."

**Critical Closing Step**: Before emitting the final completion signal or stopping execution, the agent MUST explicitly update `.agent/project-info/context.md` with the recent changes, current state, and next steps.

## Context Window Management

When the context window fills up during an extended session:

1. Automatically write the current session state into `.agent/project-info/context.md`.
2. Recommend the user to start a fresh chat session.
3. In the new conversation, the agent will parse the updated `context.md` to resume seamlessly.

## Important Notes

If inconsistencies are detected between files, prioritize `brief.md` and alert the user.
