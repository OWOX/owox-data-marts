# Report Output Controls

Narrow, sort, and cap the rows a report delivers to its destination. No SQL. No changes to the underlying Data Mart. Each report carries its own output controls. OWOX applies them at query time.

Output controls work for both Data Mart reports in the web app and reports created from the OWOX Extension.

| Control | What it does |
|---------|-------------|
| **Filters** | Drop rows from the final result after all JOINs |
| **Slices** | Narrow a joined Data Mart before the JOIN (blended reports only) |
| **Sort** | Order the result by one or more columns |
| **Limit** | Cap the total number of rows |

---

## Where to Find Output Controls

1. Open a Data Mart and go to the **Destinations** tab.
2. Find the report row, click its three-dot menu, and select **Edit report**.
3. In the edit panel, go to the **Report Columns** section.
4. Click the **Output controls** button (sliders icon).

Each section — Filters, Slices, Sort, and Limit — expands independently.

![Data Mart Destinations tab with a Google Sheets report row. A three-dot context menu is open showing Run report, Edit report, and Delete report options. An arrow points to the menu button.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/28c74de0-7598-432c-2de1-f71d09280200/public)

![Edit report panel for a Google Sheets report. The Report Columns section (19/19) is expanded with Filters, Sort, and Limit sections visible — all empty. An arrow points to the Output controls button (sliders icon) in the top-right corner of the Report Columns section.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d2a439b1-1a52-4f79-39ae-50c3f5f24300/public)

---

## Filters

A filter runs against the final `SELECT`, after all joins complete. Use filters to drop rows from the delivered report.

### Supported operators by column type

| Column type | Available operators |
|---|---|
| String | is, is not, contains, does not contain, starts with, ends with, is empty, is not empty, is null, is not null, matches regex, does not match regex |
| Number | =, ≠, >, <, ≥, ≤, between, is null, is not null |
| Date / DateTime / Timestamp | on, not on, after, before, on or after, on or before, between, relative, is null, is not null |
| Time | at, not at, after, before, at or after, at or before, between, is null, is not null |
| Boolean | is true, is false, is null, is not null |

### Relative date presets

For date columns, the **relative** operator re-evaluates on every run:

- Today / Yesterday
- This month / Last month / This year
- Last N days / Last N months (N from 1 to 3650)

Use it so rolling reports stay current without touching filter values manually.

![Filter editor popover for the order_date column. The Condition dropdown shows "relative" selected. A Preset dropdown shows "Last N days" with the value 7 entered below. An arrow points to the filter icon on the order_date row.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/00111513-5089-450d-b5b6-1724d42e5500/public)

### Add a filter

1. In the **Filters** section, click **+ Add Filter**.
2. Pick a column — search by display name, technical path, or Data Mart name.
3. Select an operator.
4. Enter a value (if the operator requires one).
5. Click **Apply**.

Multiple filters use `AND` logic — every condition must match for a row to appear. OR logic between filters is not supported.

To edit an existing filter, click the pencil icon on its row. To remove one, click the **×**.

![Edit report panel with two active filters in the Filters section: "category is Home" and "product_name is Coffee Machine". The "+ Add filter" button is circled. Sort is empty and Limit shows All rows.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/13be9076-0975-49c1-8531-e749911f8700/public)

---

## Slices

Slices are **pre-join filters**. They narrow a joined Data Mart's rows inside its own subquery, before the main query joins it in. This trims the joined data without affecting the source row count.

> Slices are only available when a report includes columns from at least one joined Data Mart. See [Joinable Data Marts](joinable-data-marts.md) to configure joins.

### How slices differ from filters

The join between a source Data Mart and a joined Data Mart is a `LEFT JOIN`.

- A **filter** on a joined column acts on the fully-assembled result. It drops source rows with no matching joined value.
- A **slice** removes rows from the joined subquery before the join runs. Source rows with no match still pass through — with `NULL` on the joined columns.

To also drop source rows with no match, add a **filter** on the same column (`is not null`).

### When to use slices

Use slices to limit what you pull from a joined Data Mart. Example: fetch only records where `status = Active` from a CRM Data Mart. The source rows stay intact regardless.

Use filters to drop rows from the final result — any column, regardless of join order.

### Add a slice

> If you don't see the **Slices** section, the report has no joined Data Marts. Join at least one first — see [Joinable Data Marts](joinable-data-marts.md).

1. Expand the **Slices** section.
2. Click **+ Add Slice**.
3. Pick a column — the picker groups joined columns under their Data Mart alias.
4. Select an operator and enter a value.
5. Click **Apply**.

Slices support the same operators as filters, matched to the column's data type.

To edit an existing slice, click the pencil icon on its row. To remove one, click the **×**.

