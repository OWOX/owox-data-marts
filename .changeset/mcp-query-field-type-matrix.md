---
'owox': minor
---

# Guide AI queries with a field type → operators/aggregations matrix

The MCP tools now tell an AI assistant up front which filter operators and aggregation functions each field supports, instead of letting it find out through failed queries:

- `get_data_mart_details_by_id` enriches every native and joined field with its type `category` and the effective `allowedAggregations` a query may apply to it, and returns an `operators_by_category` matrix for the filter/slice operators each field-type category accepts.
- The `query_data_mart` tool description embeds a field-type matrix generated from the same constants the validator enforces.
- Operator/type mismatches (for example `contains` on a number) now return a targeted `invalid_operator_for_type` error that lists the operators the field does accept, instead of a generic failure that sent assistants re-fetching the schema in a loop; `date_buckets` misuse gets equally specific `invalid_date_bucket` errors.
- Boolean fields are now filterable: `eq`/`neq` with a boolean `true`/`false` value translate to the internal `is_true`/`is_false` operators.
- The `unsupported_operator` message no longer suggests emulating `in` with several `eq` filters — filters combine with AND, so that advice could never match a row.
