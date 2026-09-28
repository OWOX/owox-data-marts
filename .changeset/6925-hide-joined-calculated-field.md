---
'owox': minor
---

**Hiding a calculated field that reads a joined Data Mart no longer fails the save**

Previously, **Hide from reports** on a calculated field whose formula reads a joined Data Mart — `roas` over `SUM(orders.amount)`, for example — made the **Output Schema** save fail with _"Cannot build report SQL. Disconnected columns"_ naming that field, so such a field could not be hidden at all. The save now succeeds: the formula is still checked against your warehouse, and the field leaves the report column picker like any other hidden field.

Calculated fields that read only their own Data Mart's columns were not affected. See [Hidden columns warning](../../docs/getting-started/setup-guide/output-controls.md#hidden-columns-warning).

<!-- markdownlint-disable-file MD041 MD036 -->
