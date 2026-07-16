---
'owox': minor
---

# Report column picker fixes: aggregation editor, Unique count font, filter input & delete

Adding a column in the report column picker's Aggregations panel now opens the
aggregation editor immediately, instead of showing only an icon that required a
second click, and its Apply button stays disabled until you pick a function or
bucket so a new column can no longer be discarded by an empty Apply. The
auto-generated "Unique count" row now uses the same font as the
other fields in the column list, so it no longer stands out as visually inconsistent.
The relative-date "Last N days/months" filter input can now be cleared with
Backspace instead of snapping back to 0. When editing a single filter or slice, a
trash button in the editor header now lets you delete it directly, instead of only
being able to remove it from the top Filters section.
