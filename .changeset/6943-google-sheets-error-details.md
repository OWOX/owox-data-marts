---
'owox': minor
---

**Google Sheets errors in Run History explain the cause and the fix**

Previously, when Google Sheets failed to apply a report's changes, Run History showed only Google's
text — `Internal error encountered.`, `The service is currently unavailable.` or `Requested entity
was not found.` — and the same report could fail with a different message every day. These
failures now show one message in plain words: Google Sheets couldn't finish updating the
spreadsheet. It says what to do: run the report again after a single failure; if it fails on every
run, limit the formulas that read whole columns of the report's sheet or send the report to a
separate spreadsheet, and fix circular-reference errors — **Iterative calculation** is only for
circular references made on purpose. Google's text stays at the end as details. See
[When Google Sheets can't finish updating the spreadsheet](../../docs/destinations/supported-destinations/google-sheets.md#when-google-sheets-cant-finish-updating-the-spreadsheet).

Other errors from Google Sheets now name the step that failed and Google's reason.

<!-- markdownlint-disable-file MD041 MD036 -->
