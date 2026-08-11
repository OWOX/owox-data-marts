---
'owox': minor
---

Data Last Updated Date is now measured for AWS Redshift Data Marts. OWOX discovers the source tables behind the executed SQL (views resolved to their base tables) and reads each table's last data modification time from Redshift metadata, on every surface where the value already worked for BigQuery: the Data Mart page, lists, the canvas, and MCP responses. Spectrum external tables and tables Redshift cannot report a time for appear as unknown sources with partial coverage; Redshift metadata itself may lag real writes by up to ~5 minutes.
