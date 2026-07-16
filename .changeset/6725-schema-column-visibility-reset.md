---
'owox': minor
---

# Output schema edits no longer get silently reverted

Previously, unchecking a column (like Alias or Description) in the Output Schema table would revert to visible again after a few seconds, or reset whenever you switched tabs and came back. Toggling "Hidden from reports" on a field while an AI-generated alias or description was still loading would also get undone once the generation finished. Now, column visibility choices persist per data mart across tab switches and page reloads, and any field edits made while AI generation is running are preserved instead of being overwritten. Generating metadata that fills in nothing new also no longer marks the schema as unsaved.
