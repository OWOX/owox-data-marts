---
'owox': minor
---

# Google Sheets reports recover from deleted sheets with one click

A Google Sheets report breaks when someone deletes its destination sheet. An import that replaces the spreadsheet's sheets breaks it the same way. The report then failed every run with a cryptic "Failed to find sheet 0" error.

Now the error explains what happened and names the fix. A failed report offers a "Reconnect & run" action in its row menu. One click rebinds the report to a sheet named after it — reusing the sheet if it exists, creating it otherwise — and reruns the report. Renaming the sheet afterwards is safe: the report tracks the sheet by its ID, not its name.
