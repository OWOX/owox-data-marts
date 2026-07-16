---
'owox': minor
---

# Sort rows from the query_data_mart MCP tool

The `query_data_mart` MCP tool now accepts a `sort` parameter — an ordered list of `{ field, direction }` rules (`asc`/`desc`, first rule primary) — so an AI assistant can order query results (for example "top 10 campaigns by spend, descending") without post-processing. Each sorted field must also be listed in `fields`, matching the existing `aggregations` and `date_buckets` rules. This brings the MCP tool in line with the sorting already available in the Reports, HTTP Data streaming, and CLI query paths.
