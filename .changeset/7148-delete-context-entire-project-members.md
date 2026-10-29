---
'owox': minor
---

**Deleting a context no longer gets stuck on attachments you cannot see**

A Project Admin cleaning up Contexts could not delete one: the dialog said it was attached to several Members or to a Data Mart, but there was nothing to detach. Those members showed **Entire project** scope and no contexts in **Project Settings → Members**, and the Data Marts link opened an empty list. A member could be freed only by switching them to **Selected contexts only**, unticking the context and switching back; a deleted Data Mart could not be freed at all. Both kept a link the admin could not see: a member switched to Entire project, or made a Project Admin, keeps their context assignments so they come back if the member is switched back, and a deleted Data Mart, Storage or Destination keeps its contexts. Now the delete counts only what the admin can see and detach.

- **Members** in the delete dialog, and `memberCount` in `GET /api/contexts/{id}/impact`, count only non-admin members with Selected contexts only scope.
- **Data Marts**, **Storages** and **Destinations** in the dialog, and their counts in the same endpoint, no longer include deleted ones.
- Assignments kept by Project Admins and Entire project members, and the contexts of deleted Data Marts, Storages and Destinations, are removed together with the context.
- The **Members** column in **Project Settings → Contexts** lists Project Admins and Entire project members on every context, as the context panel does, instead of only on contexts they kept from an earlier scope. In **Project Settings → Members**, Project Admins show no contexts.

  ![Project Settings → Contexts with Finance, Marketing and Sales: every row's Members column shows the same admins and Entire project members, and the hover card on Finance's +3 lists Marco Rossi, Olivia Park and Tom Becker](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d653b6aa-c687-4d76-9e44-faf8a101cf00/w=800)

See [Deleting a Context](../../docs/project/contexts.md#deleting-a-context).

<!-- markdownlint-disable-file MD041 MD036 -->
