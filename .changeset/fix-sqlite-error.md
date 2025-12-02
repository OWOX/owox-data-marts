---
owox: minor
---

# Fix migration error on application start with SQLite database

Fixed an issue where users running OWOX with SQLite database could encounter errors like "SQLITE_ERROR: no such column: runType" during database migrations.
