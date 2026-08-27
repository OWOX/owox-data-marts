---
'owox': minor
---

# Report output column schema

`GET /reports/:id/output-schema` returns the columns a report's rows will carry — name, title, description and type — including aggregated columns (`revenue | SUM`), Unique Count and calculated fields, which do not exist on the Data Mart schema.

Joined fields in Excel reports now use the same header form as Google Sheets: `Field name (Data Mart name)`, so the field name stays visible in a narrow spreadsheet cell.
