# Changelog

All notable changes to the AI Agent Driven Development base project will be documented in this file.

## 2026-05-25

### Changes

#### Critical Workflow Enforcement

- **Force Task Delegation**: All agent assignments in the critical workflow now use explicit `task` tool invocations instead of `@mentions`
  - Added CRITICAL rule: Plan Agent MUST NOT assign the entire global plan or all 4.x steps to a single sub-agent
  - Each sub-step (4.1-4.6) now requires a separate `task` tool invocation
  - Updated all workflow examples and error handling to reference `task` tool
  - Fixed typo in path templates: `<YYYYMMDD}` → `<YYYYMMDD>`

#### Configuration Changes

- **Plan Agent Prompt Externalized**: Moved Plan Agent behavior prompt from `kilo.jsonc` to dedicated `.kilo/modes/plan.md` file
  - Simplified `kilo.jsonc` to only enable plan agent; no inline prompt
  - Added `.kilo/commands/**/*.md` to instruction paths in config

#### New Rules

- **Tool Selection Priority Rule** (`.kilo/rules/tool-selection-priority.md`): Agents must prefer semantic/code-aware tools over raw file commands for code operations
- **Gitignore Compliance Rule** (`.kilo/rules/gitignore-compliance.md`): Agents must verify `.gitignore` before every commit and ensure no ignored files are staged

#### Agent Availability

- **Custom Agents Always Available**: Changed all 4 custom agents (`code-reviewer`, `code-simplifier`, `docs-specialist`, `frontend-specialist`) from `mode: subagent` to `mode: all`
- Normalized bash permission format across agent definitions

#### New File: `.kilocodeignore`

- Added `.kilocodeignore` to control codebase indexing exclusions: lock files, dependency directories, build outputs, binary/media assets, and IDE configs

#### Minor Fixes and Updates

- Updated `.agent/RULES.md`: Added links to the two new rules
- Updated `.agent/project-structure.md`: Added `.kilo/modes/` directory reference
- Updated `.agent/project-info/brief.md`: Added `.kilocodeignore` mention, fixed workflow path reference
- Updated `.kilo/commands/project-structure.md`: Replaced `@general`/`@code` mentions with `Plan sub-agent`/`Code sub-agent` and `task` tool
- Updated `.kilo/commands/project-info-init.md`: Replaced `@plan` with `/critical-workflow` command reference
- Updated `.kilo/rules/important-paths.md`: Fixed typo in plan file path template
- Updated `.kilo/rules/markdown-generation-rule.md`: Replaced `@agent` mentions with explicit agent names

## 2026-05-20

- Fixes mermaid diagram in README file
- Removes workflows files under deprecated workflows folder (already moved to commands)
- Removes this project's plan files

## 2026-05-19

### Changes

#### Major Restructuring

- **Folder Migration**: `.kilocode/` → `.kilo/`
  - Workflows moved from `.kilo/workflows/` to `.kilo/commands/`
  - Updated all references in documentation and workflows
  - Commands now invoked via `/command-name` format

- **Folder Migration**: `.ai-agent/` → `.agent/`
  - Project info files moved from `.kilo/project-info/` to `.agent/project-info/`
  - Updated instructions to reference new paths
  - Created `.initialized` marker file for new projects

- **Memory Bank → Project Info Migration**
  - Replaced Memory Bank with Project Info system
  - Project info files now located in `.agent/project-info/`
  - Updated AGENTS.md to reference Project Info instructions

#### Configuration Updates

- **Kilo.jsonc Rewrite**
  - Removed deprecated fields: `experimentalWorkflow`, `strictWorkflow`, `planStoragePath`, `requireUserApproval`
  - Removed deprecated blocks: `subagents`, `features`
  - Added `agent.plan.prompt` for strict planning behavior
  - Updated instructions path to `.kilo/rules/**/*.md`

#### New Custom Agent Definitions

Created 4 custom agent files in `.kilo/agents/`:

- `code-reviewer.md` - Code quality, security, and plan deviations
- `docs-specialist.md` - Documentation and code comments
- `code-simplifier.md` - Code simplification and refactoring
- `frontend-specialist.md` - Frontend development tasks

#### Workflow Updates

- **Critical Workflow**: Updated to use new command structure
  - Agent mentions: `@code`, `@code-reviewer`, `@docs-specialist`, `@general`
  - Plan directory: `.kilo/plans/` (was `.kilo/_generated/plans/`)
  - Removed deprecated agent references

- **Project Info Initialization**: Updated trigger conditions
  - Checks for `.initialized` marker file instead of text match
  - Simplified workflow description

#### Rule Changes

- **New Rules Added**:
  - `markdown-generation-rule.md` - Defines which agents can create markdown files
  - `military-mode-communication.md` - Concise output with state tracking requirement
  - `max-lines-per-file.md` - Restricts source code files to 200 lines

- **Rules Removed**:
  - `prevent-empty-responses.md` - Superseded by military-mode-communication
  - `git-commit-msg.md` - AI models already know Conventional Commits

- **Rules Updated**:
  - `markdown-generation-rule.md` - Restricting agent permissions
  - `military-mode-communication.md` - Adding state tracking
  - `max-lines-per-file.md` - Scope to src/code only
  - `newline-prevention.md` - Shortened from 51 to 5 lines
  - `important-paths.md` - Updated plan directory path

#### Documentation Updates

- **README.md**: Updated all references from `.kilocode/` and `.ai-agent/` to new paths
- **AGENTS.md**: Restructured with links to project info sections
- **brief.md**: Removed HTML comment marker block
- **WORKFLOWS.md**: Updated workflow command paths

#### Cleanup

- Removed `.kilo/_generated/` directory (was `.kilo/_generated/plans/`)
- Added `.kilo/plans/.gitkeep` for plan directory
- Updated `.gitignore` with agent-manager.json

#### Security Improvements

- Added security note to `how-to-set-up-git.md` recommending SSH keys or GitHub CLI
- Updated `.gitignore` to ignore agent-manager.json

### Technical Details

- All workflow files migrated to command format with YAML frontmatter
- Commands now support agent assignment and permissions
- State tracking enhanced with `.kilo/state.json` updates
- Plan file locations unified across all workflows

### Breaking Changes

- Workflows now use `/command-name` format instead of file references
- Plan storage path changed from `.kilo/_generated/plans/` to `.kilo/plans/`
- Agent mentions changed from descriptive text to `@agent-name` format
