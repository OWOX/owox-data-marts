---
'owox': minor
---

# Slices: filter joined data marts before they are joined

Reports on joined data marts gain a new `slicesConfig` field. A **slice** is a filter
applied **before** the JOIN (inside the subsidiary's raw CTE) — so large subsidiary
tables (e.g. `users` with 10 years of data joined into `orders`, `reportRuns` over a
long window) can be narrowed to the rows you actually need before the join, instead
of filtering the full join product after the fact.

**UI**: on a joined column, the filter popover now offers a `Filter | Slice` tab
toggle, and a new SLICES section appears in the Report editor alongside Filters /
Sort / Limit. Clicking the filter icon on a column with exactly one active rule
opens the popover pre-filled in edit mode (Apply replaces instead of appending).
Each section header also gained an info tooltip describing what the section does
and when filters vs. slices apply.

**Backend**: SQL codegen extended in `AbstractBlendedQueryBuilder` to inject a
per-CTE WHERE inside each joined data mart's `*_raw` CTE using the existing
`SqlClauseRenderer` (now parameter-prefix-aware to avoid `@p0` collisions). Two
upstream tweaks: `BlendedReportDataService.buildRelationshipChains` pulls chains
referenced only by slices, and `collectSubsidiaryReferences` projects slice
columns into the raw CTE.

**Scope**: BigQuery only for v1 (same capability gate as filter/sort/limit; other
storages light up automatically once they grow a `SqlClauseRenderer` subclass).
Slices on the home data mart, slices on simple (non-joined) data marts, and
`relative_date_to_field` (date relative to another field) are out for v1 and
return clear `SLICES_REQUIRE_JOINED_DATA_MART` / `SLICE_*` errors when attempted.
