---
'owox': minor
---

# Give MCP assistants the complete project context

MCP clients now receive the full project description through `get_project_context`, together with the current project metadata. Assistants are instructed to call the tool before their first project-specific operation, while the always-on MCP initialization instructions remain focused on OWOX workflows, security, and tool usage.

Project descriptions continue to support up to 10,000 characters and are returned without truncation. After an admin updates the description, the new value is available on the next `get_project_context` call without reconnecting the MCP client.
