---
'owox': minor
---

**Plugins can show the SQL and totals of a Data Mart read before the rows arrive**

A plugin that streams Data Mart rows with `traverseData()` gets the ID of its run in `data.runId`. OWOX saved that run only after the last row. So the plugin had to read every row before it could show the totals. A read that only selected columns saved no SQL, so the plugin could not show which query produced the data.

Now OWOX saves the run when the read starts, with the status Running. Before the first row arrives, the run holds the SQL of the read and the totals of its metrics. When the stream ends, the run gets its final status and the row count. Scripts that use `@owox/api-client` and other HTTP Data reads get the same run. Run History shows the SQL as **Executed SQL** for each of these runs. See [Read Data Mart data](../../docs/plugins/authoring-guide.md#read-data-mart-data) and [Stream Data Mart rows](../../docs/api/api-client.md#stream-data-mart-rows).

![Run History of a Data Mart: a Manual HTTP Data run with the Success status and its Configuration tab open on the Executed SQL block](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4dbc1270-9fdc-42e3-9af9-f63e3d7c5700/public)

<!-- markdownlint-disable-file MD041 MD036 -->
