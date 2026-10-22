---
'owox': minor
---

**Connecting a plan from Google Sheets takes fewer guesses**

A marketer or product manager who keeps targets in a spreadsheet and wants plan-vs-fact answers had to guess their way through the Google Sheets connector: which definition type hides the connectors, whether the Google sign-in actually worked, why the file picker opened without its search box, and why the suggested table name was the same one their previous Data Mart already used. Each guess cost a retry or a second sign-in. This release removes the ones that did not need a bigger change.

- The _Connector_ definition type shows the logos of the most used sources (Facebook Ads, Google Ads, TikTok Ads, LinkedIn Ads, Google Sheets) instead of a generic description, so a spreadsheet owner sees where to go.

  ![The Definition Type list with the Connector option showing the logos of Facebook Ads, Google Ads, TikTok Ads, LinkedIn Ads and Google Sheets, followed by "and others"](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1b7377a8-716e-4f49-8c63-2e6dab539800/w=800)

- The Input Source card shows the connector by its name from the catalog ("Google Sheets", not "GoogleSheets") and, for Google Sheets, the selected sheet with a link to the spreadsheet, so several plan Data Marts can be told apart without opening their settings.
- After _Sign in with Google_ a confirmation names the connected account and the next step, and the button shows a connected state, so nobody has to spot a changed label.
- _Copy from…_ is now _Reuse from another Data Mart_ for every connector, with a hint that says what it reuses: the credentials and connection settings of another Data Mart with the same source, so access is not entered or granted twice. For Google Sheets that includes the spreadsheet and sheet, which can still be changed afterwards.

  ![The Reuse from another Data Mart list open above the connector settings, with the hint on what is copied and a Data Mart to copy from](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/67212225-c938-4612-d494-607e67c3d100/w=800)

- The Google file picker is sized to the browser window (down to Google's own 566×350 minimum), so its title and search field stay visible without resizing the window.
- The suggested table name for a Google Sheets source comes from the selected sheet (for example `product_engineering`) instead of the same `google_sheets` for every Data Mart, so differently named sheets get different defaults. The dataset stays `google_sheets_owox`, and a sheet name that leaves no Latin letters or digits still falls back to `google_sheets`, so check the suggestion before saving: nothing stops two Data Marts from writing to one table.

See [Connector Data Mart](../../docs/getting-started/setup-guide/connector-data-mart.md) and the [Google Sheets source guide](../../packages/connectors/src/Sources/GoogleSheets/GETTING_STARTED.md).

<!-- markdownlint-disable-file MD041 MD036 -->
