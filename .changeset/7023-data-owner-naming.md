---
'owox': minor
---

**Technical Owner and Technical User are now called Data Owner**

The owner field on a Data Mart, formerly **Technical Owner**, is now **Data Owner**. The project
role formerly called **Technical User** is now also **Data Owner**. Both are named after the
person who is responsible for the data. Access and permissions do not change. Business Owner,
Business User and Project Admin keep their names.

The video shows the new name in the app:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/bf8bc0a1826a2b52ef94be6884c80807/iframe>

![Ownership section of a Data Mart Overview tab with the Data Owner and Business Owner fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9f05e842-3f4d-4677-6672-6dfb6852f600/public)

![Configure member panel with the Data Owner role selected for a project member](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/76120347-461f-4811-8dad-45fb3ad10c00/public)

The new name is used on the Data Mart page, in the Data Marts list column and filter, in the
member and access-request role pickers, and in sharing hints, error messages and the MCP guidance.
Invitation emails in self-hosted deployments use it too. The API keeps its field names, such as
`technicalOwnerIds` and `technicalOwnerUsers`, and the role value stays `editor`, so existing
integrations keep working. See [Roles and Permissions](../../docs/project/roles-and-permissions.md)
and [Ownership and Sharing](../../docs/project/ownership-and-sharing.md).

<!-- markdownlint-disable-file MD041 MD036 -->
