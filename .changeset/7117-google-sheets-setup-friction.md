---
'owox': minor
---

**Connecting a plan from Google Sheets takes fewer guesses**

A marketer or product manager who keeps targets in a spreadsheet and wants plan-vs-fact answers had to guess their way through the Google Sheets connector: which definition type hides the connectors, whether the Google sign-in actually worked, why the file picker opened without its search box, and why the suggested table name was the same one their previous Data Mart already used. Each guess cost a retry or a second sign-in. This release removes the ones that did not need a bigger change.

- The _Connector_ definition type now names the popular sources (Facebook Ads, Google Sheets, LinkedIn Ads and more) instead of a generic description, so a spreadsheet owner sees where to go.
- The Input Source card shows the connector by its name from the catalog ("Google Sheets", not "GoogleSheets").
- After _Sign in with Google_ a confirmation names the connected account and the next step, and the button shows a connected state, so nobody has to spot a changed label.
- _Copy from…_ is now _Reuse from another Data Mart_ with a hint that says what it reuses: for Google Sheets, the Google access (signed-in account or service account key), spreadsheet and sheet of an existing Data Mart, with no new sign-in, and the spreadsheet and sheet can still be changed afterwards.
- The Google file picker fits the browser window, so its title and search field stay visible without resizing the window.
- The suggested table name for a Google Sheets source comes from the selected sheet (for example `product_engineering`), not the generic `google_sheets`, so two sheets of one document no longer default to the same table. Previously the default repeated the previous Data Mart's table, and accepting it would have overwritten that table on the next run.

See [Connector Data Mart](../../docs/getting-started/setup-guide/connector-data-mart.md) and the [Google Sheets source guide](../../packages/connectors/src/Sources/GoogleSheets/GETTING_STARTED.md).

<!-- markdownlint-disable-file MD041 MD036 -->
