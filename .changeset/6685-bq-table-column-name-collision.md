---
'owox': minor
---

# Fix BigQuery report runs when table name matches a filter column

BigQuery treats an unaliased table’s short name as a row `STRUCT` alias. When a Table Data Mart pointed at a table such as `…country` and a report filtered on a column also named `country`, the generated SQL compared a `STRUCT` to a string and failed (for example on Google Sheets export).

Output-controls and explicit-projection queries now alias the source as `src` and qualify filter/sort references (`src.\`country\``) in `WHERE`, `ORDER BY`, and `HAVING`. SELECT and GROUP BY stay unqualified so nested RECORD paths keep their previous shape. Existing reports need no reconfiguration; only the generated SQL shape changes.
