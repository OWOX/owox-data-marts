# MCP Server

OWOX Data Marts exposes a Model Context Protocol (MCP) server that lets AI assistants and MCP-compatible clients connect to your project data using standard OAuth authorization.

Use the MCP server when you want an AI assistant — such as Claude or ChatGPT — to explore the [data marts](../core-concepts.md) in your OWOX project in plain language, without leaving the assistant. The assistant can tell you which project you are connected to, list the data marts available to you, and show field-level metadata for a selected data mart. See [Available tools](#available-tools) for exactly what it can and cannot do.

## Prerequisites

- An active OWOX Data Marts project with at least one data mart. New to Data Marts? See how to create a [connector-based](./connector-data-mart.md) or [SQL-based](./sql-data-mart.md) Data Mart.
- One of the supported clients: Claude Desktop, Claude web (claude.ai), or ChatGPT. Any other client that supports the MCP Streamable HTTP transport with OAuth 2.0 will also work.
- A client plan that allows custom MCP connectors. Adding a custom MCP server like OWOX may require a paid plan in Claude or ChatGPT; check your client's current plan requirements.

## Step 1: Connect your AI assistant

Set up whichever assistant you use — you only need one. The client discovers the OAuth endpoints and registers itself automatically: there is no client ID, secret, or token to copy.

### Claude Desktop

Newer versions of Claude Desktop add remote MCP servers through the in-app **Connectors** settings:

1. Open Claude Desktop and go to **Settings → Connectors**.
2. Click **Add custom connector**.
3. Enter the MCP server URL:

   ```text
   https://mcp.owox.com/mcp
   ```

4. Claude opens a browser window to complete authorization. Follow the steps in [Step 2](#step-2-authorize-access).

If your version does not show a **Connectors** screen, add the server to the configuration file instead:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the `owox` entry to your existing `mcpServers` (create the file if it does not exist yet — keep any servers already listed):

```json
{
  "mcpServers": {
    "owox": {
      "url": "https://mcp.owox.com/mcp"
    }
  }
}
```

Save the file and restart Claude Desktop. On restart, Claude detects the server and opens a browser window to authorize it. Follow the steps in [Step 2](#step-2-authorize-access).

### Claude web (claude.ai)

1. Open [claude.ai](https://claude.ai) and go to **Settings → Connectors**.
2. Click **Add custom connector**.
3. Enter the MCP server URL:

   ```text
   https://mcp.owox.com/mcp
   ```

4. Claude will open an authorization flow in the same browser. Follow the steps in [Step 2](#step-2-authorize-access).

![Claude web Connectors settings with the Add custom integration dialog and the OWOX MCP server URL entered](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/fbdcb18c-4d48-4142-8ee0-a913734a4100/public)

![The OWOX integration connected and listed in Claude web Connectors settings](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4521c763-a151-453c-18a7-006ff6536200/public)

### ChatGPT

1. Open ChatGPT and go to **Settings → Apps**.
2. Open **Advanced settings** and turn on **Developer mode**. A **Create app** button appears.
3. Click **Create app**.
4. Enter the MCP server URL:

   ```text
   https://mcp.owox.com/mcp
   ```

5. ChatGPT opens an authorization window. Follow the steps in [Step 2](#step-2-authorize-access).

![Enabling Developer mode in ChatGPT Apps advanced settings](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/08e99f82-13b4-4e3a-0d01-819105aba800/public)

![Creating an app with the OWOX MCP server URL in ChatGPT](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/323a0e41-8043-435c-b6c2-d84dde4d1b00/public)

## Step 2: Authorize access

When the MCP client connects for the first time, it opens a browser window to complete the OAuth 2.0 authorization flow. You only complete two interactive steps:

1. **Sign in** to your OWOX account if you do not already have an active session.
2. **Select a project** — if you belong to more than one project, a selection screen appears. Choose the project you want this MCP connection to use and click **Next**. If you belong to a single project, this step is skipped automatically.

There is no separate permissions-consent screen. Once you sign in and select a project, the client receives an access token and uses it automatically for all subsequent requests. The token is bound to the project you selected and to the requested scope.

Access tokens are short-lived, and the client refreshes them automatically in the background — you stay connected without signing in again. You only need to reconnect manually if the refresh fails (for example, after your OWOX session is revoked) or when you want to switch projects.

## Step 3: Verify the connection

Confirm everything works before relying on it. In your assistant, send:

> Which OWOX project am I connected to?

The assistant calls the `get_project_context` tool and replies with your project title, your role, and the project status. If you see your project name, the connection is working. If instead you get an authorization or "no tools available" error, see [Troubleshooting](#troubleshooting).

## Switch projects or disconnect

Project selection is fixed when you authorize, so switching projects means reconnecting. Where you manage the connection depends on the client:

- **Claude Desktop / Claude web:** **Settings → Connectors**, then open the OWOX connector to disconnect or reconnect it.
- **ChatGPT:** **Settings → Apps**, then open the OWOX app to disconnect or reconnect it.

To switch projects, disconnect, then reconnect and sign in again, choosing the project you want during authorization.

## Available tools

Once connected, the MCP server exposes six tools, all requesting the `mcp:read` scope during authorization. Five are read-only metadata tools; `query_data_mart` additionally queries a data mart's data — it returns data rows, records each call in Run History, and costs [credits](../billing/consumption-units.md) per call.

### `get_project_context`

Returns information about the OWOX project that this MCP connection is authorized for.

**Returns:**

| Field                        | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `current_project.id`         | Project identifier                                |
| `current_project.title`      | Project display name                              |
| `current_project.status`     | Project status                                    |
| `current_project.roles`      | Your roles in this project                        |
| `current_project.created_at` | Project creation date                             |
| `project_switching`          | Instructions for switching to a different project |

Use this tool when you need to confirm which project is active, or when the assistant asks which project is selected.

### `list_data_marts`

Lists all data marts visible to you in the current project.

**Returns** an array of data mart objects:

| Field         | Description           |
| ------------- | --------------------- |
| `id`          | Data mart identifier  |
| `title`       | Data mart name        |
| `description` | Data mart description |
| `status`      | Current status        |
| `updated_at`  | Last update timestamp |

Use this tool to discover available data marts before running queries or building reports.

The list reflects your access: it includes only the data marts your [project role](../../project/roles-and-permissions.md) permits you to see. If a data mart you expect is missing, check your role in that project.

### `get_relevant_data_marts_by_prompt`

Finds the data marts most relevant to a natural-language question, ranked by relevance. Use it to discover which data marts can answer a specific question without listing the whole project.

**Input:**

| Field    | Description                        |
| -------- | ---------------------------------- |
| `prompt` | Natural-language search prompt     |
| `limit`  | Optional maximum number of results |

**Returns** an array of matching data mart objects:

| Field             | Description                                     |
| ----------------- | ----------------------------------------------- |
| `id`              | Data mart identifier                            |
| `title`           | Data mart name                                  |
| `description`     | Data mart description                           |
| `url`             | Link to open the data mart in OWOX Data Marts   |
| `relevance_score` | How closely the data mart matches your question |

Only non-draft data marts visible to your [project role](../../project/roles-and-permissions.md) are returned.

### `get_data_mart_details_by_id`

Returns field-level metadata for one data mart visible to you in the current project.

**Input:**

| Field          | Description                                                                               |
| -------------- | ----------------------------------------------------------------------------------------- |
| `data_mart_id` | Data mart identifier returned by `list_data_marts` or `get_relevant_data_marts_by_prompt` |

**Returns:**

| Field           | Description                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | Data mart identifier                                                                                                                                                                       |
| `name`          | Data mart name                                                                                                                                                                             |
| `description`   | Data mart description                                                                                                                                                                      |
| `fields`        | The data mart's own (native) output fields with names, types, descriptions, and business names when available                                                                              |
| `joined_fields` | Fields contributed by blended/joined data marts (empty when the data mart has no joins), each with its qualified `<alias>__<field>` name, source data mart, type, and allowed aggregations |

Use this tool when you need to understand the fields available in a specific data mart — both its native fields and any joined fields you can then query with `query_data_mart`. It does not return sample values, data freshness, owners, or actual data rows.

### `query_data_mart`

Runs a query against one data mart and returns its data rows, plus server-side totals computed over all matching rows. Unlike the tools above, this reads the data itself — **each call runs against your warehouse and costs [credits](../billing/consumption-units.md)**, and every call is recorded in Run History (the query definition and executed SQL only — never row values).

**Input:**

| Field          | Description                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data_mart_id` | Data mart to query                                                                                                                                                                                                                                                           |
| `fields`       | Exact field names to return, copied from `get_data_mart_details_by_id`. Must include every field used in `aggregations` and `date_buckets`. Reference blended fields by their qualified `<alias>__<field>` name                                                              |
| `aggregations` | Aggregations over a field: `SUM`, `COUNT`, `COUNT_DISTINCT`, `AVG`, `MIN`, `MAX`, and percentiles `P25`/`P50`/`P75`/`P95`. Each data mart's output controls decide which functions a field allows, so some may be rejected. Group-by is implied by the non-aggregated fields |
| `date_buckets` | Bucket a date/timestamp field by `DAY`/`WEEK`/`MONTH`/`QUARTER`/`YEAR`                                                                                                                                                                                                       |
| `slices`       | Pre-join filters — narrow a joined data mart before it is blended in (joined fields only)                                                                                                                                                                                    |
| `filters`      | Post-join filters on the blended result. Row-level predicates applied to raw values before any aggregation — there is no `HAVING`, so they cannot threshold an aggregated total                                                                                              |
| `limit`        | Maximum rows to return (1–1000, default 20). There is no pagination                                                                                                                                                                                                          |

**Returns:**

| Field           | Description                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns`       | Column names in the result. When `aggregations` are used, an extra `Row Count` column (the number of underlying rows per group) is appended |
| `rows`          | The data rows, as a compact header-once table                                                                                               |
| `returned_rows` | Number of rows in the response                                                                                                              |
| `truncated`     | `true` if not all matching rows were returned — narrow the query or raise `limit`                                                           |
| `totals`        | Server-side totals over all matching rows, ignoring the row limit                                                                           |

Only data marts and fields your [project role](../../project/roles-and-permissions.md) permits are queryable.

### `list_destinations`

Lists the destinations in the current project — such as Google Sheets, Looker Studio, or messaging destinations — so the assistant knows where a report could be sent.

**Returns** an array of destination objects:

| Field   | Description                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------- |
| `id`    | Destination identifier                                                                                    |
| `name`  | Destination name                                                                                          |
| `type`  | Destination type (for example `google_sheets`, `looker_studio`, `slack`, `email`, `teams`, `google_chat`) |
| `owner` | The user who created the destination                                                                      |

The list reflects your access: it includes only the destinations your [project role](../../project/roles-and-permissions.md) permits you to use.

## How to use it: example prompts

Once the OWOX server is connected, just ask your assistant in plain language. You do not need to name the tools — the assistant calls them for you. Try prompts like:

- "Which OWOX project am I connected to, and what is my role in it?"
- "List all the data marts in my project."
- "Which of my data marts were updated most recently?"
- "Do I have any data marts about Facebook Ads? Show their descriptions."
- "What fields are available in the Facebook Ads data mart?"
- "Give me a one-line summary of each data mart and what it is for."
- "What's the total revenue by month in the Sales data mart?"
- "Show the top campaigns by spend in the Ads data mart."
- "Which destinations can I send a report to?"

> **What these tools can and cannot do:** They let the assistant discover your project, your data marts (titles, descriptions, status, when each was last updated, and field-level metadata for a selected data mart), and the destinations available for reports — and, with `query_data_mart`, run a bounded query and read the resulting data rows and totals. They do **not** create or change anything, and they cannot run arbitrary SQL — only structured queries built from the fields, filters, and aggregations described above.
>
> **What is shared with your AI provider:** To answer your prompts, data-mart metadata (project and data-mart names, descriptions, status, fields, and your roles) is sent to the AI provider behind your client, such as Anthropic for Claude or OpenAI for ChatGPT. In addition, whenever the assistant runs `query_data_mart`, the **resulting data rows and totals are sent** to that provider so it can answer with the data — only data you are permitted to query. Connect OWOX only to clients your organization permits to receive this information.

## Troubleshooting

### Requests return 401 Unauthorized

The MCP server rejects a request with `401` in these cases. Your AI client may surface these as a generic "couldn't connect" or "authorization expired" message rather than the exact text below:

| Message                                                     | Cause                                                           | Fix                                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Missing MCP bearer token`                                  | No `Authorization: Bearer` header was sent.                     | Re-run authorization so the client obtains a token. A `GET /mcp` without a token (a client probe) is expected and harmless. |
| `Invalid MCP bearer token`                                  | The token is expired, revoked, or invalid.                      | Disconnect and reconnect the MCP server to obtain a fresh token.                                                            |
| `Invalid MCP resource`                                      | The token was issued for a different resource than this server. | Confirm the client points to the correct `/mcp` URL, then reconnect.                                                        |
| `Missing MCP project context` / `Missing MCP project roles` | The token has no project selected or no active role in it.      | Reconnect and make sure you select a project where you are an active member.                                                |

### The wrong project is connected

Project selection is fixed at authorization time. See [Switch projects or disconnect](#switch-projects-or-disconnect) for how to reconnect and choose a different project.

### A `query_data_mart` call fails

If the assistant reports that the project is out of credits, `query_data_mart` has hit its credit limit — upgrade the plan to keep querying (the read-only tools keep working). If it says a field wasn't found, it likely guessed a field name; ask it to check the data mart's fields first with `get_data_mart_details_by_id`, then re-run the query.

## Related docs

- [Roles and permissions](../../project/roles-and-permissions.md)
- [API Keys](../../api/api-keys.md)
