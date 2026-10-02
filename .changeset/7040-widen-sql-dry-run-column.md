---
'owox': minor
---

**SQL validation now accepts queries up to 16 MB**

SQL validation (dry run) previously failed with a server error for queries over 64 KB. The
storage column now holds up to 16 MB, and queries over that limit return a clear validation
error instead of a 500.

<!-- markdownlint-disable-file MD041 MD036 -->
