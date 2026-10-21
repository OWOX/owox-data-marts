---
'owox': minor
---

**Organizing a project is faster: find Data Marts missing a context or a relationship**

A project admin who groups Data Marts into contexts needs to find the joined Data Marts that are still outside every context: members whose access is limited to selected contexts do not see them. Before, that took two screens and a manual comparison. The Models canvas showed which Data Marts have relationships, one storage at a time and without contexts, and the Data Marts list could show "no context" only by excluding every context one by one. Now the Data Marts list answers it with two filters: **Relationships** _With relationships_ and **Contexts** _No context_.

- **Relationships** filter: _With relationships_ or _Without relationships_, across every storage you can see.
- **Contexts** filter: a new **No context** option, which you can combine with real contexts.
- **Relationships** column, hidden by default and sortable: the relationships a Data Mart defines plus the ones that point to it, the same number as on its Models canvas card. A relationship with a Data Mart you cannot see is not counted.
- `GET /api/data-marts` returns this number as `relationshipsCount` on every list item.

See [Find Data Marts With or Without Relationships](../../docs/getting-started/setup-guide/joinable-data-marts.md#find-data-marts-with-or-without-relationships) and [Contexts](../../docs/project/contexts.md#attaching-contexts-to-resources).

<!-- markdownlint-disable-file MD041 MD036 -->
