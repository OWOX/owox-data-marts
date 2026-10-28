---
'owox': minor
---

**Deleting a context no longer gets stuck on members with Entire project scope**

A Project Admin cleaning up Contexts could not delete one: the dialog said it was attached to several Members, yet in **Project Settings → Members** all of them had **Entire project** scope and no contexts, so there was nothing to detach. The only way out was to switch each of those members to **Selected contexts only**, untick the context, and switch them back. This happened because a member switched to Entire project keeps their context assignments, so they come back if the admin switches the member back. A member who became a Project Admin could keep them too. Now the delete counts only the members that show the context in Members.

- **Members** in the delete dialog, and `memberCount` in `GET /api/contexts/{id}/impact`, count only non-admin members with Selected contexts only scope.
- Assignments kept by Project Admins and Entire project members are removed together with the context.
- The **Members** column in **Project Settings → Contexts** lists Project Admins and Entire project members on every context, as the context panel does, instead of only on contexts they kept from an earlier scope. In **Project Settings → Members**, Project Admins show no contexts.

  ![Project Settings → Contexts with Finance, Marketing and Sales: every row's Members column shows the same admins and Entire project members, and the hover card on Finance's +3 lists Marco Rossi, Olivia Park and Tom Becker](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d653b6aa-c687-4d76-9e44-faf8a101cf00/w=800)

See [Deleting a Context](../../docs/project/contexts.md#deleting-a-context).

<!-- markdownlint-disable-file MD041 MD036 -->
