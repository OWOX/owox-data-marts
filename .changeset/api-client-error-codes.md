---
'@owox/backend': patch
'@owox/api-client': patch
---

Carry a machine-readable error code through the backend exception filter

`BusinessViolationException` accepts an optional `code`, and the filter serializes it, so
clients can branch on a stable identifier instead of matching human-readable message text.
Exceptions that set no code keep their existing response shape.

`@owox/api-client` now also reads the backend's `errorDetails` envelope, so
`error.details` carries the payload directly rather than the whole response body.
