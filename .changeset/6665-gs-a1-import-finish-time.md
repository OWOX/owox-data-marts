---
'owox': minor
---

# Google Sheets A1 note shows import finish time

The A1 cell note for a Google Sheets export now records **when the import finished**, not when the first data batch started writing. While rows are still streaming, only the short ODM marker is present; the full provenance block (`Imported at …`, data mart title, and link) is written in the finalize step after all data is on the sheet.
