---
'owox': minor
---

# Return a proper OAuth error for expired MCP refresh tokens

MCP clients that reconnect with an expired or invalid refresh token now receive a standard
`invalid_grant` OAuth error and can restart authorization automatically, instead of failing with an
unexpected server error.
