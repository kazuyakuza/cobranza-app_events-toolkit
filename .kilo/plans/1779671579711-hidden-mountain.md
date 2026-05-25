# Plan: Critical Workflow Fixes

## Problem Summary

The Plan Agent generates a global plan but delegates ALL execution steps to a single code agent instead of dispatching each sub-step (4.1-4.6) as separate `task` tool invocations. The code agent ends up doing 4.1 (planning per task), which violates the workflow.

## Comprehensive Bad-Reference Audit

Stale `@agent` mentions and old paths found across the project:

| File | Issue |
|------|-------|
| `brief.md:35` | `.kilo/workflows/critical-workflow.md` → `.kilo/commands/critical-workflow.md` |
| `project-structure.md` | `@general` and `@code` throughout |
| `project-info-init.md:29` | `Switch to @plan` |
| `markdown-generation-rule.md:3-5` | `@plan`, `@code-reviewer`, `@docs-specialist` |

## Changes

### 1. `critical-workflow.md` — Strengthen delegated execution

**a)** Replace "new task tool" with "`task` tool" throughout (6 occurrences in current version).

**b)** Add explicit prohibition in 4.0 — right after "Process TODO tasks in file order":

```markdown
- **CRITICAL**: Plan Agent MUST NOT assign the entire global plan or all 4.x steps for a task to a single sub-agent. Each step (4.1, 4.2, 4.3, 4.4, 4.5, 4.6) MUST be created as a separate `task` tool invocation.
```

**c)** Add at the start of 4.1:

```markdown
- **CRITICAL**: The Plan Agent (itself, via `task` tool to plan sub-agent) executes 4.1. The code agent must NOT generate implementation plans.
```

**d)** Fix "Plan subagent" → "Plan sub-agent" (consistency with "Code sub-agent", etc.).

### 2. `kilo.jsonc` — Instructions + prompt

**a)** Add all workflows and rules to instructions:

```jsonc
"instructions": [
  ".kilo/rules/**/*.md",
  ".kilo/commands/**/*.md"
]
```

**b)** Add a plan agent prompt that enforces the critical workflow's core rules concisely:

```jsonc
"agent": {
  "plan": {
    "enabled": true,
    "prompt": "You are the Plan Agent. Follow .kilo/commands/critical-workflow.md strictly: (1) Generate global plan with steps 2-6; for each TODO task include explicit 4.1-4.6 entries. (2) Execute global plan step by step using the `task` tool — never delegate all steps to one sub-agent. (3) Save implementation plans to .kilo/plans/<YYYYMMDD>-<plan-name>.md. (4) Verify sub-step completion before advancing; on failure reassign or escalate. (5) Maintain state in .kilo/state.json."
  }
}
```

### 3. `brief.md` — Fix stale path

Line 35: `.kilo/workflows/critical-workflow.md` → `.kilo/commands/critical-workflow.md`

### 4. `project-structure.md` — Update agent references + frontmatter

**a)** Change frontmatter from `agent: general` to `agent: plan`. Analysis/planning work belongs to Plan Agent.

**b)** Replace `@general` / `@code` with Kilo-compatible terminology. Analysis steps use Plan sub-agent; creation steps use Code sub-agent. All occurrences (lines 15-19, 32-38). Pattern:

```
Switch to @general mode  →  Use `task` tool to assign to Plan sub-agent
@general mode analyzes   →  Plan sub-agent analyzes
switch to @code mode     →  Use `task` tool to assign to Code sub-agent
@code mode creates       →  Code sub-agent creates
```

### 5. `project-info-init.md` — Update @plan reference

Line 29: `Switch to @plan` → trigger plan mode via `/critical-workflow` since the command already has `agent: plan` frontmatter. Replace with:

```
"After you define brief.md file, in a new chat, you must: run `/critical-workflow`, select the best available AI model, then Ask to 'initialize project info'"
```

### 6. `markdown-generation-rule.md` — Update agent names

Replace `@plan` / `@code-reviewer` / `@docs-specialist` with Plan Agent / Code Reviewer / Docs Specialist:

```markdown
- Plan files (.kilo/plans/): Only Plan Agent and Code Reviewer can create/modify.
- Documentation files: Only Plan Agent and Docs Specialist can create/modify.
- Other markdown files: Only Plan Agent can create/modify.
```

### 7. README.md — No changes needed

The `follow /critical-workflow` syntax already uses the correct Kilo slash-command format. The command file's `agent: plan` frontmatter correctly triggers plan mode.

## Architect Agent Consideration

**Decision: Use built-in Plan Agent. No separate architect agent needed.**

Kilo's `plan` mode (`agent: plan` frontmatter + `plan.enabled: true`) is the successor to the old Kilocode architect mode. It handles the deep analysis, complex task breakdown, and solution design that the old architect provided — plus it has `plan_exit` and plan-file management tools a custom agent would lack. The prompt added in change #2 ensures the Plan Agent operates with the same strict, step-by-step discipline.

### 8. Agent Frontmatter — Fix permission ordering + consistency

All 4 custom agents have `mode: all` (correct). Two permission issues found:

**`code-reviewer.md`** — bash rule ordering is wrong. `"*": deny` comes before `"git *": allow`, so `*` matches git commands first and blocks them. Fix by reversing order:

```yaml
# Before (broken)
bash:
  "*": deny
  "git *": allow

# After (correct)
bash:
  "git *": allow
  "*": deny
```

**`docs-specialist.md`** — `bash: deny` is a plain string while `code-reviewer` uses object format. Standardize to object for consistency:

```yaml
# Before (inconsistent)
bash: deny

# After (consistent)
bash:
  "*": deny
```

**`code-simplifier.md`** and **`frontend-specialist.md`** — No permissions (full access). Correct for code-writing agents, no changes needed.
