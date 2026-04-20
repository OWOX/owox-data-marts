---
'owox': minor
---

# Joinable Data Marts and Joined Reports

You can now connect data marts to each other and build reports that combine fields from several joined data marts in a single output.

On a data mart's **Data Setup** tab, the new **Joinable Data Marts** block lets you add joinable data marts, configure join conditions, choose which fields each joined data mart exposes, and override their aliases or aggregations. When editing a Google Sheets, Looker Studio, or Email report, the **Report Columns** picker now shows fields from the data mart together with fields available from joined data marts, so a single report can combine columns from several data marts at once. The generated SQL is available for inspection, and any joined report can be saved as a standalone data mart.

Supported on BigQuery, Snowflake, Redshift, Athena, and Databricks.
