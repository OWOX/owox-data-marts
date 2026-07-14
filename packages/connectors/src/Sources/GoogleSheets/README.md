# Google Sheets Source

The Google Sheets source imports one spreadsheet tab into the user's storage as a snapshot table.

Authentication can use OAuth2 or Service Account JSON. OAuth2 is best for quick user setup; Service Account JSON is best for scheduled imports that should not depend on a personal Google account.

On each refresh the connector:

1. Reads the selected sheet tab.
2. Uses the configured header row as warehouse columns, or generates column names when `HeaderRow` is `0`.
3. Previews the detected columns in the setup wizard and selects all columns by default.
4. Infers column types conservatively.
5. Replaces the destination table so the warehouse reflects the current sheet contents.

The selected setup columns are saved as the connector field list. If a selected column is no longer present during refresh, the refresh fails with a clear error.

This connector is intended for manually maintained data such as goals, targets, plans, and mappings.
