---
'owox': minor
---

**SQL validation no longer fails for large queries**

SQL validation (dry run) previously failed with a server error for queries over 64 KB. Large
queries now validate normally, and queries over the request-size limit return a clear error
instead of a 500.

<!-- markdownlint-disable-file MD041 MD036 -->
