---
'owox': minor
---

**Start an OWOX task from the claude.ai connector menu with its rules attached**

claude.ai does not give the AI model the instructions of an MCP server. So when an analyst or a Data Owner starts a report or a Data Mart setup in claude.ai, the model gets the OWOX workflow rules only if it calls `get_owox_guide` itself. Now the OWOX connector adds **Add from OWOX Data Marts** to the connector menu of claude.ai and Claude Desktop. Select a task there. For a report, a Data Mart setup or a check of runs, the matching guide goes into the conversation with your request.

- Prompts: **Explore my data**, **Create a report**, **Set up a Data Mart** and **Check Data Mart runs**. In Claude Code, they are slash commands.
- Resources: the six OWOX workflow guides at `owox://guides/<topic>` and a link to the MCP documentation. In Claude Code, you attach them with `@`.
- ChatGPT has no menu for prompts or resources, so nothing changes in ChatGPT.

See [Prompts and guides in the connector menu](../../docs/getting-started/setup-guide/mcp.md#prompts-and-guides-in-the-connector-menu).

<!-- markdownlint-disable-file MD036 MD041 -->
