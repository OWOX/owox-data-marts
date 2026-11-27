---
'owox': minor
---

**Owners no longer look removed from the project while a page loads**

The owners of a Data Mart, Storage, Destination, Report or Credential are listed on its page, and a yellow warning marks an owner who has left the project. Previously that warning showed for about a second each time the page opened, as if every owner had left, because the list of project members had not loaded yet. Anyone checking who owns a resource could not tell whether an owner had really left. If the member list failed to load, the warning stayed. Now the warning appears only after the member list has loaded, and only when an owner is no longer a member of the project. If the list cannot load, the owner picker says so and offers to try again, instead of listing every owner as removed.

See [Ownership](../../docs/project/ownership-and-sharing.md#ownership).

<!-- markdownlint-disable-file MD041 MD036 -->
