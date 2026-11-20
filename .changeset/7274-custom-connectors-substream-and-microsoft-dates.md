---
'owox': minor
---

**Custom connectors need no workarounds for substream nodes over MCP or Microsoft JSON dates**

A user who builds a custom connector for an API such as Bing Webmaster Tools met two problems. Each one needed a manual step in the Connector Builder or in SQL. Now both work:

- **Substream nodes save over MCP.** A substream node reads a parent list and then calls an endpoint once for each parent record. `create_custom_connector` and `save_custom_connector_draft` refused it with "Remove the keys at …partitionRouter.parent.key", because the key check read the field path in `parent.key` as an access key. The user had to add the node by hand in the Connector Builder. Now the AI assistant saves it, and `get_custom_connector_version` shows the real `parent.key` value instead of `[REDACTED]`. The same check also refused a request body property named `key`, `auth` or `appid`, such as a filter name in `filters[].key`. Now these three names are keys only in `headers` and `queryParameters`. See [Partition router: substream and list](../../docs/connectors/manifest-reference.md#partition-router-substream-and-list).
- **Microsoft JSON dates are no longer empty.** A `date` or `datetime` field was empty when the API sent a date such as `/Date(1316156400000-0700)/`, the format of the Bing Webmaster API. Users stored the value as text and converted it in SQL. Now the field reads it as the UTC instant of its milliseconds. Rows loaded before have an empty date. If the date is one of the node's unique keys, those loads also lost rows: the rows of one write with the same other key values merged into one row. Delete the rows with an empty date, then load their period again: the new rows do not replace them. See [Fields](../../docs/connectors/manifest-reference.md#fields).

<!-- markdownlint-disable-file MD041 MD036 -->
