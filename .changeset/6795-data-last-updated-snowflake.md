---
'owox': minor
---

Data Last Updated Date is now measured for Snowflake Data Marts. OWOX discovers the source tables behind the executed SQL through the query's compiled plan (views resolved to their base tables) and reads each table's approximate commit time of the last data change — schema changes and background maintenance do not affect the value. The value appears on every surface where it already worked for other storages: the Data Mart page, lists, the canvas, and MCP responses.
