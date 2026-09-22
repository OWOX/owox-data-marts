---
'owox': minor
---

# A hidden column no longer reads as a broken schema

Hiding a field from reporting takes it off the reporting menu — it does not remove it from the Data Mart. A report that already selected that field said otherwise: it listed the column under **Disconnected columns** and refused to build with _"They are missing from the current Data Mart output schema… contact your analyst to restore the schema."_ Nothing was missing, and the analyst being contacted was usually the person who had just hidden it.

The report editor and the error now tell the two states apart:

- **Hidden columns** — still in the Data Mart, taken off the menu. Uncheck them, or ask your analyst to show them in reports again.
- **Disconnected columns** — genuinely gone from the schema. Unchanged: uncheck them, or have the schema restored.

![The Report Columns list of a report that selected a since-hidden calculated field. An amber "Hidden columns" group at the top holds the checked ROAS column, with an eye-off icon whose tooltip reads "They are still in the Data Mart, but hidden from reporting. Uncheck them and remove any filter, sort, aggregation or date bucket rule that references them, or ask your analyst to show them in reports again." The remaining columns — date, source, medium, campaign, revenue, adCost, Unique Count — are listed below.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6acba015-823f-4b50-c752-46d359639700/public)

This covers every switch that hides a column — a Data Mart's own field, a calculated field, a joined Data Mart's field, and **Hide from reports** on a single joined field in the join's Report Fields tab — and nothing about what hiding does has changed: the column stays out of the picker and the MCP tools, a report that selects one still cannot run until it is unchecked, and a formula that references one keeps computing. A report carrying one column of each kind is told about both, and keeps the advice to restore the schema. See [Report Output Controls](../../docs/getting-started/setup-guide/output-controls.md).
