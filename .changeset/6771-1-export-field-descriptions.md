---
'owox': minor
---

# Include field descriptions in the Models canvas exports

The Models canvas export dropped the business descriptions of Output Schema fields: in the OKF bundle the schema table's Description column carried only the PK/FK notes, and the JSON model graph omitted the field descriptions entirely.

Both formats now carry each field's description as stored in the Data Mart:

- **OKF (Markdown)** — the Description cell reads `PK.` → description → `FK to [Target]`, matching the order OWOX Model Canvas produces. Multi-line descriptions collapse to a single line so they cannot break the Markdown table.
- **JSON** — every schema field gains a `description` property when one is set, staying compatible with the OWOX Model Canvas graph format.
