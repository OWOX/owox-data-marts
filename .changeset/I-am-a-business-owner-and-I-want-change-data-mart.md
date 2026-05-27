---
'owox': minor
---

# Fix: Business Owner assignment no longer reduces a Technical User's access to a Data Mart

A Technical User assigned as a Business Owner of a Data Mart that was *Available for maintenance* could only **See** and **Use** the Data Mart — losing the **Edit**, **Delete**, and **Manage Triggers** actions they would have had as a non-owner Technical User with the same availability. Being tagged as a Business Owner effectively downgraded their access instead of adding to it.

Ownership is now additive: a Business Owner always receives **See** and **Use** (even when the Data Mart is not shared), and a Business Owner who is also a Technical User additionally inherits the maintenance actions granted by the *Available for maintenance* toggle. Business Users assigned as Business Owner are unchanged — they still get **See** and **Use** only, because the Business User role does not permit maintenance on Data Marts. *Configure Availability* and *Manage Owners* continue to require a Technical Owner with Technical User role or a Project Admin.
