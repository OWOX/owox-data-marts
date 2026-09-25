---
'owox': minor
---

**Upload a Google Sheet to your storage from the OWOX Extension**

A Data Mart on the **Google Sheets** connector imports one tab of a spreadsheet into your storage. Previously, refreshing that table after editing the sheet meant opening OWOX Data Marts and starting a manual run, or waiting for the next scheduled one. Now the person working in the sheet can do it right there: open the [OWOX Extension for Google Sheets](https://workspace.google.com/marketplace/app/owox_data_marts/94902851409?utm_source=changelog) on that tab and click **Upload**.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/95d076f202becdecba2b0072d70f435f/iframe>

- The extension finds the published Data Mart that imports the open tab and shows its **Upload** card right away, with the date and status of the last import. No report is created, and no Data Mart has to be picked.
- **Upload** starts an ordinary manual run: the storage table is fully replaced with the current sheet data, the run appears in the Data Mart's **Run History** and counts toward consumption. The button stays locked until the run finishes. If a run is already in progress, the extension says so instead of starting another one.
- Upload needs the project **Editor** role and edit access to the Data Mart, the same as a manual run in the web app.

On other tabs and in other spreadsheets, the extension works as before, and the Upload card also offers **Create a report on this sheet instead**. The Excel add-in is not affected.

See [Upload from the OWOX Extension](../../packages/connectors/src/Sources/GoogleSheets/GETTING_STARTED.md#upload-from-the-owox-extension).

<!-- markdownlint-disable-file MD041 MD036 -->
