---
'owox': minor
---

# Calculated Fields in the Output Schema

An analyst can now define a Calculated Field directly in a Data Mart's Output Schema — a formula written in that Data Mart's own warehouse SQL, such as `SUM(clicks) * 1.0 / NULLIF(SUM(impressions), 0)` for a click-through rate. Unlike a ratio hard-coded into a Data Mart's SQL, it recomputes at whatever grain the request asks for, so a report broken down by day, a Google Sheet, a Looker Studio page, an MCP agent, an HTTP Data caller and a report's Totals row all get the true ratio of the sums rather than an average of per-row ratios. Whether the field is a metric or a dimension is read from the formula rather than chosen, and the formula is checked when the schema is saved — every problem names the field it belongs to, and the resulting query is test-run against the warehouse once per save, so a broken formula is caught before anyone builds a report on it. Available on Google BigQuery, AWS Athena, Snowflake, AWS Redshift and Databricks; see [Calculated Fields](https://docs.owox.com/docs/getting-started/setup-guide/calculated-fields/) for what each dialect supports and the limitations to know about.
