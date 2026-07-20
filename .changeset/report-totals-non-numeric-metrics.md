---
'owox': minor
---

# Report totals cover every selected metric, not just numeric fields

Totals — returned by the `query_data_mart` MCP tool and retrievable for a Data Mart run via its
`x-owox-run-id` — now summarize every metric a report aggregates, including `Count` and
`Count Unique` on text, date, or boolean columns, across both native and joined Data Mart fields.
Previously totals covered numeric fields only, so a scorecard that aggregates a text column (for
example the number of distinct countries) came back empty even though the run succeeded. `Sample`
(`ANY_VALUE`) and `Combined` (`STRING_AGG`) are no longer included in totals, since neither reduces
to a meaningful grand total.
