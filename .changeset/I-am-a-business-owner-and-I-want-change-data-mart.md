---
'owox': minor
---

# Fix: Business Owner assignment no longer reduces a Technical User's access to a Data Mart

A Technical User assigned as a Business Owner of a Data Mart that was *Available for maintenance* could only **See** and **Use** the Data Mart — losing the **Edit**, **Delete**, and **Manage Triggers** actions they would have had as a non-owner Technical User with the same availability. Being tagged as a Business Owner effectively downgraded their access instead of adding to it.

Permissions on a Data Mart are now decided by combining two paths: the **ownership floor** (always guarantees **See** and **Use** for any owner, even when the Data Mart is not shared) and the **non-owner sharing path** (the same actions a non-owner of the member's role would receive given the Data Mart's availability). A Technical User who is a Business Owner of a Data Mart that is *Available for maintenance* now receives **Edit**, **Delete**, and **Manage Triggers** through the non-owner path. The non-owner path still respects role scope and contexts: a member with `Selected contexts only` scope needs a context overlap with the Data Mart for the maintenance actions to apply, while the See + Use floor remains available without overlap.

Business Users assigned as Business Owner are unchanged — they still get **See** and **Use** only, because the Business User role does not permit maintenance on Data Marts. *Configure Availability* and *Manage Owners* continue to require a Technical Owner with Technical User role or a Project Admin.
