---
'owox': minor
---

**Hiding a calculated metric no longer fails the save on a Data Mart with a joined formula**

Previously, on a Data Mart with a calculated field that reads a joined Data Mart — `roas` over `SUM(orders.amount)`, for example — **Hide from reports** on any calculated metric, that one included, made the **Output Schema** save fail with _"Cannot build report SQL. Disconnected columns"_ naming the hidden metric. A metric that was already hidden could block adding such a formula in the same way, with _"Hidden columns"_ naming a field nobody had touched. The save now succeeds: every formula is still checked against your warehouse, and hidden metrics leave the report column picker as usual.

Data Marts whose calculated fields read only their own columns were not affected. See [Hidden columns warning](../../docs/getting-started/setup-guide/output-controls.md#hidden-columns-warning).

<!-- markdownlint-disable-file MD041 MD036 -->
