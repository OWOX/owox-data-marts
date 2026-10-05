---
'owox': minor
---

**SQL validation no longer fails for large queries**

On MySQL-backed deployments, SQL validation (dry run) failed with a server error for queries
over 64 KB. Large queries now validate normally.

<!-- markdownlint-disable-file MD041 MD036 -->
