---
'owox': minor
---

# Calculated Field improvements

Six changes to the Calculated Field editor, from feedback on the released version.

**A row-level field keeps its "Σ available" control while its formula is edited.** Touching the formula of a calculated field that is a dimension took that control off the row until the schema was saved, which read as the setting having been lost.

**Unsaved edits survive a background refresh.** The Output Schema editor reset itself whenever the Data Mart was re-read — which happens on its own, without anyone asking — and a formula typed but not yet saved went with it, while a failed save's errors stayed on screen naming a field no longer in the table. It now resets only when the saved schema has actually changed.

**A rejected formula is named where the refusal appears.** Choosing "Save & leave" on the unsaved-changes prompt reported `Request failed with status code 400`, which names neither the field nor the fix. It now names the field the warehouse rejected.

**A calculated field no longer stretches its row.** A formula written over several lines made its row that many lines tall. The row now shows at most two lines — the most it can show without growing — and hovering it shows the whole formula with the author's own line breaks.

**The division warning is about the formula in front of you.** It quoted `NULLIF(SUM(impressions), 0)` whether or not `impressions` appeared anywhere in the formula, and read like a refusal although it blocks nothing. It now quotes the denominator this formula actually divides by, underlines it in the editor, and says plainly that it is advice. It quotes the whole denominator or nothing at all — never a piece of one, since guarding a piece leaves the division just as broken and silences the warning.

**`COALESCE` no longer counts as a guard against that division.** What fails a query is a zero denominator, not a null one — and `COALESCE(SUM(x), 0)` produces exactly the zero that fails it. Accepting it meant agreeing with a formula that had guarded nothing. The message and [the setup guide](https://docs.owox.com/docs/getting-started/setup-guide/calculated-fields/) now say zero rather than "zero or empty", and the guide explains why `COALESCE` does not count. The guide also gains a worked example for rates over a condition, such as an activation rate.
