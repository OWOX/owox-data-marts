---
'owox': patch
---

# Allow sorting a report by a column that is not in the output

Report sorting no longer requires the sorted column to be among the selected
output columns. A non-aggregated report can now sort by any column of its data
mart (including joined/blended columns when the report has an explicit column
selection), the same way filters already work — so the `Output controls
validation failed` error no longer appears for a valid sort on a hidden column.

Aggregated (grouped) reports are unchanged: they can still sort only by a
projected dimension or an aggregated metric, because SQL `GROUP BY` cannot
order by a column that is neither grouped nor aggregated.
