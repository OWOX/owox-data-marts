---
'owox': minor
---

# Cross-platform Windows support for dev scripts and git hooks

Two Unix-only assumptions broke first-time setup on Windows; both are fixed:

- **npm scripts** — inline `VAR=value command` environment-variable assignments (e.g. `npm run dev -w owox` and the package `test` scripts) are wrapped with `cross-env` so they run under cmd/PowerShell, not only Unix shells. No new dependency (`cross-env` is already a hoisted root devDependency) and no lockfile change.
- **git hooks** — the husky setup script emitted a Windows batch-style pre-commit hook (`@echo off …`), but Git executes hooks through `sh` on every OS (including the `sh.exe` bundled with Git for Windows), so the hook failed with `@echo: command not found` and blocked commits. It now writes a POSIX shell hook in the modern husky v9 format and self-heals only the stale/deprecated formats it previously generated, leaving hand-edited hooks untouched. This also clears the `husky - DEPRECATED` warning that breaks under husky v10.
