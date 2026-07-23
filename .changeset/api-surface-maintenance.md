---
'owox': minor
---

# API surface maintenance

## Reconcile the project run history contract

`GET /api/data-marts/runs` now publishes the complete project-wide run-history contract, including
viewer visibility, pagination normalization, enums, field presence and nullability, and RFC3339
timestamps. `createdByUser` is the nullable run-author field; when present it includes `userId` and
may include nullable `fullName`, `email`, and `avatar` values. `definitionRun` remains present but
can be `null` when a historical definition snapshot is unavailable.

`@owox/api-client` validates this contract and exposes it as `runs.list({ limit, offset })`.
Consumers using the previously released `runs.getHistory(...)` method must rename those calls to
`runs.list(...)`; the response and option type exports remain available.
