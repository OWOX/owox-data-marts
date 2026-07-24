# Google Sheets Source

The Google Sheets source imports one spreadsheet tab into a materialized table in the user's storage.

Authentication uses a Google Service Account JSON key. The spreadsheet must be shared with the service account email.

On each refresh the connector:

1. Reads the selected sheet tab.
2. Uses the configured absolute, one-based `HeaderRow` as warehouse columns.
3. Previews all supported columns and at most 100 sample rows in the setup wizard.
4. Generates stable names for blank, duplicate, or warehouse-incompatible headers.
5. Infers types only from unambiguous native boolean and numeric values.
6. Performs a full refresh so the materialized table reflects the current sheet contents.

## Column selection

`ImportAllColumns` is a hidden boolean configuration field. It defaults to `true` and means that every refresh ignores the saved `Fields` list and imports every column currently present in the sheet. Columns added after setup are therefore included automatically.

Set `ImportAllColumns` to `false` when the user explicitly chooses a subset. In that mode, runtime `Fields` is reconciled after a successful refresh. Missing selected columns are skipped with a warning and removed from the saved field list, while columns that were not selected are not added automatically.

Generated field identifiers contain only lowercase ASCII letters, digits, and underscores. They start with a letter or underscore, are unique after normalization, and never exceed 127 bytes including duplicate suffixes such as `_2`.

The preview lists `_owox_row_number` and `_owox_imported_at` alongside sheet fields. `_owox_row_number` is the only unique key and is always imported. `_owox_imported_at` is optional: it appears in runtime rows, schema, and reported fields only when selected in `Fields`. `ImportAllColumns` controls sheet columns and does not override this technical-field choice.

## Ranges and headers

`HeaderRow` is always the absolute row number in the sheet, including when `Range` starts below row 1. For example, with `Range` set to `B5:F` and headers on the first row of that range, set `HeaderRow` to `5`.

Blank header cells receive names such as `column_2`. A completely empty selected range has no schema and fails with a configuration error. A header-only range has a valid schema and an empty data snapshot.

## Values and empty snapshots

Text remains text. Values such as `00123`, `true`, and `2026-01-01` are `STRING` when the Google Sheets API returns them as text. Only native JSON booleans and numbers can be inferred as `BOOLEAN`, `INTEGER`, or `NUMBER`; mixed columns use `STRING`. Disable `InferTypes` to make every user column `STRING`.

The first iteration supports up to 100,000 data rows per sheet refresh. Larger sheets fail with a clear error and should be narrowed with `Range`; incremental and append imports are outside this connector's current full-refresh scope.

A header-only sheet publishes a zero-row full refresh, clearing rows from the previous refresh so a successful run never leaves stale sheet data in the warehouse.

The destination is a connector-managed materialized table. Configure durable warehouse access controls at the dataset, schema, or catalog level. On storages whose native DDL cannot atomically replace both schema and data in place, a full refresh replaces the table object; manually attached table policies, streams, and similar metadata are outside the connector's ownership contract.

The connector refreshes and retries once when Google rejects an access token with HTTP 401. Transient failures use bounded retry backoff, and HTTP `Retry-After` is honored for up to five minutes.

This connector is intended for manually maintained data such as goals, targets, plans, and mappings.
