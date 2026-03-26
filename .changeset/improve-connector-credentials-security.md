---
'owox': minor
---

# Externalize connector secrets from Data Mart definitions

Moved non-OAuth secrets from inline storage in DataMart definitions to a separate
`connector_source_credentials` table. This improves security by centralizing
credential storage and reducing secret exposure in definition JSONs.

- Added `_secrets_id` reference pattern (similar to existing `_source_credential_id` for OAuth)
- Secrets are extracted on save and injected during connector execution
- Includes data migration for existing DataMarts
