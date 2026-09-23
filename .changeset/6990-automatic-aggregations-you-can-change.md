---
'owox': minor
---

**Automatic aggregations you can change**

When a report with a selected column list has no aggregation, OWOX picks one for each metric so the report does not return duplicate rows. Removing those aggregations did not stick: after **Save** the panel was empty, but the next run or reopen of the report applied them again, so the report could not return its rows as stored. Now OWOX remembers every column you remove an aggregation from:

- Remove some of the automatic aggregations and the report runs with the ones you kept.
- Remove all of them and the report returns every row as stored, with no aggregation and no `DISTINCT`, on every run and every reopen.
- Add an aggregation back to a column, or take the column out of the report, and automatic aggregation applies to it again.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/4c9cc84d08e16bc7deb65729ecc21852/iframe>

This covers every destination that collapses on delivery, including the **Microsoft Excel** add-in's own fetch. See [Automatic Aggregation](../../docs/getting-started/setup-guide/report-aggregations.md#automatic-aggregation-no-aggregation-chosen).

<!-- markdownlint-disable-file MD041 MD036 -->
