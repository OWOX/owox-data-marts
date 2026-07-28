---
'owox': minor
---

# Data Last Updated Date

You can now see when the source tables behind a Data Mart last changed in the warehouse — in the UI and through MCP.

**In the UI.** The Data Mart page shows a **Data Last Updated** tile with a Check now button; the Data Marts list gains a sortable **Data Last Updated** column; and the model canvas shows the value on every node plus a toolbar button that measures everything currently visible in one go. Checking is free: it reads warehouse metadata only, registers no consumption, and records no run.

**In MCP.** The `query_data_mart` tool returns a `data_last_updated` block alongside the rows and totals, so an assistant can answer "how current is this data?" instead of guessing. It reports when the source tables behind the result last changed, which tables were checked, and how complete that picture is. The value is measured live, as part of the same call that reads the data — never cached and never charged separately. Because it is measured against the fully composed query, a blended result covers every joined Data Mart's tables, not just the primary one. Each MCP query run also records the block in Run History.

Google BigQuery is supported first: `TABLE`, `VIEW`, `SQL`, `TABLE_PATTERN`, and connector-backed Data Marts all resolve through to their underlying base tables, including nested views and sharded/wildcard table sets. Other storages report `unavailable` until their support lands.

Read the timestamp precisely: it says when the source tables were last **written to**, not which period the data covers — a table rewritten today may have backfilled only figures from years ago. This is why the field is called *data last updated* rather than *freshness*, and the tool instructs the assistant to phrase it that way. A `null` timestamp means unknown, neither fresh nor stale, and `coverage: "partial"` means some sources could not be read, so the real time can only be more recent than reported. Views are deliberately excluded from the per-table detail, because a view's own modification time reflects a change to its definition rather than to any data.
