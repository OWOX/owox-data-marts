---
'owox': minor
---

# New Data Marts are available for reporting by default

Previously, when a Permissions Model project created a new Data Mart, the "Available for reporting" toggle defaulted to OFF — so other project members could not see the Data Mart or build reports on it until the owner remembered to enable the toggle. Now a freshly created Data Mart is reporting-shared by default while the stronger "Available for maintenance" toggle still starts OFF (since granting maintenance lets other technical users edit, delete and manage triggers, which should remain an explicit decision). Existing Data Marts are not migrated: any reporting visibility you have previously set or cleared stays exactly as you left it.
