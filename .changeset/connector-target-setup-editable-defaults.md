---
'owox': minor
---

# Connector Target step: editable dataset/database and table

- Added editable dataset/database and table fields with sensible defaults
- Defaults come from sanitized destination name: dataset/database `${sanitizedDestinationName}_owox`, table `${sanitizedDestinationName}`
- Inline validation: required, `^[A-Za-z][A-Za-z0-9_]*$ `, accessible error state
- Helper text shows full path: `{dataset}.{table}`
