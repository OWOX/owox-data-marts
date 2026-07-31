# Data Last Updated

Data Last Updated shows when the source tables/views behind a Data Mart last changed in the storage. It answers the question "how current is what I am looking at?" before you build a report or act on an answer from an AI assistant.

Data Last Updated is currently measured for **Google BigQuery** Data Marts. Data Marts on other storages show **Unknown** until their support lands.

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
| **Models canvas** | A clock icon on every node, next to the Data Quality shield, plus a **Data Last Updated** toolbar button |
| **MCP** | A `data_last_updated` block in every `query_data_mart` response — see [MCP Server](./mcp.md#data-last-updated) |

The list and the canvas show the **last-known** value — the result of the most recent check, with its time visible in the hover card. They never query the storage on page load.

## How to check it

Two buttons measure the value live and save the result:

- **Check now** (⟳) on the Data Mart page measures that one Data Mart.
- **Data Last Updated** in the canvas toolbar measures every Data Mart currently visible on the canvas, in one pass.

Checking is free. It reads storage metadata only, consumes no [credits](../billing/consumption-units.md), and records no run. Any project member who can see the Data Mart can run the check.

A check that cannot determine the time reports Unknown and **keeps the previously saved value** — a failed lookup never erases the last-known answer.

## When the value updates

| Trigger | Effect |
| --- | --- |
| *Check now* on the Data Mart page | Measures and **saves** the value |
| Toolbar button on the canvas | Measures and **saves** the value for all visible Data Marts |
| Every MCP `query_data_mart` call | Measures live for that response and records it in the run's history entry. Does **not** overwrite the saved value, because an MCP query can span several joined Data Marts |
| On a schedule | Never. OWOX does not re-measure Data Marts in the background |

## How OWOX determines the value

OWOX asks the storage which tables the Data Mart reads, then takes the newest modification time among them:

- **Views and SQL Data Marts** resolve through to their underlying base tables, nested views included. Views themselves are excluded from the per-table breakdown — a view's own modification time reflects a change to its definition, not to any data.
- **Sharded and wildcard table sets** (`events_YYYYMMDD`) collapse into a single entry showing the newest shard. Neighbouring tables that merely share the prefix, such as `events_backup`, do not count.
- **External tables** (for example, Google Sheets) have no modification time in the storage. They appear in the breakdown as unknown, and the coverage becomes partial.
- Queries referencing more than ~50 tables are reported with partial coverage, because the storage truncates the list.

## Data Last Updated vs. the Data freshness check

These are different tools that answer different questions:

- **Data Last Updated** is storage metadata: when the source tables were last written to. It requires no configuration and costs nothing.
- The **Data freshness** check in [Data Quality Checks](./data-quality-checks.md) validates the data itself: it reads a timestamp field and alerts when its latest value is older than a threshold you configure.

A table can pass one and fail the other. A backfill makes Data Last Updated show "today" while the Data freshness check still fails, because the newest timestamp inside the data is old.
