---
'owox': minor
---

# Preview SQL no longer requires edit access

Opening **Preview SQL** on a report used to fail with "edit access to the source data mart is required" for anyone without maintenance access — including Business Users on a Data Mart shared for reporting, and Technical Users who are not owners of it. Reading the query a report runs is now tied to seeing the report: if a Data Mart is visible to you, you can open the generated SQL of any report on it and copy it to the clipboard.

The two actions in that dialog that genuinely need maintenance access — the SQL validator (dry run) and **Copy as Data Mart** — are now hidden for users without it instead of failing on click. Reports that join a Data Mart the viewer cannot access still refuse to render SQL, naming the inaccessible Data Mart.
