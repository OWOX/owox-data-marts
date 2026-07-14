# Getting Started

1. Create a Data Mart with the Google Sheets source.
2. Authorize Google Sheets access with OAuth or Service Account JSON.
3. Provide the spreadsheet ID or URL.
4. Provide the sheet tab name.
5. Click Next to preview detected columns from the configured header row.
6. Keep all columns selected or clear columns you do not want to import.
7. Choose a storage table.
8. Run a refresh to materialize the sheet into storage.

The connector treats the first row as headers by default. Use `HeaderRow` when headers are lower in the sheet. Set `HeaderRow` to `0` to import every row without headers; the connector will generate `column_1`, `column_2`, and so on.

By default, every detected column is selected in the setup wizard.

Use OAuth for quick user setup. Use Service Account JSON for scheduled imports that should not depend on a personal Google account; share the spreadsheet with the service account email before running the refresh.
