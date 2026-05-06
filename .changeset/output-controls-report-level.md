---
'owox': minor
---

# Output controls per report — filters, sort, and row limit

You can now shape the data each report writes to its destination directly from
the report editor, without changing the underlying data mart.

- A new **Output controls** panel inside the Report Columns picker exposes
  three sections: **Filters**, **Sort**, and **Limit**.
- **Filters** apply WHERE-style conditions on the final SELECT. Pick a column,
  choose a condition (`is`, `is not`, `contains`, `starts with`, `between`,
  `is empty`, `matches regex`, relative-date presets like *Last N days*, …)
  and a value. Multiple filters on the same column are allowed and combined
  with `AND` — useful for ranges or multi-pattern matches that a single rule
  can't express.
- A small filter icon next to each column in the picker opens a per-column
  popup that lists all rules currently applied to that column, with a quick
  way to add another or remove an existing one.
- **Sort** lets you order the output by one or more columns with `asc`/`desc`
  per column. Reorder priorities by dragging rows.
- **Limit** caps the number of rows written to the destination. Leave the
  field empty for no limit; type a number to apply one.
- Filtering by a column you didn't select for output is supported — the
  picker shows it as available, the resulting SQL pulls it through internally
  but only the selected columns reach the destination.

Output controls are persisted with the report and re-applied on every run
(manual or scheduled). The same controls work for Google Sheets, Email, and
Looker Studio destinations.

**Storage support.** This release ships output controls for **Google BigQuery**
data marts. Reports backed by Athena, Redshift, Snowflake, or Databricks
storages will reject output-control configurations with a clear capability
error until the corresponding adapter lands.

**Safety.** Filter values flow through the BigQuery client as named parameters
(`@p0`, `@p1`, …), not as inlined SQL — so no escaping mistakes can turn a
filter value into injected SQL.
