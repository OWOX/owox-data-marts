---
'owox': minor
---

**DuckDB Storage for self-managed deployments, with no warehouse to set up**

Self-managed deployments can now use DuckDB as a Storage: choose **DuckDB** under **Storages → + New Storage**, with nothing to fill in. Connectors load into one file per Storage, next to the SQLite database or in `DUCKDB_DATA_DIR`. The Storage's **Configuration** section shows the file's path for DBeaver or another client on DuckDB 2.0 or later. `DUCKDB_STORAGE_ENABLED` is `true` by default only when `DB_TYPE` is `sqlite` or not set; `false` stops new DuckDB Storages, and existing ones keep working. OWOX Data Marts Cloud does not offer DuckDB. See [DuckDB](../../docs/storages/supported-storages/duckdb.md) and [Environment Variables](../../docs/getting-started/deployment-guide/environment-variables.md#duckdb-storage).

![The DuckDB Storage settings: access validated, Storage Type DuckDB, and the database file path under Configuration](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/0f41b151-c0d3-47e0-5bb9-81a632ed4600/w=800)

DuckDB Data Marts support preview, SQL editing, calculated fields, joined Data Marts, data quality checks, and report filters, sorting, aggregations and date buckets with a time zone. Preview, Report Runs to any Destination, HTTP Data and MCP need a license key, as on any Storage. Looker Studio needs one to read data.

The video creates a DuckDB Storage, loads public holidays into it, queries them in a SQL Data Mart, sends them to Google Sheets with a report, and shows where the file is:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/25b5a04eefdc3ce8d6c10c27df10b2f1/iframe>

- One load at a time per Storage: a second connector run into the same Storage waits for the first to end.
- A Report Run or data quality run that starts during a load, or while an earlier load waits, stays **Pending** until that load ends. A load waits for the Report Runs and data quality runs that are running.
- A preview, SQL run, HTTP Data, MCP or Looker Studio request waits while a load holds the file: from each configuration's first write until that configuration ends. It fails as busy only if the file stays busy for about 30 seconds. An external tool that keeps the file open blocks loads the same way: open it read-only and close it before loads run.
- **Data Last Updated** shows **Unknown** for DuckDB Data Marts.

<!-- markdownlint-disable-file MD041 MD036 -->
