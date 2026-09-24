---
'owox': minor
---

**Warn when a join changes how a calculated field's number reads**

A calculated field that reads a joined Data Mart now tells you — while you write the formula and
when you save it — how the join shapes its number. Nothing is blocked: every field still saves as
written, and an AI assistant reading the field through the MCP server gets the same advice as a
caveat to pass on, without naming a Data Mart or field it cannot report on. The walkthrough below
opens four such fields and shows that each still saves.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/0675e406f39aaebb4bea6d0b1ed83c0b/iframe>

- **A joined `COUNT` without `DISTINCT`** counts the rows of this Data Mart that found a match, not
  the joined Data Mart's own rows. It comes out higher when one joined row matches several rows
  here (`FORMULA_JOINED_MEASURE_MULTIPLIED`), and lower when several joined rows share one key — a
  customer with three orders counts once (`FORMULA_JOINED_MEASURE_COLLAPSED`). The warning names
  the join at fault and points at `COUNT(DISTINCT …)` over a column of the joined Data Mart, or at
  its Unique Count as a report column when it offers one. Where no primary key is declared to
  check against, it says the count cannot be checked either way
  (`FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN`) — and a save that sets that key is judged against it.
- **Any joined measure** leaves out the joined Data Mart's rows that match nothing here, so the
  result may not reconcile with that Data Mart's own totals (`FORMULA_JOINED_ROWS_EXCLUDED`). You
  see this when you write or change the formula, not again after every unrelated save.

![The formula editor of the orders_counted field, COUNT(orders.amount), with two amber warnings: the join on user_id can match several rows so COUNT counts matches — use COUNT(DISTINCT ...) or pick its Unique Count measure in a report — and the joined Orders rows that match nothing are dropped](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/82f87930-6be3-4673-abef-7cd540449c00/public)

`SUM`, `AVG`, `MIN`, `MAX` and `COUNT(DISTINCT …)` over a joined Data Mart are already computed
set-based and are not flagged. See
[Calculated Fields Across a Join](../../docs/getting-started/setup-guide/joinable-data-marts.md#calculated-fields-across-a-join).

<!-- markdownlint-disable-file MD041 MD036 -->
