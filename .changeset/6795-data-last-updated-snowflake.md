---
'owox': minor
---

# Data Last Updated Date for Snowflake

**Data Last Updated** now works for Snowflake Data Marts, on every surface where it already worked for other storages: the Data Mart page, the Data Marts list, the model canvas, and MCP `query_data_mart` responses. The connection role needs access to the `SNOWFLAKE` database (account usage) — without it, Data Marts show Unknown.

OWOX asks Snowflake which tables the executed query reads — views and SQL Data Marts resolve through to their underlying base tables — and then reads each table's last **data** change from the account's DML history. The value is the start of the hour in which the data last changed, and it can trail reality by several hours, because Snowflake publishes this history with a delay. Schema changes and Snowflake's own background maintenance do not move the value, so the reported time never overstates how fresh the data is.

A table with no recorded data changes in the last year shows **Unknown** with a note. A dropped-and-recreated table answers for its current generation only, never for its predecessor's history. Materialized views, Iceberg tables (whose data can change outside Snowflake), and other objects the history cannot answer for appear as unknown sources and the coverage becomes partial, so the reported value stays a lower bound: the real time can only be more recent.
