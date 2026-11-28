---
'owox': minor
---

**See the reports, quality and freshness of joined Data Marts right in the relationship graph**

When you join Data Marts, the Graph view of the Joinable Data Marts block on Data Setup shows what each join brings in. Its cards showed only the input source, the SQL Alias and a field count, in a different style from the Models canvas. To learn whether a joined Data Mart feeds reports, is refreshed or passes its Data Quality checks, you had to open it, and the SQL Alias next to the input source read like a table name. Now every card in the graph is the Models canvas card:

- the Data Mart icon and title, the input source, and the trigger, report and relationship counts;
- the Data Quality, Data Last Updated and sharing footer;
- the relationship's SQL Alias in a pill of its own, with a tooltip that names it, and the number of fields the relationship brings in.

The trigger, report and relationship counts need access to the Data Mart's Storage; without it, the cards show everything else.

![The Graph view of the Joinable Data Marts block with three cards: Companies, the tinted source card, joins Customers, which joins Orders; every card shows its input source, relationship count and the quality, freshness and sharing footer, and the two joined cards also show their SQL Alias and field count](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9a1a5bae-5105-4514-6252-e812edf61400/w=800)

A draft, a loop or a join that is not configured is still named above its card. The graph settings offer the Models canvas options, with Triggers, Reports, Relationships and Quality and sharing added and Status removed.

See [Transitive Joins](../../docs/getting-started/setup-guide/joinable-data-marts.md#transitive-joins).

<!-- markdownlint-disable-file MD041 MD036 -->
