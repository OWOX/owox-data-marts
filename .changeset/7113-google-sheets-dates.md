---
'owox': minor
---

**Dates from Google Sheets arrive as dates, not text**

A planner who keeps daily targets in Google Sheets got the date column in the warehouse as text, such as `10/1/2026`. Date filters and date grouping did not work on it, and setting the field type to DATE in the Output Schema only added a warning: the next upload wrote text again.

- In a new Data Mart, a column of dates (cells formatted as Date or Date time in the sheet) is stored as `DATE` or `DATETIME` from the first run, with no setting to turn on.
- Existing Data Marts keep their columns as they are. To store a column as a date, set its type in the Output Schema to `DATE` or a date-time type: the next run, or the next Upload from the Extension, writes dates and the warning goes away.
- Dates typed as text, times, durations, and columns that mix dates with other values stay text. When the Output Schema asks for a date and a cell is not one, the run imports the column as text and Run History names the row to fix.

See the [Google Sheets source guide](../../packages/connectors/src/Sources/GoogleSheets/GETTING_STARTED.md).

<!-- markdownlint-disable-file MD041 MD036 -->
