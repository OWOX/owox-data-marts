---
'owox': minor
---

**Deleting a context no longer gets stuck on members with Entire project scope**

A Project Admin cleaning up Contexts could not delete one: the dialog said it was attached to several Members, yet in **Project Settings → Members** all of them had **Entire project** scope and no contexts, so there was nothing to detach. The only way out was to switch each of those members to **Selected contexts only**, untick the context, and switch them back. This happened because a member switched to Entire project keeps their context assignments, so they come back if the admin switches the member back. Now those kept assignments no longer block the delete.

- **Members** in the delete dialog, and `memberCount` in `GET /api/contexts/{id}/impact`, count only members with Selected contexts only scope.
- Assignments kept by Entire project members are removed together with the context.

See [Deleting a Context](../../docs/project/contexts.md#deleting-a-context).

<!-- markdownlint-disable-file MD041 MD036 -->
