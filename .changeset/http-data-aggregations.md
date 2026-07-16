---
'owox': minor
---

# HTTP Data streaming supports aggregations and date buckets

The HTTP Data streaming API, the [`@owox/api-client`](../docs/api/api-client.md) `traverseData()`
method, and the [`owox-ctl data-marts stream`](../docs/api/owox-ctl.md) command now accept
`aggregation` and `dateTrunc` parameters (`--aggregation` / `--date-bucket` on the CLI), matching
the aggregation and date-bucket grouping already available for Reports. Any selected column without
an aggregation rule becomes a grouping key, so you can stream pre-aggregated rows — for example
monthly revenue totals — directly from a published Data Mart without building a Report. Grand
totals and the applied aggregation are recorded in the HTTP_DATA run history.
