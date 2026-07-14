# Google Sheets Source

The Google Sheets source imports one spreadsheet tab into the user's storage as a snapshot table.

Authentication can use OAuth2 or Service Account JSON. OAuth2 is best for quick user setup; Service Account JSON is best for scheduled imports that should not depend on a personal Google account.

On each refresh the connector:

1. Reads the selected sheet tab.
2. Uses the configured absolute, one-based `HeaderRow` as warehouse columns.
3. Previews at most 256 columns and 100 sample rows in the setup wizard.
4. Generates stable names for blank, duplicate, or warehouse-incompatible headers.
5. Infers types only from unambiguous native boolean and numeric values.
6. Replaces the destination table so the warehouse reflects the current sheet contents.

## Column selection

`ImportAllColumns` is a hidden boolean configuration field. It defaults to `true` and means that every refresh ignores the saved `Fields` list and imports every column currently present in the sheet. Columns added after setup are therefore included automatically.

Set `ImportAllColumns` to `false` when the user explicitly chooses a subset. In that mode, `SelectedColumns` preserves the requested subset while runtime `Fields` reports the columns present in the latest successful snapshot. Missing selected columns are skipped with a warning, remain remembered if they return, and columns that were not selected are not added automatically.

Generated field identifiers contain only lowercase ASCII letters, digits, and underscores. They start with a letter or underscore, are unique after normalization, and never exceed 127 bytes including duplicate suffixes such as `_2`.

The preview lists `_owox_row_number` and `_owox_imported_at` alongside sheet fields. `_owox_row_number` is the only unique key and is always imported. `_owox_imported_at` is optional: it appears in runtime rows, schema, and reported fields only when selected in `Fields`. `ImportAllColumns` controls sheet columns and does not override this technical-field choice.

## Ranges and headers

`HeaderRow` is always the absolute row number in the sheet, including when `Range` starts below row 1. For example, with `Range` set to `B5:F` and headers on the first row of that range, set `HeaderRow` to `5`.

Blank header cells receive names such as `column_2`. A completely empty selected range has no schema and fails with a configuration error. A header-only range has a valid schema and an empty data snapshot.

## Values and empty snapshots

Text remains text. Values such as `00123`, `true`, and `2026-01-01` are `STRING` when the Google Sheets API returns them as text. Only native JSON booleans and numbers can be inferred as `BOOLEAN`, `INTEGER`, or `NUMBER`; mixed columns use `STRING`. Disable `InferTypes` to make every user column `STRING`.

A header-only sheet publishes a zero-row replacement snapshot, clearing rows from the previous snapshot so a successful refresh never leaves stale sheet data in the warehouse.

The destination is a connector-managed snapshot table. Configure durable warehouse access controls at the dataset, schema, or catalog level. On storages whose native DDL cannot atomically replace both schema and data in place, publication replaces the table object; manually attached table policies, streams, and similar metadata are outside the connector's ownership contract.

The connector refreshes and retries once when Google rejects an access token with HTTP 401. Transient failures use bounded retry backoff, and HTTP `Retry-After` is honored for up to five minutes.

This connector is intended for manually maintained data such as goals, targets, plans, and mappings.
