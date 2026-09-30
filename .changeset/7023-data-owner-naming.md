---
'owox': minor
---

**Technical Owner and Technical User are now called Data Owner**

The owner field on a Data Mart, formerly **Technical Owner**, is now **Data Owner**. The project
role formerly called **Technical User** is now also **Data Owner**. Both are named after the
person who is responsible for the data. Access and permissions do not change. Business Owner,
Business User and Project Admin keep their names.

The new name appears everywhere the old ones did: the Data Mart page and the Data Marts list
column and filter, the member and access-request role pickers, sharing hints, error messages,
invitation emails and the MCP guidance. The API keeps its field names, such as
`technicalOwnerIds` and `technicalOwnerUsers`, and the role value stays `editor`, so existing
integrations keep working. See [Roles and Permissions](../../docs/project/roles-and-permissions.md)
and [Ownership and Sharing](../../docs/project/ownership-and-sharing.md).

<!-- markdownlint-disable-file MD041 MD036 -->
