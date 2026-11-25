---
'owox': minor
---

**Plugins no longer get a server error when they save several collection documents at once**

A plugin keeps its state in collections, for example member preferences or a shared dashboard. Previously, when a plugin saved or deleted two or more documents at the same time, some of these requests failed with `HTTP_ERROR`, status 500. A failed request saved nothing, so the change was lost unless the plugin sent it again. Two plugins in one project failed the same way when they saved at the same time. Plugins in different projects also failed when they created new documents at the same time. The cause was a database deadlock between the parallel requests. Now the requests in one project wait for each other, and each one completes.

Only deployments with a MySQL database had this error, OWOX Data Marts Cloud included. SQLite deployments did not have it. See [Persist plugin state as JSON with collections](../../docs/plugins/authoring-guide.md#persist-plugin-state-as-json-with-collections).

<!-- markdownlint-disable-file MD041 MD036 -->