> Slices require an explicit column selection. Select at least one column in **Report Columns** — a report with no explicit selection rejects slices at save time.

![Edit report panel showing Filters with two rules (category is Home, product_name is Coffee Machine) and a Slices section with one active slice: order_timestamp from CRM Data, after "2026-06-01". An arrow points to the "+ Add slice" button.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/af291d7b-90e5-44df-d6f7-0f3b6b684900/public)

---

## Sort

Sort orders the rows in the delivered report. It runs on the final result, after filters and slices.

1. Expand the **Sort** section.
2. Click **+ Add Sort by**.
3. Choose a column and select **Ascending** or **Descending**.
4. Add more rules to sort by multiple columns. Drag to reorder — the top rule wins.

To remove a sort rule, click the **×** on its row.

Sort runs before the row limit.

> You can only sort by columns that are selected in **Report Columns**. Sorting by an unselected column fails validation. If you sort by a joined column, that column must be explicitly checked in the column picker — reports without an explicit selection run as `SELECT *` over native fields only.

![Edit report panel with all four sections configured. Filters: category is Home, product_name is Coffee Machine. Slices: order_timestamp from CRM Data after "2026-06-01". Sort: two rules — 1. category ascending, 2. payment_method descending. An arrow points to the "+ Add sort by" button. Limit shows All rows.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c0a3ff65-cf83-4609-7042-1ecf549ca100/public)

---

## Limit

Limit caps the row count. It runs last — after filters, slices, and sort.

| Setting | Value |
|---|---|
| Default | No limit (all rows return) |
| Minimum | 1 |
| Maximum | 10,000,000 |

Enter a number in the **Limit** field to set a cap. Clear the field to return all rows.

> When a limit shrinks the result, OWOX removes extra rows it wrote to the destination on the previous run. In Google Sheets, OWOX clears cells below the last data row so stale values don't sit under fresh ones. See [Google Sheets](../../destinations/supported-destinations/google-sheets.md) for details.

![Edit report panel scrolled to show Slices, Sort, and Limit sections. Slices: order_timestamp from CRM Data after "2026-06-01". Sort: category ascending and payment_method descending. The Limit field shows 20 with a clear button. An arrow points to the Limit field.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/5f4594f7-1f08-49bf-bc6c-ce4123074f00/public)

---

## Order of Execution

OWOX applies output controls in this order on every report run:

1. **Slices** — filter rows inside each joined subquery.
2. **Joins** — join subqueries into the main query.
3. **Filters** — filter the assembled result.
4. **Sort** — order the remaining rows.
5. **Limit** — cap the row count.

---

## Keep Rules Valid After Schema Changes

Output controls reference columns by name. Rename or remove a column in the Data Mart schema, and every report that uses it breaks. The column picker flags the report with a **Disconnected columns** warning. Saving the report then fails with a validation error.

### Disconnected columns warning

Open **Edit report**. The column picker groups the missing columns under a red **Disconnected columns** label with a ⚠ icon. Hover the icon to see:

> *They are missing from the current Data Mart output schema. Uncheck them to remove them from the report, or contact your analyst to restore the schema.*

You have two options:

- **Uncheck the disconnected columns** — this removes them from the report selection only. It does not clear filter, slice, or sort rules that reference them. Open the Filters, Slices, and Sort sections, delete those rules too, then save.
- **Restore the schema** — does the column still belong? Ask whoever manages the Data Mart to add it back. Then reopen the report.

![Edit report panel with a red "Disconnected columns" group at the top of the column list, containing order_date with a checked checkbox. A tooltip is open showing "They are missing from the current Data Mart output schema. Uncheck them to remove them from the report, or contact your analyst to restore the schema." The remaining columns (order_id, customer_id, order_timestamp, product_id, product_name, category, customer_name, country) are listed below and appear valid.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6616af2b-e216-406b-b11a-e876b17df900/public)

### Validation error on save

A filter, slice, or sort rule may still point to a disconnected column. Save the report, and OWOX blocks it with **"Output controls validation failed"**. Open the report, remove the affected rules from the Filters, Slices, or Sort sections, then save again.

!["Output controls validation failed" error banner at the top of the page. The edit report panel shows the Sort section with two rules — category and payment_method — both highlighted in red with warning icons.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2342964b-37d0-4123-32c8-2a1ddbe6d400/public)

---

## Related Links

- [Joinable Data Marts →](joinable-data-marts.md)
- [Using Data Marts from OWOX Extension →](extension-data-marts.md)
- [Google Sheets destination →](../../destinations/supported-destinations/google-sheets.md)
- [Report Triggers →](report-triggers.md)
- [Create SQL-Based Data Mart →](sql-data-mart.md)
