---
'owox': minor
---

**Clearer warning when a report counts a field from a joined Data Mart**

When you tick **Count** on a field from a joined Data Mart, the report editor warns that the number counts your report's Data Mart rows, not the joined Data Mart's. That warning was one dense paragraph, so it was hard to tell what it meant or what to do, and a count of customers that have an order could still pass for a count of orders. Now it opens with what the number counts, such as "Counts Customers rows, not Orders rows". One sentence with the real Data Mart names says whether it can come out higher or lower than the joined Data Mart's row count, and the last line says what to pick instead. When a missing primary key is the reason, the warning names the Data Mart that needs one and links to its Output Schema, which opens in a new tab so the report you are editing stays as it is. Once you set the key there and come back, the warning updates without reopening the report.

![The aggregation popover for the column name from the joined Customers Data Mart, with Count ticked and the warning "Counts Companies rows, not Customers rows": Companies has no primary key, so the count can be higher than the number of Customers rows; set a primary key on Companies, or use Count Unique or the Unique Count of Customers](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/8e327059-1658-4b9a-5e92-e1c7e5364300/w=800)

Data Mart names and aggregation options are in bold, and field names are in monospace as in the column list, so **Count Unique**, which counts distinct values of this field, no longer blurs with `Unique Count`, the joined Data Mart's own row count. When the warning appears is unchanged, and it still blocks nothing. See [Counting rows in a group](../../docs/getting-started/setup-guide/report-aggregations.md#counting-rows-in-a-group).

<!-- markdownlint-disable-file MD041 MD036 -->
