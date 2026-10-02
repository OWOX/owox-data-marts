---
'owox': minor
---

**Custom connector mistakes that failed runs are now named, with the fix**

A node that put `{{ dateWindow.start }}` or `{{ dateWindow.end }}` into its request path or body
without fetching by date window was published, and every run then failed with
`Template path "dateWindow.start" is unresolved`. **Publish** and **Test** now refuse such a node
and say which node it is and how to fix it: add an incremental strategy, or remove the template.

A Data Mart that selects a field its connector no longer provides, after the field was renamed
or removed, failed the run that creates its table with `Required field timezone not found in
schema`, and **Edit Fields** kept the field when saved, since it had no checkbox to clear. The
error now names the field and points to **Edit Fields**, which now drops a field the connector no
longer provides when you save.

The Connector Builder guide, the manifest reference and the authoring guide for AI assistants
describe both, and tell an assistant to keep the names of a published connector's fields.

<!-- markdownlint-disable-file MD041 MD036 -->
