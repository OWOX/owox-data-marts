---
'owox': minor
---

**Explore business contexts with your AI assistant**

Connected AI assistants can read complete context descriptions and discover Data Marts within selected contexts. Search, catalog, and Data Mart details now include attached context names and IDs, while preserving each user's existing access. Empty context results no longer suggest creating a first Data Mart when accessible published Data Marts exist elsewhere.

In Project, Context, and Data Mart descriptions, use Markdown and type `@` to find a published Data Mart, identified by its icon. Link the entire Data Mart or choose an output-schema field, including calculated fields. Search fields by alias or technical name to give your AI assistant a concrete reference to the intended metric.

The video shows business context linked to a specific metric, navigation to its Output Schema field, and the same editor in all three description locations:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/d025ebc604f5407675985ffbc31579f9/iframe>

- Field links (`?field=...`) open Data Setup, expand Output Schema and any parent records, scroll to the exact field, and highlight its row. A renamed or removed field still opens the Data Mart normally. Saved labels and field names stay as inserted when the schema changes.
- Preview formatted descriptions before saving. The editor has more space above its first line and a single Markdown label.
- Press Escape to step back or close the reference picker while keeping your Context draft. If saving a Data Mart description fails, the draft stays in the editor for retry.
- Links explain which data supports a goal; they do not change context assignments or permissions.

See [MCP](../../docs/getting-started/setup-guide/mcp.md) and [Contexts](../../docs/project/contexts.md).

<!-- markdownlint-disable-file MD041 MD036 -->
