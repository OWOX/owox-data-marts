---
'owox': minor
---

**Find reports from search**

**Self-hosted upgrades: stop the previous application and its background workers before starting this version. Running both versions together can leave report search results outdated.**

**API client users: update the OWOX API client or explicitly filter by supported `entityTypes`. Unfiltered search results now include `REPORT`.**

Find reports alongside Data Marts, storages, and destinations. Search by full words or the beginning of a word, with report names ranked highest. Each result shows its Data Mart and destination and opens the report directly. Results respect access to both the Data Mart and destination. Watch the search-to-report flow:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/eac0d3867887ef1b3648c93a966e0e36/iframe>

Existing reports become searchable automatically, and results stay up to date as reports, Data Marts, and destinations change. Report search is also available through the [API client](../../docs/api/api-client.md#search-project-entities) and [MCP for AI assistants](../../docs/getting-started/setup-guide/mcp.md#get_relevant_reports_by_prompt).

<!-- markdownlint-disable-file MD041 MD036 -->
