---
'owox': minor
---

**Clearer warning when a report counts a field from a joined Data Mart**

When you tick **Count** on a field from a joined Data Mart, the report editor warns that the number counts your report's Data Mart rows, not the joined Data Mart's. That warning was one dense paragraph, so it was hard to tell what it meant or what to do, and a count of customers that have an order could still pass for a count of orders. Now it opens with what the number counts, such as "Counts Customers rows, not Orders rows". One sentence with the real Data Mart names says whether it can come out higher or lower than the joined Data Mart's row count, and the last line says what to pick instead. When a missing primary key is the reason, the warning names the Data Mart that needs one.

Data Mart names and aggregation options are in bold, and field names are in monospace as in the column list, so **Count Unique**, which counts distinct values of this field, no longer blurs with `Unique Count`, the joined Data Mart's own row count. When the warning appears is unchanged, and it still blocks nothing. See [Counting rows in a group](../../docs/getting-started/setup-guide/report-aggregations.md#counting-rows-in-a-group).

<!-- markdownlint-disable-file MD041 MD036 -->
