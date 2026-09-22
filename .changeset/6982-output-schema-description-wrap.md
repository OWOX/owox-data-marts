---
'owox': minor
---

**Long field descriptions wrap in the Output Schema**

A field's description in a Data Mart's Output Schema now wraps inside its column instead of running on as one line. Previously a long description, including the ones the AI helper generates for a nested record, stretched the Description column to the length of its longest line, and the whole table had to be scrolled sideways to read it. Line breaks written into a description are kept, so a `STRING: …` / `BOOLEAN: …` breakdown still reads as separate lines.

![The Output Schema table with a RECORD field whose long description wraps inside the Description column, its STRING and BOOLEAN sub-field lists kept on separate lines](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1156226a-c366-4296-afec-04254227cc00/public)

- A description longer than eight lines ends in an ellipsis; click it to read and edit the full text.
- The description editor opens wide enough for a few sentences and still fits a narrow screen.
- A schema with no descriptions yet keeps the width it had before.

Applies to every storage the Output Schema is edited for, nested BigQuery `RECORD` fields included. See [Table-based Data Mart](../../docs/getting-started/setup-guide/table-data-mart.md) and [SQL-based Data Mart](../../docs/getting-started/setup-guide/sql-data-mart.md) for where field descriptions are written.
