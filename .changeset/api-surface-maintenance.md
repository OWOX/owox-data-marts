---
'owox': minor
---

# API surface maintenance

## Add project search API contract and client support

`GET /api/search` now publishes the integer range and comma-separated serialization of its
optional filters in OpenAPI. `@owox/api-client` adds `search.query(query, options)` and exports
`OWOXSearchResult`, `OWOXSearchEntityType`, and `OWOXSearchOptions` for discovering visible Data
Marts, data storages, and data destinations with validated response data. Existing viewer access
and search behavior are unchanged, and consumers can adopt the client method without a migration.
