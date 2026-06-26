---
'owox': minor
---

# Cross-platform npm scripts on Windows

Wrap inline environment-variable assignments in npm scripts with `cross-env` so they run on Windows (cmd/PowerShell), not only on Unix shells. Previously `npm run dev -w owox` and the package `test` scripts failed on Windows because the `VAR=value command` form is Unix-only syntax, forcing contributors to edit the scripts by hand. Windows contributors can now run development and test scripts out of the box.
