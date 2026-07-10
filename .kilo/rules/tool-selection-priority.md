# Tool Selection Priority Rule

- Before using any tool, evaluate the FULL set of available tools — including all MCP-provided tools — for the operation at hand.
- Prefer tools with semantic understanding of the codebase (e.g., `vscode-mcp-server_rename_file_code`, `vscode-mcp-server_move_file_code`, `Bifrost_*`) over raw file or text commands for code operations.
- `semantic_search` is also available for exploring/understanding codebase. This tool understands meaning, not just keywords — use natural language descriptions of what you're looking for (e.g., "how is authentication handled?").
- Prefer structured editors (`vscode-mcp-server_replace_lines_code`, `vscode-mcp-server_create_file_code`) over plain `edit` for code changes.
- For code reading/searching/navigation/edit/refactor, prefer mcp tools like: `vscode-mcp-server_*` and `Bifrost_*`.
- For files/folders manipulation (reading, renaming, moving, editing, navigating, etc), prefer mcp tools like: `vscode-mcp-server_*` and `Bifrost_*`.
- Reserve `bash` for CLI-native operations (git, npm, builds, tests, and similar cmds) — not for file manipulation or code refactoring.
- Never use `vscode-mcp-server_execute_shell_command_code`.
- When using bash tool:
  - if "unknown cmd" or similar error arises, try up to 2 more times the same cmd.
  - prevent execute cmds composed by sub-cmds (cmds with &/&&, for example)
- Fall back to `bash` or `edit` only when no semantic MCP tool covers the operation.
- On `bash` tool, only run single cmds, ie. not concurrent nor chained cmds.
