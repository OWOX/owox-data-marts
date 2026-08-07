---
'@owox/api-client': minor
'@owox/plugin-sdk': minor
'@owox/web': minor
'owox': minor
---

# Low-level API client transport methods

API-key clients can now use `patchJson()` and `deleteJson()` alongside
`getJson()`, `postJson()`, `putJson()`, and `getStream()` for API-key-compatible
endpoints that do not yet have typed resource abstractions. Authenticated
low-level requests accept only root-relative `/api/...` paths up to 2,048
characters and refuse unsafe paths and redirects, preventing credentials from
being sent to an unintended destination.

Plugin SDK protocol v2 adds PATCH and DELETE through `ctx.owox`. The web host
negotiates protocol v2 while remaining compatible with existing protocol-v1
plugins, which continue to support only their original methods. Low-level JSON
return values are caller-typed and are not runtime-validated; consumers should
prefer typed resource abstractions when available.
