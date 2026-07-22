---
'owox': minor
---

# HTTP Data on report level

Adds `GET /api/external/http-data/reports/{reportId}.ndjson` — stream an existing report's data as NDJSON, applying the report's saved filters, aggregations, date buckets, unique count, and sort, without reconstructing query parameters by hand. An optional `limit` query parameter overrides the report's saved limit. The [`@owox/api-client`](../docs/api/api-client.md) `reports.traverseData()` method exposes the same endpoint.

The response carries an `x-owox-run-id` header (consistent with the Data Mart HTTP Data endpoint); on a successful stream the referenced run is a `HTTP_DATA` run tagged with the reportId. When the report applies a filter, aggregation, sort, date bucket, row limit, or unique count — or blends fields across Data Marts — the run also records the exact executed SQL via `additionalParams.httpData.executionSqlQuery`, discoverable through the run history endpoint. (A plain column selection with none of those controls streams the Data Mart's own query and records no separate executed SQL.) Grand totals — one per selected metric (every numeric field, plus non-numeric fields eligible for Count / Count Unique) aggregated over the full result — are recorded in the run history whenever the report selects an eligible metric, computed as a separate best-effort query.

Failed MCP `query_data_mart` calls create no run-history entry; both HTTP Data endpoints (Data Mart and report level) record a `FAILED` run for any failure encountered during query execution.
