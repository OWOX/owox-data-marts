---
'@owox/api-client': minor
'owox': minor
---

# Send Data Mart reports to Microsoft Excel

Open the OWOX add-in in a workbook, pick a published Data Mart, and the report's rows land in the worksheet. The report then appears in OWOX Data Marts with its title, its run history and its last-run status, and its columns, filters and sorting can be edited there afterwards.

A workbook sits on your machine, so nothing can be pushed into it — the add-in reads the report itself. Four things follow from that:

- You are not asked to name a document in advance. The worksheet you opened the add-in from is where the rows go.
- Such a report is created in the add-in, which is what binds it to a worksheet. The web app offers neither the report nor the destination for creation: the add-in sets both up on first use, and a report made in the web app would be one no workbook points at.
- It cannot be run or scheduled from the web app. The web app says so instead of offering a button that would fail; refresh it from the add-in.
- Refreshing from the add-in _is_ the report running, so the status shown in Excel and in the web app is the same one.

Runs from Excel are billed as **Excel Report Run**, a sub-consumption unit of Report Run, so they can be told apart from data pulled through the HTTP Data API.

Reports on a destination that reads its own data — Excel and Data Studio — no longer accept a run request or a schedule that could never succeed. Both were previously accepted and then failed during execution.
