# Report Output Controls

Narrow, sort, and cap the rows that a report delivers to its destination — without modifying the underlying Data Mart or writing any SQL. Output controls are configured per report and apply at query time.

There are four controls:

| Control | What it does |
|---------|-------------|
| **Filters** | Drop rows from the final result after all JOINs |
| **Slices** | Drop rows from a joined Data Mart before it is JOINed in (blended reports only) |
| **Sort** | Order the result set by one or more columns |
| **Limit** | Cap the total number of rows returned |

---

## Where to Find Output Controls

Open a report for editing and locate the **Report Columns** section. Click the **Output Settings** button (the sliders icon) to open the output controls panel. Each section — Filters, Slices, Sort, and Limit — can be expanded independently.

---

## Filters

Filters are applied to the final `SELECT` statement, after all joins are resolved. Use them to restrict which rows appear in the delivered report.

### Supported operators by column type

| Column type | Available operators |
|---|---|
| String | is, is not, contains, does not contain, starts with, ends with, is empty, is not empty, is null, is not null, matches regex, does not match regex |
| Number | =, ≠, >, <, ≥, ≤, between, is null, is not null |
| Date / DateTime / Timestamp | on, not on, after, before, on or after, on or before, between, relative date, is null, is not null |
| Boolean | is true, is false, is null, is not null |

### Adding a filter

1. In the **Filters** section, click **+ Add Filter**.
2. Choose the column from the searchable picker. You can search by display name, technical path, or Data Mart name.
3. Select an operator.
4. Enter a value (if the operator requires one).
5. Click **Apply**.

Multiple filters are combined with `AND` — all conditions must be satisfied for a row to appear in the output.

### Relative date presets

For date columns, the **relative date** operator lets you define a window that re-evaluates on every run:

- Today / Yesterday
- This month / Last month / This year
- Last N days / Last N months

This is useful for rolling-window reports that should always reflect recent data without manual updates to filter values.

---

## Slices

Slices are **pre-join filters**: they narrow a joined Data Mart's rows inside its own subquery, before that subquery is joined into the main query. This reduces the data pulled in from the joined Data Mart without changing the main Data Mart's row set.

> Slices are only available when a report includes columns from at least one joined Data Mart. See [Joinable Data Marts](joinable-data-marts.md) for how to configure joins.

### How slices differ from filters

The join between a source Data Mart and a joined Data Mart is a `LEFT JOIN`. This means:

- A **filter** on a joined column drops source rows that no longer have a matching joined value — it acts on the fully-assembled result.
- A **slice** on a joined column removes rows from the joined Data Mart's subquery before the join happens. Source rows that no longer match pass through with `NULL` on the joined columns instead of being dropped entirely.

**Practical consequence:** if you want to exclude source rows where the joined column has no match after slicing, add a **filter** on that same column (`is not null`) in addition to the slice.

### When to use slices

Use slices when you want to limit the data pulled in from a joined Data Mart — for example, to fetch only records with `status = Active` from a CRM Data Mart — while keeping all rows from the source Data Mart intact.

Use filters when you want to drop rows from the final result based on any column value, regardless of join order.

### Adding a slice

1. Expand the **Slices** section in the output controls panel.
2. Click **+ Add Slice**.
3. Choose a column from the joined Data Mart (joined columns are grouped by their Data Mart alias in the picker).
4. Select an operator and enter a value.
5. Click **Apply**.

The same operator set available for filters applies to slices, matched to the column's data type.

---

## Sort

Sort controls the order of rows in the delivered report. Sorting is applied to the final result set, after filters and slices.

1. Expand the **Sort** section.
2. Click **+ Add Sort**.
3. Choose a column and select **Ascending** or **Descending**.
4. To sort by multiple columns, add more rules. Drag rows to set priority — the topmost rule takes precedence.

Sort order is applied before any row limit.

---

## Limit

Limit caps the number of rows returned by the report. It is applied last — after all filters, slices, and sorting.

| Setting | Value |
|---|---|
| Default | No limit (all rows are returned) |
| Minimum | 1 |
| Maximum | 10,000,000 |

To set a limit, enter a number in the **Limit** field. Clear the field to remove the limit and return all rows.

> When a limit reduces the number of rows compared to the previous run, OWOX clears the extra rows that were written to the destination on the previous run. For Google Sheets specifically, cells in the imported columns below the last data row are cleared so stale values never remain visible under fresh ones. See [Google Sheets](../../destinations/supported-destinations/google-sheets.md) for details on how the imported range is managed.

---

## Order of Execution

Output controls are applied in this sequence during every report run:

1. **Slices** — rows are filtered inside each joined Data Mart's subquery.
2. **Joins** — subqueries are joined into the main query.
3. **Filters** — rows are filtered on the assembled result.
4. **Sort** — remaining rows are ordered.
5. **Limit** — the row count is capped.

---

## Supported Storages

Output controls are supported on: **Google BigQuery, Snowflake, AWS Redshift, AWS Athena, Databricks**.

---

## Related Links

- [Joinable Data Marts →](joinable-data-marts.md)
- [Google Sheets destination →](../../destinations/supported-destinations/google-sheets.md)
- [Report Triggers →](report-triggers.md)
- [Create SQL-Based Data Mart →](sql-data-mart.md)
