---
'owox': minor
---

# Fail fast on disconnected report columns and output controls

Fail fast with a clear error when a report references columns that can no longer be resolved against the data mart schema or its joined data marts setup (for example, after a joined data mart alias was renamed, a relationship was removed, a field disappeared from the schema or was hidden for reporting, or a joined field was hidden in the joined data marts setup). Previously such orphaned references leaked into the generated blended SQL as main data mart columns and failed in the storage with a cryptic "Unrecognized name" error — and selecting a field hidden in the blend setup silently dropped it from the final SELECT while report headers still promised it; now the report run and SQL preview reject them upfront, listing the offending columns. Filter, sort, and slice references to disconnected or hidden fields are rejected by the output-controls validation as well.

The report column picker now also surfaces stale selected columns, filters, and slices in a "Disconnected columns" block at the top of the list (styled like the existing no-access block), so selected stale columns can be unchecked and stale filter/slice rules can be removed to make the report runnable again. Sort-only stale references stay in the Output Controls menu, where stale filters, slices, and sorts are highlighted in red. The Output Controls button now shows the controls count and switches the badge to red when any output control references a disconnected field. Rule popups on disconnected and no-access rows now share one view-and-remove layout that lists the existing filter and slice rules without add or edit controls.
