# MCP Server

OWOX Data Marts exposes a Model Context Protocol (MCP) server that lets AI assistants and MCP-compatible clients connect to your project data using standard OAuth authorization.

Use the MCP server when you want an AI assistant — such as Claude or ChatGPT — to explore the [data marts](../core-concepts.md) in your OWOX project in plain language, without leaving the assistant. The assistant can summarize the available catalog, inspect data mart fields, run bounded queries, list destinations and reports, set up report delivery, manage report schedules, and start report runs for supported push destinations. See [Available tools](#available-tools) for exactly what it can and cannot do.

## Prerequisites

- An active OWOX Data Marts project with at least one data mart. New to Data Marts? See how to create a [connector-based](./connector-data-mart.md) or [SQL-based](./sql-data-mart.md) Data Mart.
- One of the supported clients: Claude Desktop, Claude web (claude.ai), or ChatGPT. Any other client that supports the MCP Streamable HTTP transport with OAuth 2.0 will also work.
- A client plan that allows MCP connectors. Adding an MCP server like OWOX may require a paid plan in Claude or ChatGPT; check your client's current plan requirements.

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

1. Open ChatGPT and go to **Plugins**.
2. Find **OWOX Data Marts** in the list of plugins and click **Install plugin**.
3. Click **Sign in with OWOX Data Marts**. ChatGPT opens an authorization window. Follow the steps in [Step 2](#step-2-authorize-access).
4. You will see **OWOX Data Marts is installed**, indicating the integration is connected.
5. Click **Try in chat**.
6. In a new chat, select or enable the OWOX plugin if ChatGPT does not use it automatically.

![ChatGPT Plugins settings showing the OWOX Data Marts plugin ready to connect](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/df3ecfbb-1c59-423c-06ad-bf16261e9500/public)

![ChatGPT authorization screen with the Sign in with OWOX Data Marts button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/bf383601-ad2b-4870-3703-b78dd49fdf00/public)

![ChatGPT chat composer with the OWOX Data Marts plugin available for a new chat](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/55bbd278-3784-40b0-fe98-4a16d1006c00/public)

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

Once connected, the MCP server exposes eighteen tools across two scopes:

- **`mcp:read`**: discovery and status tools — `summarize_data_catalog`, `get_project_context`, `list_data_marts`, `get_relevant_data_marts_by_prompt`, `get_data_mart_details_by_id`, `list_destinations`, `get_data_mart_reports`, `list_report_run_schedules`, `get_report_run_status`.
- **`mcp:write`**: tools that create, change, run, or bill something — `query_data_mart`, `add_destination`, `add_report`, `update_report`, `delete_report`, `create_report_run_schedule`, `update_report_run_schedule`, `delete_report_run_schedule`, `run_report`. `query_data_mart` and the report-run schedule mutation tools also require `mcp:read`. `query_data_mart` reads data rows, records each call in Run History, and costs [credits](../billing/consumption-units.md) per call. Your MCP client may ask you to confirm before it calls one of these.

### `summarize_data_catalog`

Returns a high-level summary of the published data mart catalog available to this MCP connection. It helps the assistant answer broad orientation questions like "What data is available here?" or "Where should I start?" without querying actual data rows.

**Returns:**

| Field                                  | Description                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `project_id`                           | Project identifier                                                          |
| `data_mart_count`                      | Number of published data marts visible to you                               |
| `top_data_marts_by_connectivity`       | Data marts ranked by configured relationship connectivity                   |

Each `top_data_marts_by_connectivity` item includes `id`, `title`, `description`, `url`, `relationship_count`, `reports_count`, `triggers_count`, and `updated_at`.

Use this tool when the user asks what can be analyzed in the project. It does not return sample values, data freshness, row counts, or any actual data rows.

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
| `id`          | Data mart identifier                          |
| `title`       | Data mart name                                |
| `description` | Data mart description                         |
| `url`         | Link to open the data mart in OWOX Data Marts |
| `status`      | Current status                                |
| `updated_at`  | Last update timestamp                         |

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

Use this tool when you need to understand the fields available in a specific data mart — both its native fields and any joined fields you can then query with `query_data_mart`. It does not return sample values, data freshness, owners, or actual data rows. To learn how joined/blended fields are set up, see [Joinable Data Marts](./joinable-data-marts.md).

### `query_data_mart` (requires `mcp:read` and `mcp:write`)

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

Only data marts and fields your [project role](../../project/roles-and-permissions.md) permits are queryable. For more on how aggregations and totals are computed, see [Report Aggregations and Totals](./report-aggregations.md); for why a given aggregation may be rejected on a field, see [Report Output Controls](./output-controls.md).

### `list_destinations`

Lists the destinations in the current project — such as Google Sheets, Looker Studio, or messaging destinations — so the assistant knows where a report could be sent.

**Returns** an array of destination objects:

| Field                    | Description                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`                     | Destination identifier                                                                                    |
| `name`                   | Destination name                                                                                          |
| `type`                   | Destination type (for example `google_sheets`, `looker_studio`, `slack`, `email`, `teams`, `google_chat`) |
| `owner`                  | The user who created the destination                                                                      |
| `connectedGoogleAccount` | For Google Sheets destinations, the Google account that completed OAuth consent                           |
| `createdAt`              | Destination creation timestamp                                                                            |

The list reflects your access: it includes only the destinations your [project role](../../project/roles-and-permissions.md) permits you to use. If you are identifying a Google Sheets destination just created through `add_destination`, match by `connectedGoogleAccount`, not by `createdAt` or "newest" — someone else can create a destination at the same time. To add or manage destinations, see [Destination Management](../../destinations/manage-destinations.md).

### `add_destination` (requires `mcp:write`)

Starts or completes setup for a report-delivery destination. The exact flow depends on `destination_type`.

**Input:**

| Field              | Description                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destination_type` | Destination type to connect or create: `google_sheets`, `looker_studio`, `email`, `slack`, `teams`, or `google_chat`                                             |
| `title`            | Optional destination name. Applies to `email`, `slack`, `teams`, `google_chat`, and `looker_studio`; Google Sheets names are entered in the browser setup form    |
| `emails`           | Required for `email`, `slack`, `teams`, and `google_chat`; target email addresses or delivery addresses for the destination                                      |

**Returns:**

| Field               | Description                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `authorization_url` | For `google_sheets`, a link to the OWOX "Connect Google Sheets" page where the user completes Google OAuth                 |
| `destination_id`    | New destination identifier. Returned for `looker_studio`, `email`, `slack`, `teams`, and `google_chat`; absent for Google Sheets until setup is completed |
| `instructions`      | Human-readable next steps for finishing setup or using the new destination                                                  |

For `google_sheets`, this tool does not create the destination immediately. It returns a project-scoped setup link; the user opens it, signs in to OWOX if needed, clicks **Connect with Google**, and approves Google access. After the user confirms setup is complete, call `list_destinations` and match the new Google Sheets destination by `connectedGoogleAccount`. The created destination is usable by the person who connected it, but it starts unshared for other project members until someone shares it in the UI.

For `email`, `slack`, `teams`, and `google_chat`, the tool creates the destination directly and returns `destination_id`. For `looker_studio`, the tool also creates the destination directly, but it never sends connector credentials or secret keys through MCP/chat; the user opens the destination in OWOX Data Marts to copy those credentials.

### `get_data_mart_reports`

Lists the reports tied to a data mart, including each report's destination, its run schedules (a report can have any number of schedule triggers), and its last run status.

**Input:**

| Field          | Description           |
| -------------- | ---------------------- |
| `data_mart_id` | Data mart identifier   |

**Returns** an array of report objects:

| Field              | Description                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `report_id`         | Report identifier                                                      |
| `data_mart_id`      | Data mart identifier                                                   |
| `name`              | Report name                                                            |
| `destination_id`    | Destination the report exports to                                      |
| `destination_type`  | Destination type (for example `google_sheets`)                        |
| `owner`             | The user who created the report                                       |
| `schedules`         | Array of run schedules — `trigger_id`, `cron_expression`, `time_zone`, `is_active`, `next_run_at`, `last_run_at` |
| `last_run_at`       | Timestamp of the most recent run                                      |
| `last_run_status`   | Status of the most recent run                                         |

Use this tool before scheduling or changing a report's cadence, to see what already exists.

### `run_report` (requires `mcp:write`)

Starts an existing report run and delivers fresh data to its push destination. This returns immediately with identifiers for the run; it does not wait for completion. Each call starts a new billed Report Run, so do not call it again for the same report while the previous run is still running or pending.

**Input:**

| Field       | Description                                      |
| ----------- | ------------------------------------------------ |
| `report_id` | Report to run, from `get_data_mart_reports`      |

**Returns:**

| Field       | Description                                      |
| ----------- | ------------------------------------------------ |
| `report_id` | Report identifier                                |
| `run_id`    | Run identifier to pass to `get_report_run_status` |

Use this tool for push destinations such as Google Sheets, Email, Slack, Microsoft Teams, and Google Chat. Pull-based destinations such as Looker Studio cannot be run through `run_report`.

### `get_report_run_status`

Checks the current status of a report run started with `run_report`.

**Input:**

| Field       | Description                         |
| ----------- | ----------------------------------- |
| `report_id` | Report identifier                   |
| `run_id`    | Run identifier returned by `run_report` |

**Returns:**

| Field         | Description                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `report_id`   | Report identifier                                                                                                |
| `run_id`      | Run identifier                                                                                                   |
| `status`      | Normalized status: `running`, `success`, `failed`, `cancelled`, `interrupted`, or `restricted`                   |
| `should_poll` | `true` when the assistant should keep checking this run; `false` when polling should stop                        |
| `stop_reason` | `queued_too_long`, `running_too_long`, or `null`                                                                 |
| `queued_at`   | Timestamp when the run was queued, if available                                                                  |
| `started_at`  | Timestamp when execution started, if available                                                                   |
| `raw_status`  | Backend run status                                                                                               |
| `error`       | Error message for failed runs, otherwise `null`                                                                  |
| `message`     | Polling guidance for the assistant, including when a run is taking longer than usual or may be stuck              |

Report runs can take several minutes. While `should_poll` is `true`, the assistant should call `get_report_run_status` again, ideally waiting about 15 seconds between checks if the client supports waiting.

### `list_report_run_schedules`

Lists every scheduled report-run trigger in the current project that you can see, in a single response.

**Returns** an array of schedule objects:

| Field             | Description                                                          |
| ------------------ | ---------------------------------------------------------------------- |
| `trigger_id`        | Schedule identifier — pass to `update_report_run_schedule` or `delete_report_run_schedule` |
| `report`            | The report this schedule belongs to (`id`, `title`)                  |
| `data_mart`         | The data mart the report is built on (`id`, `title`)                 |
| `cron_expression`   | Schedule in 5-field cron syntax                                      |
| `time_zone`         | IANA timezone the cron expression is evaluated in                    |
| `is_active`         | Whether the schedule is currently enabled                            |
| `next_run_at`       | Next scheduled run, if any                                           |
| `last_run_at`       | Last run, if any                                                     |
| `can_edit`          | Whether you can update this schedule                                 |
| `can_delete`        | Whether you can delete this schedule                                 |

Use this tool to find a schedule's `trigger_id` before updating or deleting it. Creating a new schedule (`create_report_run_schedule`) never replaces an existing one — a report can have several. These schedules are the same report triggers you can manage in the UI — see [Report Triggers](./report-triggers.md).

### `create_report_run_schedule` (requires `mcp:read` and `mcp:write`)

Adds a new recurring run schedule to an existing report. The assistant translates natural language (for example "every Monday at 9am") into a standard 5-field cron expression before calling this tool.

**Input:**

| Field              | Description                                                                          |
| ------------------- | --------------------------------------------------------------------------------------- |
| `report_id`          | Report to attach the schedule to                                                      |
| `cron_expression`    | 5-field cron expression                                                                |
| `time_zone`          | Optional IANA timezone (for example `Europe/Kyiv`); defaults to UTC if not specified   |
| `is_active`          | Optional; defaults to `true`                                                           |

**Returns:** `trigger_id`, `report_id`, `cron_expression`, `time_zone`, `is_active`, `next_run_at`.

This always creates an additional schedule — it never replaces or updates an existing one. To change an existing schedule, use `update_report_run_schedule` instead.

### `update_report_run_schedule` (requires `mcp:read` and `mcp:write`)

Updates one existing schedule identified by `trigger_id` (from `list_report_run_schedules`).

**Input:**

| Field              | Description                                                                   |
| ------------------- | --------------------------------------------------------------------------------- |
| `trigger_id`         | Schedule to update                                                              |
| `cron_expression`    | New 5-field cron expression                                                    |
| `time_zone`          | Optional; omit to keep the schedule's current timezone                         |
| `is_active`          | Optional; omit to keep the schedule's current active state                     |

**Returns:** `trigger_id`, `report_id`, `cron_expression`, `time_zone`, `is_active`, `next_run_at`.

This changes the schedule's cadence in place — it does not change which report it belongs to and does not create another schedule.

### `delete_report_run_schedule` (requires `mcp:read` and `mcp:write`)

Removes a single schedule identified by `trigger_id`. This is destructive and cannot be undone from the assistant.

**Input:**

| Field         | Description        |
| -------------- | -------------------- |
| `trigger_id`    | Schedule to remove  |

**Returns:** `trigger_id`, `report_id`, and `schedule: null` to confirm removal. Only that one schedule is removed — the report and any other schedules it has are left intact.

### `add_report` (requires `mcp:write`)

Creates a report that exports a data mart to a Google Sheets destination. A new Google Sheet is created automatically and linked to the report.

Unlike every other tool, this one reaches outside OWOX: it creates a file in Google Drive and attempts to share it with you. It needs a Google Sheets destination to already exist in the project — see [Google Sheets destination](../../destinations/supported-destinations/google-sheets.md) for how to set one up.

**Input:**

| Field             | Description                                                          |
| ------------------ | ------------------------------------------------------------------------ |
| `data_mart_id`      | Data mart to export                                                    |
| `destination_id`    | A **Google Sheets** destination to export to (from `list_destinations`). Other destination types are rejected — a new Sheet is always created under a Google Sheets destination |
| `fields`            | Exact column names to include, or `["*"]` for every field              |
| `name`              | Report name                                                            |

**Returns:**

| Field                     | Description                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `report_id`                 | Report identifier                                                                                  |
| `report_url`                | Link to the report in OWOX Data Marts                                                              |
| `sheet_url`                 | Link to the created Google Sheet                                                                    |
| `owner`                     | The user who created the report                                                                    |
| `status`                    | `created`                                                                                           |
| `placed_in_root`            | `true` if the configured Drive folder could not be used, so the sheet was created in the Drive root |
| `shared_with_requester`     | `false` if the sheet could not be shared with you — opening the link may require requesting access  |

### `update_report` (requires `mcp:write`)

Updates an existing report: renames it and/or replaces which data mart fields it exports. Anything not provided stays unchanged — the destination, filters, sorting, owners, and schedules are preserved as-is.

**Input:**

| Field       | Description                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| `report_id` | Report to update (from `get_data_mart_reports`)                                   |
| `fields`    | Optional. Replacement column selection, or `["*"]` for every field                |
| `name`      | Optional. New report name                                                          |

At least one of `fields` / `name` must be provided.

**Returns:**

| Field       | Description        |
| ----------- | ------------------ |
| `report_id` | Report identifier  |
| `status`    | `updated`          |

### `delete_report` (requires `mcp:write`)

Permanently deletes a report. The report stops running and disappears from the project; the underlying data mart, destination, and any already-exported documents are not affected. This cannot be undone, so your assistant asks for confirmation before calling it.

**Input:**

| Field       | Description                                     |
| ----------- | ----------------------------------------------- |
| `report_id` | Report to delete (from `get_data_mart_reports`) |

**Returns:**

| Field       | Description        |
| ----------- | ------------------ |
| `report_id` | Report identifier  |
| `status`    | `deleted`          |

## How to use it: example prompts

Once the OWOX server is connected, just ask your assistant in plain language. You do not need to name the tools — the assistant calls them for you. Try prompts like:

- "Which OWOX project am I connected to, and what is my role in it?"
- "What data is available in this project, and what should I ask next?"
- "List all the data marts in my project."
- "Which of my data marts were updated most recently?"
- "Do I have any data marts about Facebook Ads? Show their descriptions."
- "What fields are available in the Facebook Ads data mart?"
- "Give me a one-line summary of each data mart and what it is for."
- "What's the total revenue by month in the Sales data mart?"
- "Show the top campaigns by spend in the Ads data mart."
- "Which destinations can I send a report to?"
- "Connect a Google Sheets destination for my account."
- "Create an email destination for `analytics-alerts@example.com`."
- "What reports and schedules already exist for the Sales data mart?"
- "Run the Weekly Ads Report now and tell me when it finishes."
- "Export the Ads data mart to a new Google Sheet called 'Weekly Ads Report'."
- "Rename that report to 'Q3 Ads Report' and keep only the campaign and spend fields."
- "Schedule that report to run every Monday at 9am New York time."
- "Turn off the schedule you just created."
- "Delete the old 'Test export' report from the Sales data mart."

> **What these tools can and cannot do:** They let the assistant discover your project, summarize the published data mart catalog, inspect data mart metadata, list destinations, list reports and schedules, and check report-run status. With `query_data_mart`, the assistant can run a bounded structured query and read the resulting data rows and totals; this is billable and recorded in Run History. With your confirmation, the assistant can also create destinations (`add_destination`), create a Google Sheets report (`add_report`), rename a report or change which fields it exports (`update_report`), delete a report (`delete_report`), create, update, or delete report-run schedules, and start a manual run for supported push-destination reports (`run_report`). They cannot run arbitrary SQL — only structured queries built from the fields, filters, and aggregations described above — and cannot edit a data mart, edit an existing destination, change project settings, retrieve destination secret keys, or run pull-based Looker Studio reports through `run_report`.
>
> **What is shared with your AI provider:** To answer your prompts, project metadata, data-mart metadata, destination metadata, report and schedule metadata, report-run status, and your project roles can be sent to the AI provider behind your client, such as Anthropic for Claude or OpenAI for ChatGPT. If you ask the assistant to create an email-based destination, the email addresses you provide are also sent through that client. Whenever the assistant runs `query_data_mart`, the **resulting data rows and totals are sent** to that provider so it can answer with the data — only data you are permitted to query. Connect OWOX only to clients your organization permits to receive this information.

## Troubleshooting

### Requests return 401 Unauthorized

The MCP server rejects a request with `401` in these cases. Your AI client may surface these as a generic "couldn't connect" or "authorization expired" message rather than the exact text below:

| Message                                                     | Cause                                                           | Fix                                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Missing MCP bearer token`                                  | No `Authorization: Bearer` header was sent.                     | Re-run authorization so the client obtains a token. A `GET /mcp` without a token (a client probe) is expected and harmless. |
| `Invalid MCP bearer token`                                  | The token is expired, revoked, or invalid.                      | Disconnect and reconnect the MCP server to obtain a fresh token.                                                            |
| `Invalid MCP resource`                                      | The token was issued for a different resource than this server. | Confirm the client points to the correct `/mcp` URL, then reconnect.                                                        |
| `Missing MCP project context` / `Missing MCP project roles` | The token has no project selected or no active role in it.      | Reconnect and make sure you select a project where you are an active member.                                                |

### A tool reports `Missing MCP scope: mcp:write`

The token does not include the write scope required for tools that create, change, run, or bill something. Disconnect and reconnect the MCP server, then approve the requested scopes during authorization. If your client lets you choose scopes manually, include both `mcp:read` and `mcp:write`.

### The wrong project is connected

Project selection is fixed at authorization time. See [Switch projects or disconnect](#switch-projects-or-disconnect) for how to reconnect and choose a different project.

### A `query_data_mart` call fails

If the assistant reports that the project is out of credits, `query_data_mart` has hit its credit limit — upgrade the plan to keep querying (the read-only tools keep working). If it says a field wasn't found, it likely guessed a field name; ask it to check the data mart's fields first with `get_data_mart_details_by_id`, then re-run the query.

### A Google Sheets destination created through `add_destination` is missing

For Google Sheets, `add_destination` only returns a setup link; the destination appears after the user opens the link and completes Google OAuth. Make sure the user signed in to OWOX with the same account that connected MCP, completed the browser flow, and has access to the project. Then call `list_destinations` and match the destination by `connectedGoogleAccount`. Do not pick the newest destination by `createdAt`.

### A `run_report` call fails

If the report uses a pull-based destination such as Looker Studio, it cannot be started through `run_report`. If the error says the report is already running or pending, use `get_report_run_status` for the existing `run_id` if you have it, or check Run History in OWOX Data Marts before starting another run.

## Related docs

- [Roles and permissions](../../project/roles-and-permissions.md)
- [Destination Management](../../destinations/manage-destinations.md)
- [Google Sheets destination](../../destinations/supported-destinations/google-sheets.md)
- [Report Triggers](./report-triggers.md)
- [API Keys](../../api/api-keys.md)
