---
'owox': minor
---

**MCP clients can recover from expired OAuth grants**

MCP clients that submit an expired or invalid refresh token or authorization code now receive the
standard `invalid_grant` OAuth error and can restart authorization automatically, instead of
failing with an unexpected server error. C2C authentication failures and Identity Provider
outages remain server errors and are not reported as invalid user grants.

See [Connect AI assistants with MCP](../../docs/getting-started/setup-guide/mcp.md) for setup and
reconnection guidance.
