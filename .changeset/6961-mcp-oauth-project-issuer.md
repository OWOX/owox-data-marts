---
'owox': minor
---

**Connect Codex to project-specific MCP URLs**

OAuth clients that verify issuer-bound authorization responses (RFC 9207), including Codex, can
now complete sign-in against project-specific MCP URLs (`https://<project>.mcp.owox.com`). Both
successful and error callbacks from a project-specific URL carry its `iss` value.

After a client's `client_id` and `redirect_uri` are trusted, authorization failures are now sent
back to every MCP client through that redirect URI with the standard `error`, `error_description`,
and `state` parameters. Unexpected internal failures use `server_error`; the underlying cause stays
in the server logs.

See [Connect AI assistants with MCP](../../docs/getting-started/setup-guide/mcp.md) for setup
instructions.
