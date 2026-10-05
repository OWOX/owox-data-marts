---
'owox': minor
---

**Google Sheets reports recover from temporary Google errors and explain the ones they cannot**

Previously a single HTTP 500 or 503 from Google Sheets failed the whole run, and Run History showed
only Google's bare text, such as `Internal error encountered.` or `The service is currently
unavailable.`. OWOX now sends a request that is safe to repeat up to three more times before giving
up. That covers formatting the header row and clearing the imported range. Requests that add or
remove rows or columns are not repeated.

When a run still fails, the error names the step that failed, Google's HTTP status and message, and
how many times OWOX tried. For temporary errors it also suggests what to change. These errors are
most frequent in spreadsheets where other sheets use formulas over whole columns of the report's
sheet — see [When Google Sheets is temporarily unavailable](../../docs/destinations/supported-destinations/google-sheets.md#when-google-sheets-is-temporarily-unavailable).

<!-- markdownlint-disable-file MD041 MD036 -->
