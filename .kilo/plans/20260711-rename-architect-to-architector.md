# Plan: Rename architect references to architector

## Task

The agent definition file `.kilo/agents/architect.md` was already renamed to `.kilo/agents/architector.md`. Update all remaining references to the old agent name across the codebase, ensuring "architecture" (system architecture, design patterns, `architecture.md` file) is NOT changed.

## Analysis

Files requiring changes (occurrences verified via grep and read):

### 1. `.kilo/commands/critical-workflow.md` — 4 changes

- Line 87: `Assign to architect sub-agent (\`subagent_type: "architect"\`).` → `Assign to architector sub-agent (\`subagent_type: "architector"\`).`
- Line 129: `Assign to architect sub-agent (\`subagent_type: "architect"\`).` → `Assign to architector sub-agent (\`subagent_type: "architector"\`).`
- Line 186: `- Task 1: 4.1 Analysis & Planning => architect` → `- Task 1: 4.1 Analysis & Planning => architector`
- Line 190: `- Task 1: 4.5 Verification => architect` → `- Task 1: 4.5 Verification => architector`

**Excluded** (must NOT change):
- Line 28: `technical & architecture decisions` — refers to system architecture, not agent.
- Line 92: `technical & architecture decisions` — refers to system architecture, not agent.

### 2. `.kilo/commands/project-structure.md` — 7 changes

- Line 15: `Architect sub-agent (\`subagent_type: "architect"\`)` → `Architector sub-agent (\`subagent_type: "architector"\`)`
- Line 16: `Architect sub-agent analyzes` → `Architector sub-agent analyzes`
- Line 17: `Architect sub-agent presents` → `Architector sub-agent presents`
- Line 32: `Architect sub-agent (\`subagent_type: "architect"\`)` → `Architector sub-agent (\`subagent_type: "architector"\`)`
- Line 33: `Architect sub-agent reviews` → `Architector sub-agent reviews`
- Line 34: `Architect sub-agent proposes` → `Architector sub-agent proposes`
- Line 35: `Architect sub-agent presents` → `Architector sub-agent presents`

### 3. `README.md` — 2 changes

- Line 53: `Analysis["4.1 Analysis & Planning<br/><small>[Architect]</small>"]` → `Analysis["4.1 Analysis & Planning<br/><small>[Architector]</small>"]`
- Line 101: `[Architect sub-agent](.kilo/agents/architect.md)` → `[Architector sub-agent](.kilo/agents/architector.md)`

**Excluded** (must NOT change):
- Line 36: `architecture.md` — project info file name.
- Line 5: `architectural standards` — refers to system architecture standards.

### 4. `CHANGELOG.md` — 5 changes

- Line 12: `.kilo/agents/architect.md` → `.kilo/agents/architector.md`
- Line 34: `Created \`architect\` subagent` → `Created \`architector\` subagent`
- Line 34: `(\`.kilo/agents/architect.md\`)` → `(\`.kilo/agents/architector.md\`)`
- Line 37: `\`plan\` → \`architect\`` → `\`plan\` → \`architector\``
- Line 38: `with \`Architect sub-agent\`/\`Implementer sub-agent\`` → `with \`Architector sub-agent\`/\`Implementer sub-agent\``

## Implementation Steps

1. **Git Feature Branch Setup**
   - Ensure working tree is clean.
   - Switch to `main` branch.
   - Create and switch to branch: `feat/rename-architect-to-architector`.

2. **Apply Text Changes**
   - Edit `.kilo/commands/critical-workflow.md` with the 4 replacements above.
   - Edit `.kilo/commands/project-structure.md` with the 7 replacements above.
   - Edit `README.md` with the 2 replacements above.
   - Edit `CHANGELOG.md` with the 5 replacements above.

3. **Verification**
   - Run `grep -r "architect" --include="*.md" .` and confirm only legitimate "architecture" references remain (e.g., `architecture.md`, `architectural standards`, `technical & architecture decisions`).
   - Run `grep -r "architector" --include="*.md" .` and confirm all expected references are present.

4. **Commit**
   - Stage all modified files.
   - Commit with message: `fix: rename architect agent references to architector`.

5. **Merge & Cleanup**
   - Switch to `main`.
   - Merge `feat/rename-architect-to-architector`.
   - Delete feature branch.
   - Push `main` to `origin` if remote is set.
