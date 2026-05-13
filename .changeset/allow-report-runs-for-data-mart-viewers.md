---
'owox': minor
---

# Allow report runs and trigger management for Data Mart viewers

Manual report runs and REPORT_RUN trigger CRUD are now available to any project member who can see the Data Mart and use the Destination, instead of being restricted to the Report Owner.

Business Owners, Tech Owners, and users with shared-for-reporting or for-maintenance access can now run any report on a visible Data Mart and manage its scheduled triggers regardless of report ownership. Report config editing (columns, filters, owners, destination) remains restricted to Owners with an effective Destination, with DM maintenance bypass for Tech Users and Admin override.
