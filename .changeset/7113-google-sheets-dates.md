---
'owox': minor
---

**Dates from Google Sheets arrive as dates, not text**

A planner who keeps daily targets in Google Sheets got the date column in the warehouse as text, such as `10/1/2026`. Date filters and date grouping did not work on it, and setting the field type to DATE in the Output Schema only added a warning: the next upload wrote text again.

- In a new Data Mart, a column of dates (cells formatted as Date in the sheet) is stored as `DATE` from the first run, with no setting to turn on. The Output Schema then shows it as `DATE`.
- Existing Data Marts keep their columns as they are. To store a column as a date, set its type in the Output Schema to `DATE`: the next run, or the next Upload from the Extension, writes dates and the warning goes away.
- In a `DATE` column, a date-time cell keeps its day, and any other cell that is not a date is imported as an empty value. Run History lists the rows to fix, so one stray value never turns the column back into text. A column with no date at all stays text, and Run History says so.
- In other columns, dates typed as text, date-times, times, durations, and dates mixed with other values stay text.

See the [Google Sheets source guide](../../packages/connectors/src/Sources/GoogleSheets/GETTING_STARTED.md).

<!-- markdownlint-disable-file MD041 MD036 -->
