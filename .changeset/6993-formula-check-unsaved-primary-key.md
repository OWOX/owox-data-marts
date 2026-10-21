---
'owox': minor
---

**The formula editor reads a primary key you have not saved yet**

Previously, after you set a primary key in the Output Schema, the formula editor kept warning that a joined `COUNT` "cannot tell" which way it is off until you pressed **Save**, and the save then answered differently. The editor now judges a formula that reads a joined Data Mart against the primary key as you have set it, so its warnings match the ones the save gives. Clearing the key works the same way.

![The Output Schema editor with the primary key ticked on session_id but not saved, and the formula editor for orders_count = COUNT(orders.order_id) warning that several Orders rows can share one join key value](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/12959419-7228-49d6-2ae3-a04a61eb4000/public)

See [A joined `COUNT` counts this Data Mart's rows, not the joined one's](../../docs/getting-started/setup-guide/joinable-data-marts.md#a-joined-count-counts-this-data-marts-rows-not-the-joined-ones).

<!-- markdownlint-disable-file MD041 MD036 -->
