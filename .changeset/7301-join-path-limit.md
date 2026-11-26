---
'owox': minor
---

**Relationships that repeat join paths no longer make OWOX Data Marts unavailable**

A Data Mart can reach other Data Marts through a chain of relationships, and each route is a join path with its own fields in the column picker. Previously, when the relationships of a storage repeated paths, for example a reverse relationship next to each relationship, one Data Mart could reach millions of join paths. Its column picker, data preview, Graph view, a report run, an HTTP Data request or an MCP tool call then used all the server memory. The server stopped answering for every user of the deployment until it restarted. Now OWOX Data Marts stops at 5,000 join paths per Data Mart and returns the error `TOO_MANY_JOIN_PATHS`, which tells you to remove the relationships that repeat a path.

See [Too many join paths](../../docs/getting-started/setup-guide/joinable-data-marts.md#too-many-join-paths).

<!-- markdownlint-disable-file MD041 MD036 -->
