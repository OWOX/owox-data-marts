---
'owox': minor
---

# Combined and Sample are now on by default for text fields

Text columns now offer `Combined` (`STRING_AGG`) and `Sample` (`ANY_VALUE`) out of the box, alongside `Count` and `Count Unique`. Previously both were supported but switched off, so you had to enable them field by field before a report could use them.

Existing Data Marts pick this up automatically — a field only keeps a narrower list if you explicitly chose one for it. Numeric, date, time, boolean, and complex-type fields are unchanged, and neither function is ever included in Totals.
