---
'owox': minor
---

# Improved BigQuery Configuration Validation

Configuring BigQuery storages is now safer with better project ID validation.

- Invalid project ID values are now caught immediately when saving OAuth-authenticated BigQuery storages
- Clear error messages help you correct typos or formatting issues before they cause problems
- Data mart runtime errors due to misconfigured project IDs are prevented

This ensures your BigQuery connections are properly set up from the start, saving debugging time later.
