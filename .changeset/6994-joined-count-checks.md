---
'owox': minor
---

**Warnings when a Count reads a joined Data Mart**

**Count** on a joined field counts the rows of the report's Data Mart that found a match, not the joined Data Mart's own rows. The aggregation popover in the report editor and in the Google Sheets extension now says so while **Count** is ticked: whether the number can come out higher, lower, or cannot be checked because a primary key is missing. It points to **Count Unique**, and to the joined Data Mart's **Unique Count** when that Data Mart offers one. Nothing is blocked, and no warning appears when every join on the way is keyed by a primary key on both sides.

![The aggregation popover for the joined column order_id from Orders, with Count ticked and a warning that several Orders rows can share one join key value, so the count can be lower, pointing to Count Unique and the Unique Count of Orders](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3fde0c96-13de-46f1-9242-663c2c94e300/public)

The formula editor gives the same advice for a calculated field that counts a joined field, and now reads the primary key as you have set it in the Output Schema, saved or not. Previously it kept saying the key was missing until you pressed **Save**, and the save then answered differently. Clearing the key works the same way.

![The Output Schema editor with the primary key ticked on session_id but not saved, and the formula editor for orders_count = COUNT(orders.order_id) warning that several Orders rows can share one join key value](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/12959419-7228-49d6-2ae3-a04a61eb4000/public)

The video walks through both on a Sessions Data Mart joined to Orders:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/f551463ad4902cba92d74e0670509707/iframe>

See [Counting rows in a group](../../docs/getting-started/setup-guide/report-aggregations.md#counting-rows-in-a-group) and [A joined `COUNT` counts this Data Mart's rows, not the joined one's](../../docs/getting-started/setup-guide/joinable-data-marts.md#a-joined-count-counts-this-data-marts-rows-not-the-joined-ones).

<!-- markdownlint-disable-file MD041 MD036 -->
