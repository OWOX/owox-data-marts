---
'owox': minor
---

# New Data Marts, Storages and Destinations are available by default

Previously, when the Permissions Model project created a new Data Mart, Data Storage or Data Destination, the "Available for reporting / use" toggle defaulted to OFF — so other project members could not see the entity until the owner remembered to enable the toggle. Now every freshly created Data Mart, Storage and Destination is shared with the project (Reporting / Use = ON) by default. The stronger "Available for maintenance" toggle still starts OFF on all three, since granting maintenance lets other technical users edit, delete and manage triggers/credentials, which should remain an explicit decision. Existing entities are not migrated: any availability you have previously set or cleared stays exactly as you left it.
