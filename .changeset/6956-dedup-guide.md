---
'owox': minor
---

**Pick the right Dedup for a joined field, with the guide one click away**

The joined Data Marts guide now explains what a joined field's **Dedup** does: the value a report
column shows, the type it gives the field and with it the aggregations a report can apply, and what
a report's `Sum`, `Average`, `Count Unique` and `Count` read after the join. A table of common cases
shows which Dedup to pick — a lookup attribute, revenue per customer, individual orders, hits per
session, first and last dates, text that varies per key — and where each one stops being exact.

The tooltip on the **Dedup** column header in a joined Data Mart's **Report Fields** tab now links
straight to that section.

![The Dedup column header tooltip in the Report Fields tab of a joined Orders Data Mart, with a Learn more link, above order_id set to COUNT_DISTINCT, session_id to ANY_VALUE and amount to SUM](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/85d688cd-47b1-4471-a8a8-b775425ddc00/public)

See [Choosing a Dedup](../../docs/getting-started/setup-guide/joinable-data-marts.md#choosing-a-dedup).

<!-- markdownlint-disable-file MD041 MD036 -->
