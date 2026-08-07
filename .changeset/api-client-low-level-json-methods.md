---
'@owox/api-client': minor
'@owox/plugin-sdk': minor
'@owox/web': minor
'owox': minor
---

# Add safe low-level JSON methods for API clients and plugins

API-key clients can now use `patchJson()` and `deleteJson()` alongside the existing
low-level JSON and stream methods for API-key-compatible endpoints that do not yet have
typed resources. These methods accept only root-relative `/api/...` paths and refuse
unsafe paths and redirects, so credentials cannot be sent to an unintended destination.

Plugin SDK protocol v2 adds the same PATCH and DELETE capabilities through `ctx.owox`.
The web host securely negotiates and serves protocol v2 while remaining compatible with
existing protocol-v1 plugins. Returned low-level JSON remains caller-validated at runtime.
