---
"owox": minor
---

# Add project-based MCP server URLs

OWOX MCP now supports project-specific server URLs in the form
`https://{projectId}.mcp.owox.com/mcp` alongside the existing shared
`https://mcp.owox.com/mcp` server.

Shared MCP connections keep the existing project-selection flow. Project-specific
connections derive the project from the MCP host, skip project selection, and still
verify that the authenticated user has access to that project before issuing MCP
tokens.

Project settings now show the project-specific MCP URL with copy support for users
who need separate custom MCP servers for multiple projects.
