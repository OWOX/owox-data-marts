---
'owox': minor
---

# Skip disconnected fields in AI Helper sample-data query

Fix AI Helper alias/description generation failing with `Unrecognized name: <field>` when a data mart's Output Schema contains a field marked Disconnected ("Field is not connected to the data source"). The 30-row sample query no longer selects disconnected fields — they exist in the schema but not in the underlying table/view, so the storage rejected the whole query — and the sample fetch is skipped entirely when no connected fields remain. Hidden-for-reporting fields are intentionally kept, since the AI may still generate an alias or description for them.
