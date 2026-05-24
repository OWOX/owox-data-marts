---
'owox': minor
---

# Slices: filter joined data marts before they are joined

Reports on joined data marts gain pre-join filters ("slices") — a filter applied INSIDE the joined data mart's `*_raw` CTE before the JOIN,
so large subsidiary tables can be narrowed to the rows you need upstream.
The Slices section appears next to Filters / Sort / Limit in the Report editor; a tooltip explains that under LEFT JOIN a slice narrows the subsidiary but does not drop home-mart rows — add a Filter on the joined column for row elimination.
BigQuery only for v1; columns that disappear from the schema after save are flagged in the UI and rejected with a structured 400 on save.
