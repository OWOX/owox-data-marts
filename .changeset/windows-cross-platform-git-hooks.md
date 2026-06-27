---
'owox': minor
---

# Cross-platform git hook setup on Windows

The husky setup script generated a Windows batch-style pre-commit hook (`@echo off ...`), but Git executes hooks through sh on every OS — including the sh.exe bundled with Git for Windows — so the hook failed with `@echo: command not found` and blocked commits on Windows. The script now always writes a POSIX shell hook in the modern husky v9 format, and re-heals stale or deprecated hooks on the next install. This also clears the `husky - DEPRECATED` warning that would otherwise break under husky v10.
