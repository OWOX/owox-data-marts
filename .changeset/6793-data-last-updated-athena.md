---
'owox': minor
---

# Data Last Updated Date for AWS Athena

**Data Last Updated** now works for AWS Athena Data Marts, on every surface where it already worked for other storages: the Data Mart page, the Data Marts list, the model canvas, and MCP `query_data_mart` responses. No setup is needed — the value appears as soon as someone checks a Data Mart or a run delivers data.

OWOX asks Athena which tables the executed query reads — views and SQL Data Marts resolve through to their underlying base tables — and then reads each table's last data change. What it can report depends on the table format. **Iceberg** tables answer exactly: the value is the time of the last commit to the data, visible right after a write.

Classic **Hive** tables show **Unknown** instead. Their catalog stores no record of when the data changed, and the timestamps it does keep also move when someone only edits the table definition — reporting one could present stale data as freshly updated. Tables from federated catalogs are not measured either. When such a table sits alongside measurable ones, the coverage becomes partial, so the reported value stays a lower bound: the real time can only be more recent.
