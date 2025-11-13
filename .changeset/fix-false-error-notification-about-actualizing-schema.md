---
'owox': minor
---

# Fixed false error notification about actualizing schema

When configuring the Connector-based Data Mart, attempts to update the table schema would cause users to receive an error message in the UI that was not actually an error. For the Connector-based Data Mart, the table and schema are created on first run, so attempting to update the schema before the first run would result in an error in the UI. Now updating schema trigger checks the Data Mart type and doesn't try for these cases
