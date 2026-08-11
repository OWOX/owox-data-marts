---
'owox': patch
---

# Over-long Data Mart descriptions are refused instead of failing on save

Saving a Data Mart description longer than the field can hold now comes back as a validation error naming the field, so it can be shortened and saved. Previously such a description was accepted and then either failed with an unexplained server error or was stored silently cut short.
