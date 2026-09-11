---
'owox': minor
---

# Handle array fields safely in reports

Reports can now display repeated fields and fields whose schema type is `ARRAY` as columns without offering filters, slices, sorting, aggregations, or date buckets that would generate invalid SQL. Joined arrays are returned as JSON.
