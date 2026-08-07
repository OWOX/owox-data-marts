---
'owox': minor
---

# API surface maintenance

## Low-level API client transport methods

OWOX API clients can now use `patchJson()` and `deleteJson()` alongside
`getJson()`, `postJson()`, `putJson()`, and `getStream()` for `/api/...`
endpoints that do not yet have typed resource abstractions. Authenticated
low-level requests accept only root-relative `/api/...` paths up to 2,048
characters and refuse unsafe paths and redirects, preventing credentials from
being sent to an unintended destination. Existing custom transports remain
source-compatible and can add PATCH and DELETE support independently; calling
an unsupported new method rejects with `OWOXConfigError`.

The existing plugin protocol adds PATCH and DELETE through `ctx.owox` as an
additive capability while preserving compatibility with existing plugins.
Low-level JSON return values are caller-typed and are not runtime-validated;
consumers should prefer typed resource abstractions when available.

## Add Data Mart run lifecycle client support

The Data Mart run lifecycle endpoints now publish their complete request, response, visibility,
pagination, and cancellation contracts. Manual runs and cancellation require Technical User
access; listing and inspecting runs require Business User access to the Data Mart. Manual connector
payloads must be JSON objects no larger than 1 MB. Run list pagination defaults to 100, caps the
limit at 100 and the offset at 100,000, and normalizes fractional, non-finite, and non-positive
values.

`@owox/api-client` adds `dataMarts.run(dataMartId, request)`,
`dataMarts.listRuns(dataMartId, options)`, `dataMarts.getRun(dataMartId, runId)`, and
`dataMarts.cancelRun(dataMartId, runId)`. It exports the Data Mart run, request, response,
pagination, status, type, author, and Data Quality types and validates the complete runtime
response before returning it. Existing `runs.list()` remains the separate project-wide run-history
method; no existing call needs migration.
