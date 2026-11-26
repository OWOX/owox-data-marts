---
'owox': minor
---

**Start in OWOX Cloud without a data warehouse: OWOX Storage**

A marketer or analyst who started in OWOX Cloud without a data warehouse could not create a single Data Mart. First they had to set up a warehouse, a cloud project, billing and a key somewhere else. Now they create an OWOX Storage, a storage that OWOX hosts, and their connectors load data into it with no setup of their own. SQL Data Marts, reports, HTTP Data and MCP then work as they do on any other Storage.

- Pick the location, `US` or `EU`, when you create it. The location cannot change later, and a project can have one OWOX Storage in each location.
- **Usage and Tables** on the storage shows the space used of its 100 GiB limit and its tables with their sizes. Delete a table to free space.
- SQL Data Marts on an OWOX Storage run `SELECT` queries only and name each table in full: `<Project ID>.<Dataset>.<table>`. The OWOX Storages of a project can scan up to 100 GiB of data a day together.
- An AI agent connected over MCP offers OWOX Storage to a user who has no Storage and creates it with `create_owox_storage`. Agents cannot delete an OWOX Storage, because its deletion also deletes its data.
- OWOX Storage is a public preview in OWOX Cloud only, with the same limits on every plan. Self-managed deployments leave the new `OWOX_STORAGE_ENGINE` and `OWOX_STORAGE_STORAGE_LIMIT_GIB` variables empty and see no change.
- **Custom connectors cannot declare the parameters `ImpersonateServiceAccount` and `DestinationDatasetExists` any more, because OWOX sets them.**

See [OWOX Storage](../../docs/storages/supported-storages/owox-storage.md) and [MCP](../../docs/getting-started/setup-guide/mcp.md).

<!-- markdownlint-disable-file MD041 MD036 -->
