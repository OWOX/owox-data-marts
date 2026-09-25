# Getting Started

1. Create a Data Mart with the Google Sheets source.
2. Authorize Google Sheets access with OAuth or Service Account JSON.
3. Choose the spreadsheet with Google Picker for OAuth, or provide its ID or URL for a service account.
4. Pick the sheet tab from the list that loads once the spreadsheet is known. If the list cannot be loaded, type the tab name.
5. Click Next to preview detected columns from the configured header row.
6. Keep all-columns mode enabled, or switch to explicit subset mode and choose columns.
7. Choose a storage table.
8. Run a refresh to materialize the sheet into storage.

The connector treats row 1 as headers by default. `HeaderRow` and `Range` live under Advanced Settings. `HeaderRow` is an absolute, one-based sheet row. If `Range` is `A5:D` and its first row contains headers, set `HeaderRow` to `5`. Blank header cells receive generated names such as `column_2`.

By default, `ImportAllColumns` is `true`, so every refresh imports all current columns and automatically includes schema additions. The web configuration persists `ImportAllColumns: false` only when the user chooses an explicit subset; runtime `Fields` tracks the latest materialized schema.

`_owox_row_number` is the mandatory unique key. `_owox_imported_at` is optional and can be selected or cleared like a regular field; all-columns mode does not force it back into the runtime schema.

Field preview includes all supported columns and up to 100 sample data rows. The import itself reads the full configured range.

Text identifiers retain their text type and leading zeros. A sheet with headers but no data rows performs a zero-row full refresh so the warehouse always reflects the current sheet.

Use OAuth for quick user setup. Use Service Account JSON for scheduled imports that should not depend on a personal Google account; share the spreadsheet with the service account email before running the refresh.

## Upload from the OWOX Extension

People who edit the sheet can refresh the storage table without opening OWOX Data Marts. They use the [OWOX Extension for Google Sheets](https://workspace.google.com/marketplace/app/owox_data_marts/94902851409):

1. Open the tab that the Data Mart imports.
2. Open the extension. It finds the published Data Mart for that tab and shows its **Upload** card, with the date and status of the last import.
3. Click **Upload**. The extension starts a manual run and locks the button until the run finishes, then shows the result.

The run is an ordinary manual run. It fully replaces the storage table with the current sheet data, it appears in the Data Mart's **Run History**, and it counts toward consumption. If a run is already in progress, the extension shows the reason instead of starting another one.

Upload needs the project **Editor** role and edit access to the Data Mart, the same as a manual run in the web app. On any other tab, the extension offers reports as before. The Upload card also links to **Create a report on this sheet instead**.
