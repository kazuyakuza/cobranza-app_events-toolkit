# Gitignore Compliance Rule

- Before any commit, agents MUST read `.gitignore` and run `git status`.
- Agents MUST ensure no `.gitignore`-matching files are staged; unstage if found.
- Agents MUST NOT force-add tracked files that match `.gitignore` patterns.
- Be aware of common dependency dirs per language (`node_modules/`, `vendor/`, `__pycache__/`, `target/`, `packages/`, `.venv/`). After dependency installs, verify none are staged. If the dir isn't gitignored, flag to user.