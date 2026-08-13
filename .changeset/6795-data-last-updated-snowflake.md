---
'owox': minor
---

# Data Last Updated Date for Snowflake

**Data Last Updated** now works for Snowflake Data Marts, on every surface where it already worked for other storages: the Data Mart page, the Data Marts list, the model canvas, and MCP `query_data_mart` responses. No setup is needed — the value appears as soon as someone checks a Data Mart or a run delivers data.

OWOX asks Snowflake which tables the executed query reads — views and SQL Data Marts resolve through to their underlying base tables — and then reads each table's commit time of the last **data** change. Schema changes and Snowflake's own background maintenance do not move the value: a table that was only re-clustered or renamed keeps the timestamp of its last real write. The time is approximate to within seconds, which is how Snowflake reports it.

A table that has no recorded data changes yet shows **Unknown** with a note, rather than a misleading timestamp. Tables the connection cannot measure — external tables, or tables its role cannot read — appear as unknown sources and the coverage becomes partial, so the reported value stays a lower bound: the real time can only be more recent.
