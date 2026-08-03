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

## Strengthen HTTP Data streaming contracts

`GET /api/external/http-data/data-marts/{dataMartId}.ndjson` now publishes its exact-column
projection, bounded base64url controls, positive-integer limit, NDJSON response, run identifier,
and failure contract in OpenAPI. `@owox/api-client` now provides typed filter, sort, aggregation,
and date-bucket controls for `dataMarts.traverseData(...)` and validates the NDJSON response media
type before traversal. Consumers passing controls through `unknown[]` or widened variables must
adopt the exported rule types or annotate their options with `TraverseDataOptions`; valid inline
calls remain unchanged.

## Actualize the Data Mart list contract

`GET /api/data-marts` now publishes viewer visibility, non-negative integer offset validation,
owner-presence filtering, 1,000-item pages, and the complete nested list-item response contract,
including nullable draft definition types and optional nullable user metadata strings.
`@owox/api-client` validates every returned page and exposes the full `OWOXDataMart` shape;
`dataMarts.list({ offset, ownerFilter })` can start from an offset, filter by
`has_owners` or `no_owners`, and follows subsequent pages automatically. The package exports
`OWOXDataMartListOptions`, `OWOXDataMartOwnerFilter`, and the nested Data Mart enum and object
types, and rejects invalid list options before sending a request. Existing `dataMarts.list()`
calls remain compatible and require no migration.
