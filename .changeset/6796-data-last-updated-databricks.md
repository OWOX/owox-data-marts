---
'owox': minor
---

# Data Last Updated Date for Databricks

**Data Last Updated** now works for Databricks Data Marts, on every surface where it already worked for other storages: the Data Mart page, the Data Marts list, the model canvas, and MCP `query_data_mart` responses. No setup is needed — the value appears as soon as someone checks a Data Mart or a run delivers data.

OWOX asks Databricks which tables the executed query reads — views and SQL Data Marts resolve through to their underlying base tables — and then reads each **Delta** table's history for the last commit that actually changed data. The answer is exact and immediate. Maintenance operations do not count: a table that was only compacted by OPTIMIZE or cleaned by VACUUM keeps the timestamp of its last real write.

Delta table history is kept for a limited period (30 days by default), so a table whose data last changed earlier shows **Unknown** with a note. Non-Delta and external tables have no history and show Unknown too. When such a table sits alongside measurable ones, the coverage becomes partial, so the reported value stays a lower bound: the real time can only be more recent.
