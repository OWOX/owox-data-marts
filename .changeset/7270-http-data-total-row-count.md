---
'owox': minor
---

**Plugins can show how many rows a Data Mart read has in total**

A plugin that shows the first rows of a Data Mart, for example 200, could not tell the user how many rows the full result has. The run counted only the rows that the plugin read, so the plugin could not show "200 of 5,000".

Now a plugin asks for the count with `traverseData(id, { includeTotalRowCount: true })` and gets it in `data.totalRowCount` before the first row arrives. OWOX counts the rows of the full result with the same filters, grouping and metric filters as the read. The count is one more query in your storage, so OWOX runs it only for a read that asks for it. If the count fails or takes longer than 60 seconds, the rows still arrive and `data.totalRowCount` is `undefined`. The run keeps the reason.

Scripts that call the HTTP Data endpoint directly send `includeTotalRowCount=true` and get the count in the `x-owox-total-row-count` response header. See [Read Data Mart data](../../docs/plugins/authoring-guide.md#read-data-mart-data) and [Stream Data Mart rows](../../docs/api/api-client.md#stream-data-mart-rows).

<!-- markdownlint-disable-file MD041 MD036 -->
