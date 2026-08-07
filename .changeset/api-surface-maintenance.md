---
'owox': minor
---

# Low-level API client transport methods

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
