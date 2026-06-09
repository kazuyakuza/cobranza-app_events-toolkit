# How to Write TODO Files

TODO files are the recommended way to assign work to AI agents. They are placed in `.agent/todos/<YYYYMMDD>/` and named `<YYYYMMDD>-todo-<number>.md`.

## Recommended Formats

These formats are recommended guidelines. AI agents can handle other formats or will ask for clarification when the structure is unclear.

### Line Items (Simple)

Each line starting with `-` is a separate task:

```markdown
- Implement user login
- Add dark mode toggle
- Update API documentation
```

### Section Items (Structured)

When you need more context per task, use heading-based formats. The agent applies the **first matching pattern** from the list below.

#### Pattern A — Multiple top-level headings

Each `#` section is one task:

```markdown
# Implement user login
Details about the login feature...

# Add dark mode toggle
Details about the theme switcher...
```

#### Pattern B — Headings within a parent topic

Each `##` section is one task:

```markdown
# Authentication System

## Implement user login
Details about the login feature...

## Add password reset
Details about password recovery...
```

#### Pattern C — Dedicated Tasks section

Each `###` inside a `## Tasks` section is one task:

```markdown
# Authentication System

## Overview
Background and context...

## Tasks

### Implement user login
Details about the login feature...

### Add password reset
Details about password recovery...
```

## Sub-items

Bullet-point items or checkboxes under a task heading belong to that task — they do **not** spawn additional tasks.

```markdown
- Implement user login
  - [ ] Write unit tests
  - [ ] Update API docs
```

In the example above, "Write unit tests" and "Update API docs" are sub-items of "Implement user login", not separate tasks.

## Pattern Matching Priority

The agent evaluates section items in order and applies the **first matching pattern**:

1. **Pattern C** (`# Title` → `## Tasks` → `### Heading`) — if a `## Tasks` section exists
2. **Pattern B** (`# Title` → `## Heading`) — if `##` headings exist without a `## Tasks` section
3. **Pattern A** (multiple `# Heading`) — if only `#` headings exist

For the full technical specification, see [`.kilo/commands/critical-workflow.md`](../.kilo/commands/critical-workflow.md).
