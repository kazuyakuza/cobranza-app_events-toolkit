# Git Remote Safety Rule

- Push only to `origin`. Never push to other remotes unless explicitly instructed.
- Upstream remotes (`base-project`, `upstream`, etc.) are fetch-only sources — not push targets.
- Before any `git push`, verify the target remote against this rule.