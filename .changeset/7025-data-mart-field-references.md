---
'owox': minor
---

**Tell your AI assistant which Data Mart field to use**

Project, Context, and Data Mart descriptions can now link to a specific output-schema field, including calculated fields, rather than naming a metric in plain text. Type `@`, select a published Data Mart by title and icon, and search its fields by alias or technical name. The link gives your AI assistant an exact field reference to verify against the schema.

The video shows a business description linked to a metric, navigation to that field, and the editor in all three description locations:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/d025ebc604f5407675985ffbc31579f9/iframe>

- Opening a field link expands **Output Schema** and any parent records, scrolls to the exact field, and highlights it. If the field was renamed or removed, the link still opens the Data Mart normally. Saved labels and technical names remain as inserted.
- Escape returns from fields to the Data Mart list, then closes the picker while preserving the description draft. You can continue typing literal `@` text after dismissal; Tab also closes the picker when focus leaves it.
- Description editors show Data Mart icons in Preview, more space above the first line, and a single Markdown label. Links do not change context assignments or access permissions.

See [Business descriptions and Data Mart links](../../docs/project/contexts.md#business-descriptions-and-data-mart-links).

<!-- markdownlint-disable-file MD041 MD036 -->
