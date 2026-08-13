---
'owox': minor
---

Data Last Updated Date is now measured for AWS Athena Data Marts. OWOX discovers the source tables behind the executed SQL through the query's IO plan (views resolved to their base tables) and reads each table's last change per format: Iceberg tables report the exact time of the last data commit, while classic Hive tables are honestly reported as unknown — their catalog stores no data-change time. The value appears on every surface where it already worked for BigQuery and Redshift: the Data Mart page, lists, the canvas, and MCP responses.
