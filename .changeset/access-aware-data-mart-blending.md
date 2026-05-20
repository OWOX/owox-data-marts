---
'owox': minor
---

# Access-aware Data Mart blending — column picker and relationship graph now respect per-user permissions

Reports and the relationship graph now enforce per-user `USE`/`SEE` access across the full join chain, so users can only build reports from Data Marts they are actually permitted to reach.

- **Relationship graph**: Data Marts the current user cannot access are marked with a warning icon and the entire downstream chain is shown as blocked. Clicking an inaccessible node does nothing.
- **Column picker**: If a saved report contains columns from Data Marts the user has since lost access to, those columns appear in a separate **Inaccessible columns** section (expanded by default) so they can be removed before running the report.
- **Blocked runs**: Running a report with inaccessible columns now returns a clear error — this applies to manual runs, scheduled runs, and Looker Studio connector requests. If your report suddenly fails, check whether your access to a joined Data Mart has changed and remove the affected columns.
- **UI capability flags**: The **View SQL** and **Copy as Data Mart** buttons are now hidden for users without Maintenance access on the source Data Mart.
