---
'owox': minor
---

# View-only session restrictions

Authenticated sessions in view-only mode are read-only and do not emit client analytics.

- State-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) return **403** with code `ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE`.
- Safe methods (`GET`, `HEAD`, `OPTIONS`) continue to work as usual.
- Auth context and the current-user payload expose an optional `viewOnly` flag.
- MCP OAuth authorization (`/oauth/authorize`) is rejected for view-only sessions so they cannot mint MCP tokens that would bypass REST restrictions.
- Web client skips GTM bootstrap and dataLayer events (including identify/logout) for these sessions.
