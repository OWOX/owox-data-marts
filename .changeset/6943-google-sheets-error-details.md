---
'owox': minor
---

**Google Sheets errors in Run History name the failed step and the likely cause**

Previously, when the Google Sheets API failed during a refresh, Run History showed only Google's
text, such as `Internal error encountered.` or `The service is currently unavailable.`, and the
same report could fail with a different message every day. The error now names the step that
failed and quotes Google's HTTP status and message.

For HTTP 500 and 503 it also says what to check when the failure repeats on every run: a
spreadsheet that takes too long to recalculate after each change, typically because of formulas
over whole columns of the report's sheet or circular references while **Iterative calculation** is
off — see [When Google Sheets fails with HTTP 500 or 503](../../docs/destinations/supported-destinations/google-sheets.md#when-google-sheets-fails-with-http-500-or-503).

<!-- markdownlint-disable-file MD041 MD036 -->
