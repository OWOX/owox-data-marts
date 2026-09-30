# Data Marts

A **Data Mart** is a documented, reusable dataset that a data analyst prepares for business reporting. It is the core entity of OWOX Data Marts.

## What Data Marts do in OWOX

A Data Mart turns raw warehouse data into a business-ready artifact with a description, output schema, and friendly field names. Analysts define the logic once. Business users then run, filter, and schedule reports without changing that logic.

Unlike a raw warehouse table, a Data Mart is documented, owned, reusable across BI tools, and safe to share.

## How Data Marts fit the workflow

[Sources](../connectors/) load raw data into a [Storage](../storages/). A Data Mart defines business-ready data on top of that Storage. [Destinations](../destinations/) and [Reports](../reports/) deliver the Data Mart's output to business users.

Each Data Mart links to exactly one Storage. One Data Mart can feed many Destinations and Reports.

## When to use Data Marts

- You answer the same business question repeatedly, such as ROAS by campaign and channel.
- Business users ask analysts for data exports instead of serving themselves.
- Teams argue about whose report is right and need one source of truth.
- You want to collect advertising or platform data on a schedule.

## Data Mart types

| Type | Read |
| --- | --- |
| SQL query on your Storage | [SQL Data Mart](../getting-started/setup-guide/sql-data-mart.md) |
| Existing warehouse table | [Table Data Mart](../getting-started/setup-guide/table-data-mart.md) |
| Existing warehouse view | [View Data Mart](../getting-started/setup-guide/view-data-mart.md) |
| Set of tables matched by a pattern | [Pattern Data Mart](../getting-started/setup-guide/pattern-data-mart.md) |
| Data imported from a platform API | [Connector Data Mart](../getting-started/setup-guide/connector-data-mart.md) |

## Get started

1. [Add a Storage](../storages/) if your project has none.
2. Create a Data Mart of the type that fits your data. Start with the [Connector Data Mart guide](../getting-started/setup-guide/connector-data-mart.md).
3. Publish it and add a [Report](../reports/) to deliver the output.

## Learn more

| Need | Read |
| --- | --- |
| Combine Data Marts through relationships | [Joinable Data Marts](../getting-started/setup-guide/joinable-data-marts.md) |
| Visualize Data Marts and relationships | [Models Canvas](../getting-started/setup-guide/models-canvas.md) |
| Rename fields with aliases | [Define Output Schema](../getting-started/setup-guide/sql-data-mart.md#step-3-define-output-schema) |
| Filter, sort, and cap the rows a report delivers | [Report Output Controls](../getting-started/setup-guide/output-controls.md) |
| Validate data with automated checks | [Data Quality Checks](../getting-started/setup-guide/data-quality-checks.md) |
| Preview Data Mart output | [Data Preview](../getting-started/setup-guide/data-preview.md) |
| Core terms and how entities relate | [Core Concepts](../getting-started/core-concepts.md) |
