---
'owox': minor
---

**Give each join a distinct Output Alias through MCP**

The report column picker can show the same **Output Alias** for different joins to the same Data Mart. Previously, you had to switch to the OWOX Data Marts web interface to change it. Your AI assistant can now use MCP to give each join a distinct name and set the **Alias** for individual fields.

`get_data_mart_setup` returns the saved settings for direct and nested joins in `blended_fields_config` on the root Data Mart. `update_data_mart_blended_fields_config` replaces those settings. Include all overrides you want to keep, or send `null` to clear them all.

See [Data Mart setup through MCP](../../docs/getting-started/setup-guide/mcp.md#data-mart-setup-models-and-execution).

<!-- markdownlint-disable-file MD041 MD036 -->
