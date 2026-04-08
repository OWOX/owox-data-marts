---
'owox': minor
---

# Clearer error when Google Sheet isn't shared with the service account

When access validation fails due to missing sharing permissions, the error now tells users exactly what to do: share the spreadsheet with the service account email and grant Editor permission — instead of showing the raw Google API error "The caller does not have permission".
