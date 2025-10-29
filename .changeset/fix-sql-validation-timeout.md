---
'owox': minor
---

# Improved SQL validation flow in Data Marts to prevent timeout issues

Previously, users were unable to save SQL queries in Data Marts when validation took longer than 30 seconds, causing timeout errors. 

This update resolves the issue by:

- Made SQL validation asynchronous and non-blocking for saving SQL in Input Sources
- SQL validation is no longer required for Publishing Data Marts

Users can now save SQL queries regardless of validation time, improving the overall experience when working with complex queries or large datasets.