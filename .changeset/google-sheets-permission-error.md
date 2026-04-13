---
'owox': minor
---

# Clearer error when Google Sheet access is denied

When access validation fails due to missing sharing permissions, the error now starts with "You don't have access to this Google Sheet" and then tells users exactly what to do: share the spreadsheet with the account used for authentication (service account email or connected Google account) and grant Editor permission — instead of showing the raw Google API error "The caller does not have permission".
