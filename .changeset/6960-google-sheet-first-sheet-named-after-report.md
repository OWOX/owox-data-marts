---
'owox': minor
---

# Google Sheets: the first sheet of an auto-created document is named after the report

When a Google Sheet is created for a report — by `add_report` through the assistant without a `spreadsheet_id`, or with the "Create document" button in the report form — its single sheet (tab) is now named after the document title, like the Drive file already was: the report name for `add_report`, and for the "Create document" button the report title or, while the report has no name yet, the data mart title. Previously that sheet kept Google's default "Sheet1", so a document holding several related exports read "Sheet1 / <second report>": the first report's tab was the only one not carrying its name. Sheets added to an existing spreadsheet and sheets restored by "Reconnect" were already named after their report; documents created before this change are not renamed. Because sheet names are unique within a spreadsheet, every report added to the same document needs a distinct name, including the first report's.
