---
'owox': minor
---

# Data Last Updated Date for AWS Redshift

**Data Last Updated** now works for AWS Redshift Data Marts, on every surface where it already worked for BigQuery: the Data Mart page, the Data Marts list, the model canvas, and MCP `query_data_mart` responses. No setup is needed — the value appears as soon as someone checks a Data Mart or a run delivers data.

OWOX asks Redshift which tables the executed query reads — views and SQL Data Marts resolve through to their underlying base tables — and then reads each table's last data modification time from Redshift's own metadata. Materialized views report the time of their last refresh. Expect the value to trail reality slightly: Redshift refreshes this metadata with a delay of up to about five minutes, so a load that just finished may take a moment to show.

Some sources cannot be measured and show as unknown: Spectrum external tables, whose data lives outside Redshift, and tables Redshift reports no modification time for. When such a table sits alongside measurable ones, the coverage becomes partial, so the reported value stays a lower bound: the real time can only be more recent.
