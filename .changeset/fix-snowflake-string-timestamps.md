---
'owox': minor
---

# Fix string timestamp handling in Snowflake storage

- Added support for ISO 8601 string values in TIMESTAMP and DATETIME columns
- String timestamps are now parsed and formatted to `YYYY-MM-DD HH:MM:SS` before being written to Snowflake
- Invalid timestamp strings fall back to the existing special-character obfuscation path
