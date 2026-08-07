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
`runs.start()`, `runs.listForDataMart()`, `runs.get()`, and `runs.cancel()`. These methods enforce the
same access, payload, pagination, and response contracts as the service API.
