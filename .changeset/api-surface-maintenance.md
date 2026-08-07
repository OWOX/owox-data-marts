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

## Manage Data Mart run lifecycles through the API client

`@owox/api-client` now supports starting, listing, inspecting, and cancelling Data Mart runs through
the Data-Mart-scoped `runs.forDataMart(id)` client and its `start()`, `list()`, `get()`, and `cancel()`
methods. Starting and cancelling require Technical User access; listing and inspecting require
Business User access. `start()` accepts typed incremental or manual-backfill options, including
connector-specific fields. Manual-backfill `data` is optional for connectors without backfill
fields. The API client requires an explicit `MANUAL_BACKFILL` run type whenever `data` is supplied
and rejects `data` on implicit or explicit incremental runs before sending a request. The backend
HTTP endpoint separately accepts retained object-valued `data` on incremental requests so existing
run forms remain compatible. The client also rejects empty, dot-segment, or separator-bearing Data
Mart and run IDs before sending a request. Serialized manual-run options are limited to 1 MiB by
both the client and HTTP API; requests above the HTTP transport ceiling return `413` instead of an
internal-server error. Packaged authentication middleware now limits its body parsers to `/auth`,
so it no longer overrides the backend API's 2 MiB transport ceiling.

Scoped list pagination defaults to 100 items when omitted and preserves valid caller-provided limits
and offsets without silently capping them. The scoped list method rejects unknown, zero or negative
limits, negative offsets, non-integer values, non-finite values, and integers outside JavaScript's
safe range before authentication or network access. Project-wide `runs.list()` pagination remains
unchanged and relies on server normalization.
Project-wide and Data-Mart-scoped run methods remain compatible with older self-hosted deployments
that omit Data Quality fields, and Data Quality response validation tolerates additive server fields
while still checking known values. Existing typed integrations need no migration.
