# Data Last Updated

Data Last Updated shows when the source tables/views behind a Data Mart last changed in the storage. It answers the question "how current is what I am looking at?" before you build a report or act on an answer from an AI assistant.

Data Last Updated is currently measured for **Google BigQuery**, **AWS Redshift**, **AWS Athena**, **Snowflake**, and **Databricks** Data Marts. Data Marts on other storages show **Unknown** until their support lands.

## What the value means

Read the value precisely. It is a **storage** timestamp, not a statement about the data's content:

- It says when something last **wrote to** the source tables. A backfill can rewrite a table today with figures from 2021, so "updated today" does not mean "covers today".
- **Unknown** means OWOX could not determine the time. It does not mean the data is stale — or fresh.
- A value marked **≥** ("at least as recent as") means some source tables could not be checked. The real time can only be more recent than shown.

Hover over any Data Last Updated value or icon to see the details: the exact timestamp, when OWOX ran the check, how complete the coverage is, and the per-table breakdown.

## Where you see it

| Surface | What is shown |
| --- | --- |
| **Data Mart page** → Overview → Details | A **Data Last Updated** tile with a *Check now* button |
| **Data Marts list** | A sortable **Data Last Updated** column |
| **Models canvas** | A clock icon on every node, next to the Data Quality shield, plus a **Data Last Updated** entry in the **Actions** menu |
| **MCP** | A `data_last_updated` block in every `query_data_mart` response — see [MCP Server](./mcp.md#data-last-updated) |

The list and the canvas show the **last-known** value — the result of the most recent check or data-delivering run, with its time visible in the hover card. They never query the storage on page load.

## How to check it

Two manual checks measure the value live and save the result:

- **Check now** (⟳) on the Data Mart page measures that one Data Mart.
- **Actions → Check Data Last Updated** on the canvas measures every Data Mart currently visible on the canvas, in one pass.

Checking is free. It reads storage metadata only, consumes no [credits](../billing/consumption-units.md), and records no run. Any project member who can see the Data Mart can run the check.

You rarely need the buttons, though: every run that delivers data refreshes the value on the way out — see the table below.

A check that cannot determine the time reports Unknown and **keeps the previously saved value** — a failed lookup never erases the last-known answer.

## When the value updates

| Trigger | Effect |
| --- | --- |
| *Check now* on the Data Mart page | Measures and **saves** the value |
| *Actions → Check Data Last Updated* on the canvas | Measures and **saves** the value for all visible Data Marts |
| Report run — manual or scheduled | Measures during the run and records the result in the run's history entry. When the report reads only the Data Mart's own sources, it also **saves** the value |
| HTTP Data request | Same as a report run: records in history, **saves** when the request reads only the Data Mart's own sources |
| MCP `query_data_mart` call | Measures live for that response and records it in the run's history entry. **Saves** the value when the query reads only the Data Mart's own sources (no joined fields) |
| In the background, on its own | Never. OWOX only measures when someone checks manually or a run delivers data — a scheduled report run counts as a run |

A blended run records the measurement in its history entry only. Its reading covers other Data Marts' tables too, so saving it on one Data Mart would overstate that value.

## How OWOX determines the value

OWOX asks the storage which tables the Data Mart reads, then takes the newest modification time among them:

- **Views and SQL Data Marts** resolve through to their underlying base tables, nested views included. Views themselves are excluded from the per-table breakdown — a view's own modification time reflects a change to its definition, not to any data.
- **Sharded and wildcard table sets** (`events_YYYYMMDD`) collapse into a single entry showing the newest shard. Neighbouring tables that merely share the prefix, such as `events_backup`, do not count.
- **External tables** (Google Sheets in BigQuery, Spectrum tables in Redshift) keep their data outside the storage, so no modification time exists there. They appear in the breakdown as unknown, and the coverage becomes partial.
- **Materialized views** show the time of their last refresh.
- In BigQuery, queries referencing more than ~50 tables are reported with partial coverage, because the storage truncates the list.

Storage-specific caveats:

- **BigQuery** reports modification times immediately and exactly.
- **Redshift** metadata can lag real writes by up to ~5 minutes, so a load that finished a moment ago may not show yet. Older Redshift releases do not report modification times at all — those Data Marts show Unknown. Source tables outside the connection's database, and tables in schemas whose names require quoting (mixed case, hyphens, non-ASCII characters), cannot be identified and appear as unknown entries with partial coverage.
- **Athena** answers exactly for **Iceberg** tables (the time of the last data commit). Classic **Hive** tables show Unknown — their catalog stores no data-change time. The catalog's metadata timestamps can be newer than the last data change, so OWOX does not report them. Tables from federated catalogs (connectors other than the Glue Data Catalog) are not measured.
- **Snowflake** reports the start of the hour in which the data last changed, from the account's DML history. The value can trail reality by several hours, because Snowflake publishes this history with a delay. The connection role needs access to the `SNOWFLAKE` database (account usage); without it, sources show Unknown. Schema changes and background maintenance do not move the value. Materialized views, Iceberg tables, and other non-standard objects are not measured and appear as unknown sources.
- **Databricks** answers exactly for **Delta** tables: the commit time of the last operation that changed data. Maintenance operations such as OPTIMIZE and VACUUM do not count. Table history is kept for a limited period (30 days by default); older changes show Unknown. Non-Delta and external tables, materialized views, and streaming tables have no readable history and show Unknown too.

## Data Last Updated vs. the Data freshness check

These are different tools that answer different questions:

- **Data Last Updated** is storage metadata: when the source tables were last written to. It requires no configuration and costs nothing.
- The **Data freshness** check in [Data Quality Checks](./data-quality-checks.md) validates the data itself: it reads a timestamp field and alerts when its latest value is older than a threshold you configure.

A table can pass one and fail the other. A backfill makes Data Last Updated show "today" while the Data freshness check still fails, because the newest timestamp inside the data is old.
