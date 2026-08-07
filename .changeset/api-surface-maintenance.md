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
connector-specific backfill fields. List pagination defaults to 100 items, caps the limit at 100 and
offset at 100,000, and normalizes invalid numeric values. Responses are type-checked at runtime,
including Data Quality details.

The existing project-wide `runs.list()` method is unchanged, so current integrations require no
migration.
