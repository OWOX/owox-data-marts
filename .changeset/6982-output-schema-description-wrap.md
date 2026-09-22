---
'owox': minor
---

**Long field descriptions wrap in the Output Schema**

A field's description in a Data Mart's Output Schema now wraps inside its column instead of running on as one line. Previously a long description — including the ones the AI helper generates, which list a nested record's sub-fields by type — stretched the Description column to the length of its longest line, and the whole table had to be scrolled sideways to read it. The line breaks written into a description are kept, so a `STRING: …` / `BOOLEAN: …` breakdown still reads as separate lines.

The description editor also opens at the same width the column wraps at, so a few sentences fit without scrolling the text box.

Applies to every storage the Output Schema is edited for, nested BigQuery `RECORD` fields included; see [Table-based Data Mart](../../docs/getting-started/setup-guide/table-data-mart.md) and [SQL-based Data Mart](../../docs/getting-started/setup-guide/sql-data-mart.md) for where field descriptions are written.
