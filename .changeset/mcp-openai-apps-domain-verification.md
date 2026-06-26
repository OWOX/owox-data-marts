---
"owox": minor
---

# Add OpenAI Apps domain-verification endpoint for the MCP host

Serve the OpenAI Apps verification token as `text/plain` (HTTP 200) at the origin-root well-known path `GET /.well-known/openai-apps-challenge`, so the OWOX MCP server can pass OpenAI's domain verification during app submission. The endpoint is public (no auth, served at the host root rather than under `/api`) and returns 404 until the token is configured via the new `MCP_OPENAI_APPS_CHALLENGE_TOKEN` environment variable.
