---
'owox': minor
---

**The Sheet link of a Google Sheets source opens the imported tab, not the first one**

The **Sheet** link in a Google Sheets Data Mart's **Input Source** is the way back to the data the Data Mart imports, for example to check a plan or fix a value before the next run. Previously it opened the spreadsheet on its first tab, because the link carried only the spreadsheet, so in a spreadsheet with several tabs you had to find the right tab yourself and could look at the wrong data. Now the link opens the tab the Data Mart imports, in existing Data Marts too.

For a member who cannot edit the Data Mart, or when the tab list cannot be loaded, the link opens the spreadsheet on its first tab as before. See [Google Sheets: Getting Started](../../packages/connectors/src/Sources/GoogleSheets/GETTING_STARTED.md).

<!-- markdownlint-disable-file MD041 MD036 -->
