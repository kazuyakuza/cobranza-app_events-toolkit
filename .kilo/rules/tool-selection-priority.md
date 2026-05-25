# Tool Selection Priority Rule

- Before using any tool, evaluate the FULL set of available tools — including all MCP-provided tools — for the operation at hand.
- Prefer tools with semantic understanding of the codebase (e.g., `vscode-mcp-server_rename_file_code`, `vscode-mcp-server_move_file_code`, `Bifrost_*`) over raw file or text commands for code operations.
- Prefer structured editors (`vscode-mcp-server_replace_lines_code`, `vscode-mcp-server_create_file_code`) over plain `edit` for code changes.
- Reserve `bash` for CLI-native operations (git, npm, builds, tests) — not for file manipulation or code refactoring.
- Fall back to `bash` or `edit` only when no semantic MCP tool covers the operation.