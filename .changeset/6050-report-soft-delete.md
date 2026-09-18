---
'owox': minor
---

**Deleted reports are retained**

**This update includes a database migration. Older backend versions do not hide deleted reports; reverting the migration makes those reports visible again.**

Report deletion now uses soft delete: reports are removed from lists while their settings and run history remain stored.
