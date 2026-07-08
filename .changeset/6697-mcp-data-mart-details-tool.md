---
"owox": minor
---

# Add a get_data_mart_details_by_id MCP tool

AI assistants connected to OWOX over MCP can now inspect a selected Data Mart's metadata before querying it. The tool returns the Data Mart id, name, description, and available output schema fields, so the assistant can use exact field names instead of guessing when preparing `query_data_mart` calls.

Only Data Marts the current project member can access are returned. The tool does not query actual data rows, sample values, owners, or freshness details.
