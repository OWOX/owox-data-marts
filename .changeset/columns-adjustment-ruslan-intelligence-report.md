---
'owox': minor
---

# Google Sheets export now preserves your column layout and side-by-side formulas

Refreshing an OWOX → Google Sheets report no longer wipes the entire tab.
The exporter only touches the rectangle of cells it owns, so anything you
keep in the same sheet — extra columns, formulas, pivot tables, charts,
named ranges — stays intact across refreshes.

- **Your column order wins.** Drag the imported columns into whatever order
  fits your report; refresh keeps that order. Reordering the columns in the
  data mart's Output Schema after the first refresh no longer rearranges
  the sheet.
- **New SQL columns are appended on the right.** A column added later in
  the analyst's Output Schema lands at the right edge of the imported area
  rather than displacing existing columns.
- **Removed SQL columns disappear cleanly.** Any formula that depended on a
  deleted column shows `#REF!` — the same honest signal Sheets gives when
  you delete a column by hand, so you know immediately what to fix.
- **Helper columns next to imported data are preserved.** Currency
  conversions, `VLOOKUP` enrichments, calculated metrics — they keep
  pointing at the right columns across refreshes, and a formula in the
  first data row is automatically drag-filled down across all new rows.
- **Output Schema aliases are respected.** Rename a column to a friendly
  label in the data mart and the sheet header updates without rewriting
  the whole tab.
- **Pivots, charts and named ranges referencing the imported range keep
  working.** Adding or removing SQL columns shifts these listeners the same
  way a manual column insert/delete in Sheets would.
- **Every imported header carries provenance.** Hover any imported column
  header and you see its description followed by the OWOX Data Marts link
  back to the source data mart — not just on the first column anymore.
