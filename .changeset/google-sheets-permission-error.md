---
'owox': minor
---

# Clearer error when Google Sheet access is denied

When access validation fails due to missing sharing permissions, the error now clearly states that the account used for authentication doesn't have access to the sheet and tells users exactly what to do: share the spreadsheet with it (service account email or connected Google account) and grant Editor permission — instead of showing the raw Google API error "The caller does not have permission".
