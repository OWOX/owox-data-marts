---
'owox': minor
---

# Handle array fields safely in reports

Reports can display repeated fields and fields whose existing schema type is `ARRAY` as columns. Filters, slices, sorting, aggregations, and date buckets are unavailable for these fields, including count, any-value, and blank checks. Reports with stored array controls must have those controls removed or be recreated before saving or running.

Joined arrays are returned as JSON arrays that preserve each source row's array; each ancestor join adds another array level. Existing deduplication overrides on joined array fields are ignored in favor of this JSON-array rollup. Ordinary nested scalar fields and opaque JSON, VARIANT, and SUPER fields keep their existing report controls.

Whole records selected as columns are exported to Google Sheets as JSON text. Selecting their nested scalar fields continues to work as before.
