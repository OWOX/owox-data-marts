---
'owox': minor
---

# Fix undefined data mart title in delete confirmation dialog

The delete confirmation dialog was referencing an undefined variable `dataMartTitle`. Replaced it with `row.original.title` so the actual data mart name is displayed in the dialog message.
