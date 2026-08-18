---
'owox': minor
---

# OpenHolidays connector no longer fails when saving fetched data

Every OpenHolidays run failed with `TypeError: storage.saveData is not a function` right after the API returned holiday rows, so no data ever reached the storage table.

The cause: the connector requested its storage instance without waiting for the async initialization to finish, then tried to save data into the still-pending result instead of the ready storage.

Now the connector waits for the storage to initialize before saving, and imports complete successfully.
