---
'owox': minor
---

# Guide AI queries with a field type → operators/aggregations matrix

The MCP tools now tell an AI assistant up front which filter operators and aggregation functions each field supports, instead of letting it find out through failed queries:

- `get_data_mart_details_by_id` enriches every native and joined field with its type `category` and the effective `allowedAggregations` a query may apply to it, and returns an `operators_by_category` matrix for the filter/slice operators each field-type category accepts.
- The `query_data_mart` tool description embeds a field-type matrix generated from the same constants the validator enforces.
- Operator/type mismatches (for example `contains` on a number) now return a targeted `invalid_operator_for_type` error that lists the operators the field does accept, instead of a generic failure that sent assistants re-fetching the schema in a loop; `date_buckets` misuse gets equally specific `invalid_date_bucket` errors.
- Boolean fields are now filterable: `eq`/`neq` with a boolean `true`/`false` value translate to the internal `is_true`/`is_false` operators.
- New `in`/`not_in` filter operators (match any of / none of a value list, up to 500 values) are supported natively across all output-controls storages — BigQuery, Athena, Redshift, Snowflake, and Databricks. They are available in the report filter/slice UI as "is any of" / "is none of" (comma-separated values) for string, number, date, and time columns, and in `query_data_mart` filters/slices; `is_empty`/`is_not_empty` are now also accepted by `query_data_mart` for string fields.
- Malformed operands for supported operators (empty `in` list, bad `between` shape) now return a precise `invalid_filter_value` error instead of a generic failure.
- New relative-date presets on every storage, in the report UI, and in `query_data_mart`: **This week / Last week** (ISO weeks, Monday-based on all storages — BigQuery uses `ISOWEEK`, Snowflake computes the Monday independently of the session `WEEK_START`), **This quarter / Last quarter**, and **Next N days** (includes today, mirroring Last N days). With these, every operator advertised by `query_data_mart` is now executable — nothing maps to `unsupported_operator` anymore.
