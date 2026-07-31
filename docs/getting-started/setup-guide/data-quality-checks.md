# Data Quality Checks

Data Quality Checks validate the data behind a published Data Mart before you use it in reports and dashboards. Configure checks for the whole Data Mart, individual Output Schema fields, and relationships, then run them manually or on a schedule.

Data Quality Checks are supported for **Google BigQuery, Legacy Google BigQuery, AWS Athena, Snowflake, AWS Redshift, and Databricks** in Cloud and Self-Managed editions.

## Before You Start

A Data Mart must have:

- **Published** status
- A saved **Output Schema**
- At least one applicable, enabled check

Open the Data Mart and select the **Data Quality** tab to configure checks and view the latest report.

## Available Checks

| Scope | Check | What it detects |
| --- | --- | --- |
| Data Mart | Empty table | A Data Mart with no rows |
| Data Mart | Primary key uniqueness | Duplicate values across the Output Schema primary key |
| Data Mart | Duplicate rows | Rows duplicated across all supported materialized Output Schema fields |
| Field | Null rate | A percentage of `NULL` values above the configured threshold |
| Field | Column uniqueness | Repeated non-null values |
| Field | Constant column | A field containing only one distinct value |
| Field | Type mismatch | A stored column type that does not match the saved Output Schema |
| Field | Data freshness | A latest timestamp older than the configured threshold |
| Field | Negative values | Numeric values below zero |
| Relationship | Relationship integrity | Source join values missing from the target Data Mart |
| Relationship | Reverse relationship | Target join values that are not used by the source Data Mart |

Checks are shown only where they apply. For example, **Primary key uniqueness** requires primary key fields, **Negative values** requires a numeric field, and relationship checks require a configured Data Mart relationship.

**Data freshness** is available only for timestamp types that unambiguously represent an instant:

- Google BigQuery and Legacy Google BigQuery: `TIMESTAMP`
- AWS Athena: `TIMESTAMP WITH TIME ZONE`
- AWS Redshift: `TIMESTAMPTZ`
- Databricks: `TIMESTAMP`

Data freshness is not available for Snowflake fields.

## Configure Checks

1. Open a published Data Mart and select **Data Quality**.
2. Expand **Checks configuration**.
3. Enable the Data Mart checks you need.
4. Under **Field checks**, click **Add checks**, select a field, and choose a check.
5. Enable the required **Relationship checks** for existing Data Mart relationships.
6. Select a severity:
   - **Error** for critical issues
   - **Warning** for issues that need attention
   - **Notice** for informational findings
7. Configure a threshold where required:
   - **Null rate** uses a percentage threshold.
   - **Data freshness** uses a threshold in hours.
8. Click **Save**.

The system preset initially enables basic checks such as **Empty table**, primary key checks when a primary key exists, null-rate checks for key fields, and relationship integrity checks. You can replace the preset with your own saved configuration or disable every check.

## Run Checks

You can start checks in several ways:

- On the **Data Quality** tab, click **Run**. If the configuration has unsaved changes, use **Save & Run**.
- On the Data Marts list or Models canvas, use **Actions → Check Quality** to queue checks for multiple Data Marts.
- On the Data Mart's **Triggers** tab, create a **Data Quality Run** trigger to run the saved configuration on a schedule.

Only one Data Quality run can be active for a Data Mart at a time. A bulk action queues each eligible Data Mart independently, so one ineligible item does not prevent the others from starting.

## Review Results

The summary at the top of the **Data Quality** tab shows the latest run state and counts by severity. The detailed report below it contains:

- The status of every enabled check
- The number of violations
- Up to three example values for a failed check
- The SQL used to execute and reproduce the check

Checks can finish as **Passed**, **Failed**, **Not applicable**, or **Execution error**. Findings are grouped by **Error**, **Warning**, and **Notice** severity. A completed run can report issues without being an execution failure.

Data Quality runs also appear in:

- The Data Mart's **Run History**
- Project-level **Run History**
- The Models canvas, where status icons summarize the latest result

Run History keeps the configuration snapshot and check results from that specific run.

## Consumption

In the Cloud edition, each successfully completed run counts as one [Data Quality Process Run](../billing/consumption-units.md), regardless of how many checks it executes or whether it finds data quality issues. Manual, bulk, and scheduled runs follow the same rule.

Warehouse query-processing costs remain with the connected storage.
