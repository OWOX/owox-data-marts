---
'owox': minor
---

# Add MCP tools for managing report run schedules

Let MCP clients (such as AI assistants) manage recurring report runs directly from a conversation, without opening the OWOX UI. The MCP host now exposes four tools: list every report run schedule in the current project (with the trigger id, the report and data mart it belongs to, cron expression, timezone, next run time, and whether the current user may edit or delete it); create a new schedule for a report without replacing existing schedules; update one existing schedule by its trigger id; and delete a schedule by its trigger id while leaving the report itself intact. All actions respect the caller's project and report permissions, and creating, updating, or deleting a schedule requires both the `mcp:read` and `mcp:write` scopes.
