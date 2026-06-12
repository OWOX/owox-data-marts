---
'owox': minor
---

# Escape table and column identifiers in AI Helper sample-data SQL

Fix AI Helper metadata generation (and the `SAMPLE_TABLE_DATA` AI tool) failing with `Syntax error: Expected end of input but got "-"` for data marts whose fully qualified table name contains dashes (for example `my-project.dataset.my-table-name`). The sample-data SQL now escapes the table reference and column names per storage type via a new `IdentifierEscaperFacade`, following the existing TypeResolver + Facade pattern and reusing the per-storage identifier escaping utilities.
