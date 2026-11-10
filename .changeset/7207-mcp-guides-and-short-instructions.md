---
'owox': minor
---

**claude.ai and ChatGPT now get the OWOX rules for safe setup and delivery**

When a Data Owner or analyst sets up Data Marts, Credentials or reports through an AI assistant, OWOX gives the assistant rules: ask before a deletion, never take provider secrets in chat, and do not send a report message twice. These rules were in one MCP instructions text of about 27,500 characters. claude.ai did not give that text to the model, ChatGPT gave only its start, and Claude Code its first 4,096 characters, so in these clients the assistant often worked without the rules. Now the shared instructions are short and start with the most important rule, each safety rule is also in the description of the tool that it applies to, and the new `get_owox_guide` tool returns the full workflow for one task. **ChatGPT keeps the tool list from the time when you added the OWOX app: disconnect and reconnect the app to get these changes.**

- `get_owox_guide` topics are `reporting`, `data_mart_setup`, `data_mart_runs`, `credentials`, `storages_destinations` and `custom_connectors`. The tool needs only the `mcp:read` scope and does not read project data.
- `delete_context` now tells the assistant that it can detach Data Marts, Storages and Destinations through MCP before it deletes a Context.

See [`get_owox_guide`](../../docs/getting-started/setup-guide/mcp.md#get_owox_guide) and [how to load new tools](../../docs/getting-started/setup-guide/mcp.md#the-assistant-does-not-see-new-tools-or-tool-rules).

<!-- markdownlint-disable-file MD036 MD041 -->
