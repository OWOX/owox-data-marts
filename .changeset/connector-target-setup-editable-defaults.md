---
'owox': minor
---

# Connector Target step: editable dataset/database and table

- Added editable dataset/database and table fields with sensible defaults
- Defaults come from sanitized destination name: dataset/database `${sanitizedDestinationName}_owox`, table `${sanitizedDestinationName}`
- Inline validation: required, only allowed characters, accessible error state
- Helper text shows full path: `{dataset}.{table}`
