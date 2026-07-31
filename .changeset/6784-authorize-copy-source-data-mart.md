---
'owox': minor
---

# Fix: copying a connector configuration now requires access to the Data Mart it comes from

Reusing another Data Mart's connector configuration through "Copy from..."
brings that Data Mart's stored credentials along with it, but only the Data
Mart being edited was checked for permission. A user could therefore copy from
a Data Mart that was never shared with them.

Copying now requires the same permission as it does for storages and
destinations: you must own the source Data Mart, or it must be shared with you
for maintenance. Copying from a Data Mart shared only for reporting, or not
shared at all, is refused.
