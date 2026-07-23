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

## Reconcile the project run history contract

`GET /api/data-marts/runs` now publishes the complete project-wide run-history contract, including
viewer visibility, pagination normalization, enums, field presence and nullability, and the
backend's RFC3339 timestamp profile. `createdByUser` is the nullable run-author field; when present
it includes `userId` and may include nullable `fullName`, `email`, and `avatar` values.
`definitionRun` remains present but can be `null` when a historical definition snapshot is
unavailable.

`@owox/api-client` validates this contract and exposes it as `runs.list({ limit, offset })`.
Consumers using the previously released `runs.getHistory(...)` method must rename those calls to
`runs.list(...)`; the response and option type exports remain available.
