---
'owox': minor
---

**A warning when a report counts a joined field**

**Count** on a joined field counts the rows of the report's Data Mart that found a match, not the joined Data Mart's own rows. The aggregation popover in the report editor and in the Google Sheets extension now says so while **Count** is ticked: whether the number can come out higher, lower, or cannot be checked because a primary key is missing. It points to **Count Unique**, and to the joined Data Mart's **Unique Count** when that Data Mart offers one. Nothing is blocked, and no warning appears when every join on the way is keyed by a primary key on both sides.

![The aggregation popover for the joined column order_id from Orders, with Count ticked and a warning that several Orders rows can share one join key value, so the count can be lower, pointing to Count Unique and the Unique Count of Orders](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3fde0c96-13de-46f1-9242-663c2c94e300/public)

See [Counting rows in a group](../../docs/getting-started/setup-guide/report-aggregations.md#counting-rows-in-a-group).

<!-- markdownlint-disable-file MD041 MD036 -->
