---
'owox': minor
---

**Organizing a project is faster: find Data Marts missing a context or a relationship**

A project admin who groups Data Marts into contexts needs to find the joined Data Marts that are still outside every context: members whose access is limited to selected contexts do not see them. Before, that took two screens and a manual comparison. The Models canvas showed which Data Marts have relationships, one storage at a time and without contexts, and the Data Marts list could show "no context" only by excluding every context one by one. Now the Data Marts list answers it with two filters: **Relationships** _With relationships_ and **Contexts** _No context_.

![The Data Marts list Filters panel with two conditions, Relationships is any of With relationships and Contexts is any of No context, and the list behind it narrowed to 2 rows](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/075111d8-962d-42bb-4ff7-72cc2f293000/w=800)

- **Relationships** filter: _With relationships_ or _Without relationships_, across all storages. A relationship counts whether the Data Mart defines it or another Data Mart points to it; a relationship with a Data Mart you cannot see does not count.
- **Contexts** filter: a new **No context** option, which you can combine with real contexts.
- `GET /api/data-marts` returns `relationshipsCount` on every list item: the same number as on the Data Mart's Models canvas card.

See [Find Data Marts With or Without Relationships](../../docs/getting-started/setup-guide/joinable-data-marts.md#find-data-marts-with-or-without-relationships) and [Contexts](../../docs/project/contexts.md#attaching-contexts-to-resources).

<!-- markdownlint-disable-file MD041 MD036 -->
