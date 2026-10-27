# Google Sheets Source

The Google Sheets source imports one spreadsheet tab into a materialized table in the user's storage.

Authentication can use OAuth2 or Service Account JSON. OAuth2 is best for quick user setup; Service Account JSON is best for scheduled imports that should not depend on a personal Google account.

On each refresh the connector:

1. Reads the selected sheet tab.
2. Uses the configured absolute, one-based `HeaderRow` as warehouse columns.
3. Previews all supported columns and at most 100 sample rows in the setup wizard.
4. Generates stable names for blank, duplicate, or warehouse-incompatible headers.
5. Infers types only from unambiguous native boolean, numeric, and date values.
6. Performs a full refresh so the materialized table reflects the current sheet contents.

## Column selection

`ImportAllColumns` is a hidden boolean configuration field. It defaults to `true` and means that every refresh ignores the saved `Fields` list and imports every column currently present in the sheet. Columns added after setup are therefore included automatically.

Set `ImportAllColumns` to `false` when the user explicitly chooses a subset. In that mode, runtime `Fields` is reconciled after a successful refresh. Missing selected columns are skipped with a warning and removed from the saved field list, while columns that were not selected are not added automatically.

Generated field identifiers contain only lowercase ASCII letters, digits, and underscores. They start with a letter or underscore, are unique after normalization, and never exceed 127 bytes including duplicate suffixes such as `_2`.

The preview lists `_owox_row_number` and `_owox_imported_at` alongside sheet fields. `_owox_row_number` is the only unique key and is always imported. `_owox_imported_at` is optional: it appears in runtime rows, schema, and reported fields only when selected in `Fields`. `ImportAllColumns` controls sheet columns and does not override this technical-field choice.

## Sheet tab selection

`SheetName` is a dynamic-options field: once the spreadsheet is known (picked with Google Picker for OAuth, or entered as an ID or URL for a service account), the setup wizard lists the spreadsheet's tabs through the connector's `fetchFieldOptions('SheetName')` method, which reads `spreadsheets.get` with `fields=sheets.properties`. The list needs no permissions beyond the ones the import already uses. When the list cannot be loaded, the tab name can still be typed.

## Ranges and headers

`HeaderRow` and `Range` are advanced settings: most sheets keep their headers in row 1 and import the whole tab, so the wizard shows them under Advanced Settings.

`HeaderRow` is always the absolute row number in the sheet, including when `Range` starts below row 1. For example, with `Range` set to `B5:F` and headers on the first row of that range, set `HeaderRow` to `5`.

Blank header cells receive names such as `column_2`. A completely empty selected range has no schema and fails with a configuration error. A header-only range has a valid schema and an empty data snapshot.

## Values and empty snapshots

Text remains text. Values such as `00123`, `true`, and `2026-01-01` are `STRING` when the Google Sheets API returns them as text. Only native JSON booleans and numbers can be inferred as `BOOLEAN`, `INTEGER`, or `NUMBER`, and only native dates as `DATE` (see Dates); mixed columns use `STRING`. Disable `InferTypes` to make every user column `STRING` unless the Output Schema declares it `DATE`.

A header-only sheet publishes a zero-row full refresh, clearing rows from the previous refresh so a successful run never leaves stale sheet data in the warehouse.

## Dates

A column of native dates (cells the sheet stores as date serials and formats as Date) can be imported as `DATE` (`YYYY-MM-DD`). In a column the Output Schema does not declare as `DATE`, dates typed as text, Date time, time-only and duration cells, and columns that mix dates with other values are imported as before, as `STRING` with the text the sheet shows.

Inside OWOX Data Marts the Data Mart Output Schema decides. The source declares the static `readsOutputSchemaFieldTypes` flag, and the backend passes the hidden run-time parameter `OutputSchemaFieldTypes`: `{"fields": {name: "DATE" | "OTHER"}, "unlistedColumns": "INFER" | "KEEP"}`. Calculated and disconnected fields are left out. The parameter is unset for a new Data Mart (no Output Schema and no successful import yet); a Data Mart that has imported before without an Output Schema gets `"unlistedColumns": "KEEP"`.

- `DATE`: the column is `DATE`. A cell formatted as Date or Date time becomes its calendar day; any other filled cell is imported as an empty value, and the run log lists those rows (row numbers only, never cell contents), so one stray cell never changes the column type. This includes a column inferred as `DATE` on an earlier run: schema actualization then lists it as `DATE`, so a later non-date cell is emptied too, and changing the field type in the Output Schema brings the text back.
- A `DATE` column with no date at all (typically dates pasted as text) is imported as before, with a warning. BigQuery keeps `DATE` in the Output Schema and reports the mismatch, so formatting the cells as dates is enough; the other storages copy the table's text type into the Output Schema, so the field has to be set to `DATE` again as well.
- `OTHER`: the column is imported exactly as before, so an existing table keeps a text column until the user sets the field type to `DATE`. Date-time types are `OTHER` too: their names and time zone handling differ per storage.
- Not listed: with `"unlistedColumns": "INFER"` (or no parameter) and `InferTypes` on, the column becomes `DATE` when every filled cell is a date formatted as Date; otherwise, and with `"KEEP"`, it is imported as before.

An unreadable `OutputSchemaFieldTypes` value imports no column as a date.

Reads: the values read is unchanged. For unlisted columns, one `spreadsheets.get` request reads the number formats of the preview sample (the header row and up to 100 data rows) to find likely date columns. The date columns are then read cell by cell with `spreadsheets.get` (`formattedValue`, `effectiveValue.numberValue`, `effectiveFormat.numberFormat.type`), one request per batch of whole columns, within a cell budget (for the response size) and an encoded ranges budget (for the URL length). Each request is converted as it arrives, so only its cells are held in memory. Every row is checked, including those below the sample, and cells are placed by the `startRow`/`startColumn` each response block reports. If a cell's displayed text differs from the values read, the sheet changed between the reads, so it is read once more, and warnings from the dropped attempt are not logged. If they still differ, the dates are taken from the latest read and the run log says to run the import again: a row inserted between the two reads of that last attempt shifts the dates below it by one row. They are not emptied instead, because if the two reads ever rendered a date format differently, every date of the column would be lost on every run. In the field preview a failed date check falls back to the types the values give.

## Refresh and limits

The first iteration supports up to 100,000 data rows per sheet refresh. Larger sheets fail with a clear error and should be narrowed with `Range`; incremental and append imports are outside this connector's current full-refresh scope.

The destination is a connector-managed materialized table. Configure durable warehouse access controls at the dataset, schema, or catalog level. On storages whose native DDL cannot atomically replace both schema and data in place, a full refresh replaces the table object; manually attached table policies, streams, and similar metadata are outside the connector's ownership contract.

The connector refreshes and retries once when Google rejects an access token with HTTP 401. Transient failures use bounded retry backoff, and HTTP `Retry-After` is honored for up to five minutes.

This connector is intended for manually maintained data such as goals, targets, plans, and mappings.
