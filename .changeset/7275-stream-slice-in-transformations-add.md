---
'owox': minor
---

**Custom connectors can add the partition value to each row of substream and list nodes**

A custom connector often calls one endpoint once for each parent record, for example once for each page of a site in Bing Webmaster Tools. The child response does not always repeat the page, so the connector adds it to each row with `transformations.add` and `{{ stream_slice.page }}`. That value was always empty, because `stream_slice` reached only the child request. When the field was one of the node's unique keys, rows of different pages with the same other keys merged into one row, and a later run could add the rows again. Now `add` writes the partition value of the request that returned each row. See [Partition router: substream and list](../../docs/connectors/manifest-reference.md#partition-router-substream-and-list).

**After the update, check each node that adds `{{ stream_slice.<field> }}` to one of its unique keys.** Rows loaded before the update keep the old value in that field: NULL when the template is the whole value. They do not match the new rows and stay next to them. Delete them, then load the period again. A full-refresh node needs no action: its next run replaces the table.

<!-- markdownlint-disable-file MD041 MD036 -->
