---
'owox': minor
---

**Charts in plugins can include calculated metrics: the API says which ones add up**

A plugin that draws a pie, a stacked bar or a Sankey chart adds up values that a query already computed. It could not tell `SUM(amount)`, which adds up, from `SUM(revenue) / NULLIF(SUM(cost), 0)`, which does not. So it left every calculated metric out of these charts. Now the API tells it.

- `calculated.rollupAggregations` lists the functions that combine a calculated metric's computed values: `["SUM"]` for `SUM(x)` or `COUNT(x)`, `["MIN"]` or `["MAX"]` for `MIN(x)` or `MAX(x)`, and `[]` for a ratio, an average or a distinct count.
- It is on `GET /api/data-marts/{id}`, on the report output schema (`reports.getOutputSchema` in the plugin SDK), and in the MCP tools `get_data_mart_details_by_id` and `get_report_output_schema`.
- `GET /api/data-marts/{id}` now returns the effective `calculated.level`. A query cannot aggregate a field whose level is `metric`, and the `allowedAggregations` description now says so.
- On AWS Athena and AWS Redshift, a formula that divides an aggregate by a number gets `[]`, because these warehouses truncate integer division.

See [Using the Field from an API Client or Plugin](../../docs/getting-started/setup-guide/calculated-fields.md#using-the-field-from-an-api-client-or-plugin).

<!-- markdownlint-disable-file MD041 MD036 -->
