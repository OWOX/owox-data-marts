---
'owox': minor
---

# Readable field names and search in report Output Controls

The Filters, Slices, and Sort pickers in a report's Output Controls now show the
business-readable field name (its alias, or the column's leaf name), with the joined
data mart name as a muted second line for blended fields, instead of only the raw
nested column identifier. Hovering a field reveals its full path as a tree. Each picker
is now searchable — start typing to filter the list by the readable name, the data mart
name, or the technical field name. Long nested field names no longer overflow the
sidebar, and the section info tooltips stay within view in narrow sidebars.
