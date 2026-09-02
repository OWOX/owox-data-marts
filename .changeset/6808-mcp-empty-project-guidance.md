---
'owox': minor
---

# MCP: guidance for projects without Data Marts

When a project has no published Data Mart visible to the connected user, the MCP discovery tools (`list_data_marts`, `get_relevant_data_marts_by_prompt`, and `summarize_data_catalog`) now return `getting_started` instead of a bare empty list: a link to create the first Data Mart in OWOX Data Marts, the setup guides, the user's draft Data Marts that still need publishing, and instructions the assistant relays to the user. The guidance depends on the user's role: Project Admins and Technical Users are walked through creating and publishing a Data Mart, while Business Users are advised to ask them for one.

The MCP system instructions tell the assistant to stop rephrasing searches or querying data in that case and to explain what to do next in the web app instead, so a new user hears where to start rather than "no data found".
