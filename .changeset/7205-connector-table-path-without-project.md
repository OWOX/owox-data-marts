---
'owox': minor
---

**Connector Data Marts set up through MCP no longer fail their first run because of the table path**

**A saved connector Data Mart with a three-part table path now stops its run with a format error. Change the table path to two parts through MCP or the API to run the Data Mart again. The web app cannot change the table path of a saved connector.**

An AI assistant that sets up a connector Data Mart through MCP often gives the table path as `project.dataset.table`. Previously OWOX saved and published this table path. The first run then failed with `Invalid dataset ID`. Now OWOX rejects such a table path when you save it or publish the Data Mart. The error message gives the expected format. The MCP tool description gives the format too, so the assistant can use the correct table path from the start.

- Google BigQuery expects `dataset.table`. The connector always writes to the project of the Storage. The dataset name can contain only letters, digits, and underscores.
- AWS Athena expects `database.table`, without the catalog.

The web app already writes table paths with two parts. Connector Data Marts that you set up in the web app do not change. See [MCP Server](../../docs/getting-started/setup-guide/mcp.md#create-and-publish-a-data-mart).

<!-- markdownlint-disable-file MD041 MD036 -->
