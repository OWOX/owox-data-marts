# MCP Server

OWOX Data Marts exposes a Model Context Protocol (MCP) server. It lets AI assistants and MCP-compatible clients connect to your project data using standard OAuth authorization.

Use the MCP server to explore your [data marts](../core-concepts.md) in plain language with an AI assistant like Claude or ChatGPT. You never have to leave the assistant. The assistant can summarize the available catalog and inspect data mart fields. It can run bounded queries, list destinations and reports, and set up report delivery. It can also manage report schedules and start report runs for supported push destinations. See [Available tools](#available-tools) for exactly what it can and cannot do.

## Prerequisites

- An active OWOX Data Marts project with at least one data mart. New to Data Marts? See how to create a [connector-based](./connector-data-mart.md) or [SQL-based](./sql-data-mart.md) Data Mart.
- One of the supported clients: Claude Desktop or Claude web (claude.ai) — the recommended way to connect — or ChatGPT. Any other client that supports the MCP Streamable HTTP transport with OAuth 2.0 will also work.
- A client plan that allows MCP connectors. Adding an MCP server like OWOX may require a paid plan in Claude or ChatGPT. Check your client's current plan requirements.

## Step 1: Connect your AI assistant

Set up whichever assistant you use — you only need one. We recommend Claude Desktop or Claude web as the default client. Connect to the shared MCP server, `https://mcp.owox.com/mcp`: the client discovers its OAuth endpoints and registers itself automatically, so there is no client ID, secret, or token to copy. You select your project during authorization — see [Step 2](#step-2-authorize-access).

> **Note:** Connecting to multiple projects, or scripting the setup from a URL your OWOX UI or API already gave you? See [Use a project-specific URL](#use-a-project-specific-url) below.

### Claude Desktop (recommended)

1. Open Claude and go to **Settings → Connectors**.
2. Click **Add → Browse connectors**.

   ![Claude Desktop Connectors settings with an arrow pointing from the Connectors sidebar item to Browse connectors in the Add menu](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b0f101ff-724e-4210-7c29-37682c40de00/public)

3. Find **OWOX Data Marts** and click **Connect**.

   ![OWOX Data Marts connector page in Claude's connector directory, with an arrow pointing to the Connect button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e940efd9-6548-47dd-bd76-82326dde1b00/public)

4. Claude opens a browser window to complete authorization. Follow the steps in [Step 2](#step-2-authorize-access).

To confirm your MCP server is configured correctly, open the Connectors section and check that OWOX Data Marts is enabled.

![Claude's Connectors menu showing the OWOX Data Marts toggle switched on](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3e4b21ca-11b2-44ef-af3a-407014e17f00/public)

### Claude web (claude.ai)

1. Open [claude.ai](https://claude.ai) and go to **Settings → Connectors**.
2. Click **Add → Browse connectors**.
3. Find **OWOX Data Marts** and click **Connect**.
4. Claude opens an authorization flow in the same browser. Follow the steps in [Step 2](#step-2-authorize-access).

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

### Use a project-specific URL

The steps above connect the shared MCP server and let you pick a project during authorization. If OWOX UI or API already gave you a project's URL — `https://{projectId}.mcp.owox.com/mcp` — you can connect that instead: add it as a custom connector rather than picking OWOX Data Marts from the client's connector directory (in Claude, use **Add → Add custom connector**). The `projectId` is already in MD5 format; it is only a stable URL identifier and does not grant access by itself.

A project-specific URL uses the same OAuth flow and the same MCP tools as the shared one, but it skips the project selection screen in [Step 2](#step-2-authorize-access) — authorization still succeeds only if the signed-in user is an active member of that project.

If you connect project-specific MCP servers for multiple projects, give each connection a unique name, such as `Marketing` or `Finance`. This makes it easier to select the right server and tell your assistant which project's MCP tools to use.

## Step 2: Authorize access

When the MCP client first connects, it opens a browser window to complete OAuth 2.0 authorization. You only complete two interactive steps:

1. **Sign in** to your OWOX account if you do not already have an active session.
2. **Select a project** — for `https://mcp.owox.com/mcp`, if you belong to more than one project, a selection screen appears. Choose the project you want this MCP connection to use and click **Next**. If you use `https://{projectId}.mcp.owox.com/mcp`, this screen is skipped because the project is already part of the server URL.

There is no separate permissions-consent screen. Once you sign in and select a project, the client receives an access token. It uses that token automatically for all subsequent requests. The token is bound to the project you selected and to the requested scope.

Access tokens are short-lived, and the client refreshes them automatically in the background — you stay connected without signing in again. You only need to reconnect manually if the refresh fails — for example, after your OWOX session is revoked. You also reconnect manually when you want to switch projects.

### Add project context for your assistant

Project admins can provide up to 10,000 characters of business context, terminology, and project-specific conventions for AI assistants in **Project settings → Overview → Description**. OWOX returns the complete description through `get_project_context`; the MCP instructions tell the assistant to call that tool before its first project-specific operation.

Do not put passwords, API keys, or other secrets in the description. All project members can see it, and connected MCP clients may send it to their AI provider. After changing the description, the updated value is available on the next `get_project_context` call; reconnecting the MCP client is not required.

## Step 3: Verify the connection

Confirm everything works before relying on it. In your assistant, send:

> Which OWOX project am I connected to?

The assistant calls the `get_project_context` tool and replies with your project title, your role, and the project status. If you see your project name, the connection is working. If instead you get an authorization or "no tools available" error, see [Troubleshooting](#troubleshooting).

## Switch projects or disconnect

Project selection is fixed when you authorize. Switching projects means reconnecting with the shared server and selecting another project, or reconnecting with a different project-specific server URL. Where you manage the connection depends on the client:

- **Claude Desktop / Claude web:** **Settings → Connectors**, then open the OWOX connector to disconnect or reconnect it.
- **ChatGPT:** **Settings → Apps**, then open the OWOX app to disconnect or reconnect it.

To switch projects, disconnect, then reconnect and sign in again. If you use the shared server, choose the project during authorization. If you use a project-specific server, use the URL for the target project.

## Available tools

Once connected, the MCP server exposes eighteen tools across two scopes:

- **`mcp:read`**: discovery and status tools — `summarize_data_catalog`, `get_project_context`, `list_data_marts`, `get_relevant_data_marts_by_prompt`, `get_data_mart_details_by_id`, `list_destinations`, `get_data_mart_reports`, `list_report_run_schedules`, `get_report_run_status`.
- **`mcp:write`**: tools that create, change, run, or bill something — `query_data_mart`, `add_destination`, `add_report`, `update_report`, `delete_report`, `create_report_run_schedule`, `update_report_run_schedule`, `delete_report_run_schedule`, `run_report`. `query_data_mart` and the report-run schedule mutation tools also require `mcp:read`. `query_data_mart` reads data rows, records each call in Run History, and costs [credits](../billing/consumption-units.md) per call. Your MCP client may ask you to confirm before it calls one of these.

### `summarize_data_catalog`

Returns a high-level summary of the published data mart catalog available to this MCP connection. It helps the assistant answer broad orientation questions like "What data is available here?" or "Where should I start?" without querying actual data rows.

**Returns:**

| Field                            | Description                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `project_id`                     | Project identifier                                                           |
| `data_mart_count`                | Number of published data marts visible to you                                |
| `top_data_marts_by_connectivity` | Data marts ranked by configured relationship connectivity                    |
| `_instruction`                   | Internal guidance for the assistant on how to summarize the returned catalog |

Each `top_data_marts_by_connectivity` item includes `id`, `title`, `description`, `url`, `relationship_count`, `reports_count`, `triggers_count`, and `updated_at`.

Use this tool when the user asks what can be analyzed in the project. It does not return sample values, data freshness, row counts, or any actual data rows.

### `get_project_context`

Returns information about the OWOX project that this MCP connection is authorized for, including the complete admin-maintained project description when one is configured.

**Returns:**

| Field                         | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `current_project.id`          | Project identifier                                              |
| `current_project.title`       | Project display name                                            |
| `current_project.description` | Complete project description, or `null` when none is configured |
| `current_project.status`      | Project status                                                  |
| `current_project.roles`       | Your roles in this project                                      |
| `current_project.created_at`  | Project creation date                                           |
| `project_switching`           | Instructions for switching to a different project               |

The assistant should use this tool before its first project-specific operation so it has the project's business context. You can also use it to confirm which project is active or selected. Call it again after an admin changes the project description to get the latest value.

### `list_data_marts`

Lists data marts visible to you in the current project. By default, it returns published data marts. You can explicitly request draft data mart metadata, but drafts cannot be inspected or queried through other MCP data mart tools.

**Input:**

| Field    | Description                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `status` | Optional: `published` (default) returns queryable data marts; `draft` returns draft metadata for catalog browsing only. |

**Returns** an array of data mart objects:

| Field         | Description                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`          | Data mart identifier                                                                                                     |
| `title`       | Data mart name                                                                                                           |
| `description` | Data mart description                                                                                                    |
| `url`         | Link to open the data mart in OWOX Data Marts                                                                            |
| `status`      | Current status: `PUBLISHED` or `DRAFT`. Response values are uppercase and differ from the lowercase input filter values. |
| `updated_at`  | Last update timestamp                                                                                                    |

Use this tool to discover available data marts before running queries or building reports.

The response also includes `project.id` and `project.title`, so the assistant can state which project its discovery results belong to.

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

The response also includes `project.id` and `project.title`.

Only non-draft data marts visible to your [project role](../../project/roles-and-permissions.md) are returned.

### `get_data_mart_details_by_id`

Returns field-level metadata for one data mart visible to you in the current project.

**Input:**

| Field          | Description                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data_mart_id` | Data mart identifier returned by `list_data_marts` or `get_relevant_data_marts_by_prompt`                                                                           |
| `detail_level` | Optional: `native` (default) returns only the data mart's own fields; `with_joined_fields` additionally returns joined fields when the question truly requires them |

**Returns:**

| Field                    | Description                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | Data mart identifier                                                                                                                                                       |
| `name`                   | Data mart name                                                                                                                                                             |
| `url`                    | Link to open the data mart in OWOX Data Marts                                                                                                                              |
| `description`            | Data mart description                                                                                                                                                      |
| `fields`                 | The data mart's own (native) output fields with query `name`, presentation `displayName`, types, descriptions, and business names when available                           |
| `joined_fields_included` | Whether joined fields were requested and evaluated. When `false`, `joined_fields` was intentionally omitted rather than evaluated as empty.                                |
| `joined_fields`          | Fields contributed by blended/joined data marts when requested, each with exact query `name`, presentation `displayName`, source data mart, type, and allowed aggregations |
| `operators_by_category`  | For each field-type category present in the data mart (`number`/`string`/`date`/`time`/`boolean`/`other`), the `query_data_mart` filter/slice operators its fields accept  |

Use this tool when you need to understand the fields available in a specific data mart. It returns native fields by default; request `detail_level=with_joined_fields` before concluding that the native schema cannot answer a question or after a `field_not_found` error. A field's `allowedAggregations` and its category's entry in `operators_by_category` tell the assistant which aggregations and operators the field supports. The assistant can build queries without trial and error. It does not return sample values, data freshness, owners, or actual data rows. To learn how joined/blended fields are set up, see [Joinable Data Marts](./joinable-data-marts.md).

### `query_data_mart` (requires `mcp:read` and `mcp:write`)

Runs a query against one data mart and returns its data rows, plus server-side totals computed over all matching rows. Unlike the tools above, this reads the data itself — **each call runs against your warehouse and costs [credits](../billing/consumption-units.md)**, and every call is recorded in Run History (the query definition and executed SQL only — never row values).

**Input:**

| Field          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data_mart_id` | Data mart to query                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `fields`       | Exact field names to return, copied from `get_data_mart_details_by_id`. Must include every field used in `aggregations`, `date_buckets`, and `sort`. Reference blended fields by their qualified `<alias>__<field>` name                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `aggregations` | Aggregations over a field: `SUM`, `COUNT`, `COUNT_DISTINCT`, `AVG`, `MIN`, `MAX`, and percentiles `P25`/`P50`/`P75`/`P95`. Which of these a field allows depends on its type and per-field settings — use the `allowedAggregations` returned by `get_data_mart_details_by_id`. Group-by is implied by the non-aggregated fields                                                                                                                                                                                                                                                                                                                           |
| `date_buckets` | Bucket a date/timestamp field by `DAY`/`WEEK`/`MONTH`/`QUARTER`/`YEAR`. Only date-category fields can be bucketed; `time_zone` applies only to types with a time component (not pure `DATE`)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sort`         | Order the result rows: each rule is `{ field, direction }` with direction `asc` or `desc`; rules apply in order (the first is the primary key). Each sorted field must also appear in `fields`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `slices`       | Pre-join filters — narrow a joined data mart before it is blended in (joined fields only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `filters`      | Post-join filters on the blended result. Row-level predicates applied to raw values before any aggregation — there is no `HAVING`, so they cannot threshold an aggregated total. Which operators a field accepts depends on its type — see `operators_by_category` from `get_data_mart_details_by_id`; several filters combine with AND. `in`/`not_in` take an array of values (match any of / none of). The negative operators `neq`, `not_contains`, `not_regex`, and `not_in` are NULL-inclusive — they keep rows where the field is NULL, treating a missing value as "not equal to"; add an `is_not_blank` filter on the same field to exclude NULLs |
| `limit`        | Maximum rows to return (1–1000, default 20). There is no pagination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

For a “how many” question, use `COUNT` or `COUNT_DISTINCT` (when the user means unique entities) rather than returning raw rows and counting them in the assistant. Include only the dimensions needed for the requested breakdown.

**Returns:**

| Field                | Description                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `columns`            | Business-friendly headers matching the header row in `rows`                                              |
| `column_metadata`    | Exact technical query `name` plus business-friendly `display_name`, type, and description when available |
| `rows`               | The data rows, as a compact header-once table                                                            |
| `returned_rows`      | Number of rows in the response                                                                           |
| `truncated`          | `true` if not all matching rows were returned — narrow the query or raise `limit`                        |
| `truncation`         | Present only when truncated; `reasons` is `row_limit`, `payload_byte_cap`, or both                       |
| `totals`             | Server-side totals over all matching rows, ignoring the row limit                                        |
| `data_last_updated`  | When the source tables behind this result last changed in the warehouse — see below                      |
| `source`             | The id, title, and OWOX link of the Data Mart that supplied the response                                 |
| `calculation_origin` | Marks rows as taken from OWOX, and totals and `data_last_updated` as produced by OWOX when available     |

Only data marts and fields your [project role](../../project/roles-and-permissions.md) permits are queryable. For more on how aggregations and totals are computed, see [Report Aggregations and Totals](./report-aggregations.md); for why a given aggregation may be rejected on a field, see [Report Output Controls](./output-controls.md).

When presenting results, the assistant must name the source Data Mart. It must distinguish OWOX-provided values from any arithmetic it performs itself. If `truncated` is true, it must explicitly tell the user that returned rows are incomplete; server-provided totals remain valid for all matching rows, but any number calculated from returned rows can be incomplete.

#### Data last updated

`data_last_updated` answers "how current is what I am looking at?". Each query measures it live, in the same call that reads the data. OWOX never caches this value and never bills it separately — the call's own credits cover it. A non-blended query (no joined fields) also saves the measurement as the Data Mart's last-known value. The same value appears across the OWOX UI — see [Data Last Updated](./data-last-updated.md).

| Field                  | Description                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `data_last_updated_at` | ISO-8601 UTC time when the newest source table last changed, or `null` when the warehouse does not report it                            |
| `computed_at`          | When this measurement was taken                                                                                                         |
| `coverage`             | `complete`, `partial` (some sources unreadable — the real time can only be more recent), or `unavailable` (nothing could be determined) |
| `sources`              | Per-table detail, each with its own time and an optional `note` explaining a gap                                                        |

Read the value precisely. It is a **storage** timestamp, not a statement about the data's content:

- It says when something last **wrote to** the source tables. A backfill can rewrite a table today with figures from 2021, so "updated today" does not mean "covers today". For this reason the field is _data last updated_, not _freshness_.
- `null` means **unknown** — neither fresh nor stale. The assistant should say OWOX could not determine it, without implying either.
- With `coverage: "partial"`, treat the timestamp as "at least as recent as" and say the picture is incomplete.
- The assistant is asked to present the timestamp in a business-friendly form (e.g. "August 4, 2026 at 09:46 UTC") — converted to the user's time zone when the conversation establishes one, otherwise in UTC with the zone named — never as a raw ISO-8601 string. The machine-readable ISO-8601 value stays in the structured response.

Coverage is best effort per storage. Google BigQuery, AWS Redshift, AWS Athena, Snowflake, and Databricks are supported. OWOX resolves views and SQL data marts through to their underlying base tables. Sharded and wildcard table sets collapse into one entry. Other storages currently report `unavailable`. `sources` deliberately omits views: a view's own modification time reflects a change to its definition, not to any data. Redshift metadata can lag real writes by up to ~5 minutes. Older Redshift releases do not report modification times at all. Athena is exact for Iceberg tables; Hive tables report `null` with a note, because their catalog stores no data-change time. See [Data Last Updated](./data-last-updated.md) for storage-specific caveats.

### `list_destinations`

Lists the destinations in the current project — such as Google Sheets, Looker Studio, or messaging destinations — so the assistant knows where a report could be sent.

**Returns** an array of destination objects:

| Field                    | Description                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`                     | Destination identifier                                                                                    |
| `url`                    | Link to open this destination in OWOX                                                                     |
| `name`                   | Destination name                                                                                          |
| `type`                   | Destination type (for example `google_sheets`, `looker_studio`, `slack`, `email`, `teams`, `google_chat`) |
| `owner`                  | The user who created the destination, or `null` when unavailable                                          |
| `connectedGoogleAccount` | For Google Sheets destinations, the Google account that completed OAuth consent                           |
| `createdAt`              | Destination creation timestamp                                                                            |

The list reflects your access: it includes only the destinations your [project role](../../project/roles-and-permissions.md) permits you to use. If you are identifying a Google Sheets destination just created through `add_destination`, match by `connectedGoogleAccount`, not by `createdAt` or "newest" — someone else can create a destination at the same time. To add or manage destinations, see [Destination Management](../../destinations/manage-destinations.md).

### `add_destination` (requires `mcp:write`)

Starts or completes setup for a report-delivery destination. The exact flow depends on `destination_type`.

**Input:**

| Field              | Description                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destination_type` | Destination type to connect or create: `google_sheets`, `looker_studio`, `email`, `slack`, `teams`, or `google_chat`                                           |
| `title`            | Optional destination name. Applies to `email`, `slack`, `teams`, `google_chat`, and `looker_studio`; Google Sheets names are entered in the browser setup form |
| `emails`           | Required for `email`, `slack`, `teams`, and `google_chat`; target email addresses or delivery addresses for the destination                                    |

**Returns:**

| Field               | Description                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorization_url` | For `google_sheets`, a link to the OWOX "Connect Google Sheets" page where the user completes Google OAuth                                                |
| `destination_id`    | New destination identifier. Returned for `looker_studio`, `email`, `slack`, `teams`, and `google_chat`; absent for Google Sheets until setup is completed |
| `destination_url`   | Link to open the created destination; absent for Google Sheets until OAuth creates it                                                                     |
| `instructions`      | Human-readable next steps for finishing setup or using the new destination                                                                                |

For `google_sheets`, this tool does not create the destination immediately. It returns a project-scoped setup link; the user opens it, signs in to OWOX if needed, clicks **Connect with Google**, and approves Google access. After the user confirms setup is complete, call `list_destinations` and match the new Google Sheets destination by `connectedGoogleAccount`. The created destination is usable by the person who connected it, but it starts unshared for other project members until someone shares it in the UI.

For `email`, `slack`, `teams`, and `google_chat`, the tool creates the destination directly and returns `destination_id`. For `looker_studio`, the tool also creates the destination directly, but it never sends connector credentials or secret keys through MCP/chat; the user opens the destination in OWOX Data Marts to copy those credentials, and the returned `instructions` include a link to the [Data Studio destination](../../destinations/supported-destinations/data-studio.md) guide with the full walkthrough.

### `get_data_mart_reports`

Lists the reports tied to a data mart, including each report's destination, its run schedules (a report can have any number of schedule triggers), and its last run status.

**Input:**

| Field          | Description          |
| -------------- | -------------------- |
| `data_mart_id` | Data mart identifier |

**Returns** an array of report objects:

| Field              | Description                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `report_id`        | Report identifier                                                                                                |
| `report_url`       | Link to the report's Data Mart reports page in OWOX                                                              |
| `data_mart_id`     | Data mart identifier                                                                                             |
| `name`             | Report name                                                                                                      |
| `destination_id`   | Destination the report exports to                                                                                |
| `destination_url`  | Link to the destination in OWOX                                                                                  |
| `destination_type` | Destination type (for example `google_sheets`)                                                                   |
| `owner`            | The user who created the report                                                                                  |
| `schedules`        | Array of run schedules — `trigger_id`, `cron_expression`, `time_zone`, `is_active`, `next_run_at`, `last_run_at` |
| `last_run_at`      | Timestamp of the most recent run                                                                                 |
| `last_run_status`  | Status of the most recent run                                                                                    |

Use this tool before scheduling or changing a report's cadence, to see what already exists.

### `run_report` (requires `mcp:write`)

Starts an existing report run and delivers fresh data to its push destination. Use it for a later rerun, or to retry delivery when `add_report` returned `initial_run.status: failed_to_queue`. Do not call it for the initial run when `add_report` already returned a queued `run_id`. This returns immediately with identifiers for the run; it does not wait for completion. Each call starts a new billed Report Run, so do not call it again for the same report while the previous run is still running or pending.

**Input:**

| Field       | Description                                 |
| ----------- | ------------------------------------------- |
| `report_id` | Report to run, from `get_data_mart_reports` |

**Returns:**

| Field       | Description                                       |
| ----------- | ------------------------------------------------- |
| `report_id` | Report identifier                                 |
| `run_id`    | Run identifier to pass to `get_report_run_status` |

Use this tool for push destinations such as Google Sheets, Email, Slack, Microsoft Teams, and Google Chat. Pull-based destinations such as Looker Studio cannot be run through `run_report`.

### `get_report_run_status`

Checks the current status of a report run started with `run_report` or queued automatically by `add_report`.

**Input:**

| Field       | Description                             |
| ----------- | --------------------------------------- |
| `report_id` | Report identifier                       |
| `run_id`    | Run identifier returned by `run_report` |

**Returns:**

| Field         | Description                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`   | Report identifier                                                                                                                                       |
| `run_id`      | Run identifier                                                                                                                                          |
| `status`      | Normalized status: `running`, `success`, `failed`, `cancelled`, `interrupted`, or `restricted`                                                          |
| `should_poll` | `true` when the assistant should keep checking this run; `false` when polling should stop                                                               |
| `stop_reason` | `queued_too_long`, `running_too_long`, or `null`                                                                                                        |
| `queued_at`   | Timestamp when the run was queued, if available                                                                                                         |
| `started_at`  | Timestamp when execution started, if available                                                                                                          |
| `raw_status`  | Backend run status                                                                                                                                      |
| `error`       | Error message for failed runs, otherwise `null`                                                                                                         |
| `message`     | Polling guidance for the assistant, including when a run is taking longer than usual or may be stuck; `null` when the run has reached a terminal status |

Report runs can take several minutes. While `should_poll` is `true`, the assistant should call `get_report_run_status` again, ideally waiting about 15 seconds between checks if the client supports waiting.

### `list_report_run_schedules`

Lists every scheduled report-run trigger in the current project that you can see, in a single response.

**Returns** an array of schedule objects:

| Field             | Description                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `trigger_id`      | Schedule identifier — pass to `update_report_run_schedule` or `delete_report_run_schedule` |
| `report`          | The report this schedule belongs to (`id`, `title`, `url`)                                 |
| `data_mart`       | The data mart the report is built on (`id`, `title`, `url`)                                |
| `schedules_url`   | Link to the report schedules page in OWOX                                                  |
| `cron_expression` | Schedule in 5-field cron syntax                                                            |
| `time_zone`       | IANA timezone the cron expression is evaluated in                                          |
| `is_active`       | Whether the schedule is currently enabled                                                  |
| `next_run_at`     | Next scheduled run, if any                                                                 |
| `last_run_at`     | Last run, if any                                                                           |
| `can_edit`        | Whether you can update this schedule                                                       |
| `can_delete`      | Whether you can delete this schedule                                                       |

Use this tool to find a schedule's `trigger_id` before updating or deleting it. Creating a new schedule (`create_report_run_schedule`) never replaces an existing one — a report can have several. These schedules are the same report triggers you can manage in the UI — see [Report Triggers](./report-triggers.md).

### `create_report_run_schedule` (requires `mcp:read` and `mcp:write`)

Adds a new recurring run schedule to an existing report. The assistant translates natural language (for example "every Monday at 9am") into a standard 5-field cron expression before calling this tool.

**Input:**

| Field             | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `report_id`       | Report to attach the schedule to                                                     |
| `cron_expression` | 5-field cron expression                                                              |
| `time_zone`       | Optional IANA timezone (for example `Europe/Kyiv`); defaults to UTC if not specified |
| `is_active`       | Optional; defaults to `true`                                                         |

**Returns:** `trigger_id`, `report_id`, `cron_expression`, `time_zone`, `is_active`, `next_run_at`.

This always creates an additional schedule — it never replaces or updates an existing one. To change an existing schedule, use `update_report_run_schedule` instead.

### `update_report_run_schedule` (requires `mcp:read` and `mcp:write`)

Updates one existing schedule identified by `trigger_id` (from `list_report_run_schedules`).

**Input:**

| Field             | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `trigger_id`      | Schedule to update                                         |
| `cron_expression` | New 5-field cron expression                                |
| `time_zone`       | Optional; omit to keep the schedule's current timezone     |
| `is_active`       | Optional; omit to keep the schedule's current active state |

**Returns:** `trigger_id`, `report_id`, `cron_expression`, `time_zone`, `is_active`, `next_run_at`.

This changes the schedule's cadence in place — it does not change which report it belongs to and does not create another schedule.

### `delete_report_run_schedule` (requires `mcp:read` and `mcp:write`)

Removes a single schedule identified by `trigger_id`. This is destructive and cannot be undone from the assistant.

**Input:**

| Field        | Description        |
| ------------ | ------------------ |
| `trigger_id` | Schedule to remove |

**Returns:** `trigger_id`, `report_id`, and `schedule: null` to confirm removal. Only that one schedule is removed — the report and any other schedules it has are left intact.

### `add_report` (requires `mcp:write`)

Creates a report that exports a data mart to an existing destination (see `list_destinations`). For push destinations, it also queues the first run by default so the destination is populated immediately. Set `run_immediately` to `false` only when the user explicitly wants configuration without delivery, such as before creating a schedule.

- **Google Sheets**: a new Google Sheet is created automatically and linked to the report, then the initial run writes data into it by default. Unlike every other tool, this path reaches outside OWOX: it creates a file in Google Drive and attempts to share it with you. See [Google Sheets destination](../../destinations/supported-destinations/google-sheets.md) for how to set the destination up.
- **Looker Studio**: the report is created with default settings (data cache lifetime of 5 minutes) — the tool accepts no Looker-Studio-specific parameters, and no `name` (Looker Studio reports carry no name). Each data mart + destination pair can have exactly one Looker Studio report; creating a second one returns an error instead of a duplicate. Creating the report only makes the data mart available to the destination: data appears in a dashboard after you connect Looker Studio to OWOX with the destination's JSON Config (it contains a secret key, so it is never sent through the assistant). The response includes `instructions` and a `setup_guide_url` so the assistant can walk you through it; the full guide is [Data Studio destination](../../destinations/supported-destinations/data-studio.md). If the project has no Looker Studio destination yet, the assistant can create one with `add_destination` first.
- **Email, Slack, Microsoft Teams, Google Chat**: the report carries the message subject and body; the recipients or channels are configured on the destination itself, not on the report. The default initial run sends the rendered message immediately. The send condition is always the default ("Send always") — change it in the OWOX Data Marts UI if you need a conditional report.

**Input:**

| Field             | Description                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data_mart_id`    | Data mart to export                                                                                                                                                                                                                                                                                         |
| `destination_id`  | The destination to export to (from `list_destinations`)                                                                                                                                                                                                                                                     |
| `fields`          | Exact column names to include, or `["*"]` for every field                                                                                                                                                                                                                                                   |
| `filters`         | Optional. Row filters applied on every report run — same shape and operator vocabulary as `query_data_mart`'s `filters`, so the assistant can create a report that exports exactly the filtered result you were looking at. A filter may reference a field that is not in `fields`. Omit to export all rows |
| `slices`          | Optional. Pre-join filters that narrow a joined data mart before blending — same as `query_data_mart`'s `slices`. Blended data marts only                                                                                                                                                                   |
| `aggregations`    | Optional. Aggregations applied on every run — same as `query_data_mart`'s `aggregations`. Each aggregated field must also appear in `fields`; other fields become group-by dimensions                                                                                                                       |
| `date_buckets`    | Optional. Bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR — same as `query_data_mart`'s `date_buckets`. Each bucketed field must also appear in `fields`                                                                                                                                       |
| `sort`            | Optional. Order of the exported rows — same as `query_data_mart`'s `sort`                                                                                                                                                                                                                                   |
| `limit`           | Optional. Max rows each run exports; omit for no cap (the interactive query limit is deliberately NOT carried over)                                                                                                                                                                                         |
| `name`            | Report name — also the new sheet's title (Google Sheets) and the default message subject (email family). Required for those destination types; not accepted for Looker Studio                                                                                                                               |
| `message`         | Message settings — required for email, Slack, Teams, and Google Chat destinations, rejected for other types                                                                                                                                                                                                 |
| `message.subject` | Optional message subject or heading. Defaults to the report name                                                                                                                                                                                                                                            |
| `message.body`    | Message body template. Supports the `{{table}}` placeholder, which renders the report's result table                                                                                                                                                                                                        |
| `run_immediately` | Optional. Defaults to `true` for push destinations, which starts one billed Report Run and delivers data. Set `false` for configuration-only creation. Looker Studio is pull-based: omit this field or set it to `false`; `true` is rejected                                                                |

**Returns:**

| Field                     | Description                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`               | Report identifier                                                                                                                 |
| `destination_type`        | Type of the destination the report was created for                                                                                |
| `report_url`              | Link to the report in OWOX Data Marts                                                                                             |
| `sheet_url`               | Google Sheets only. Link to the created Google Sheet                                                                              |
| `owner`                   | The user who created the report                                                                                                   |
| `status`                  | `created`                                                                                                                         |
| `initial_run`             | Outcome of the first run: `queued`, `not_requested`, `not_applicable`, or `failed_to_queue`. The report exists for every outcome  |
| `initial_run.run_id`      | Present for `queued`; pass it with `report_id` to `get_report_run_status` and do not call `run_report` again for this initial run |
| `initial_run.should_poll` | `true` only for `queued`; poll until the status tool returns `should_poll: false`                                                 |
| `placed_in_root`          | Google Sheets only. `true` if the configured Drive folder could not be used, so the sheet was created in the Drive root           |
| `shared_with_requester`   | Google Sheets only. `false` if the sheet could not be shared with you — opening the link may require requesting access            |
| `instructions`            | Looker Studio only. What has to happen before dashboard data flows — the assistant relays this to you                             |
| `setup_guide_url`         | Looker Studio only. Link to the step-by-step Looker Studio connection guide                                                       |

### `update_report` (requires `mcp:write`)

Updates an existing report: renames it, replaces which data mart fields it exports, replaces its output controls (filters/slices, aggregations, date buckets, sort, limit — same vocabulary as `query_data_mart`), and/or — for reports with an email, Slack, Teams, or Google Chat destination — changes the message subject or body. Anything not provided stays unchanged — the destination, owners, schedules, and send condition are preserved as-is.

**Input:**

| Field             | Description                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`       | Report to update (from `get_data_mart_reports`)                                                                                                                                          |
| `fields`          | Optional. Replacement column selection, or `["*"]` for every field                                                                                                                       |
| `filters`         | Optional. Replacement row filters (same vocabulary as `query_data_mart`'s `filters`). Replaces only the current row filters — stored slices are untouched; `[]` removes every row filter |
| `slices`          | Optional. Replacement pre-join filters (blended data marts only). Replaces only the current slices — stored row filters are untouched; `[]` removes every slice                          |
| `aggregations`    | Optional. Replacement aggregations; `[]` removes them                                                                                                                                    |
| `date_buckets`    | Optional. Replacement date buckets; `[]` removes them                                                                                                                                    |
| `sort`            | Optional. Replacement sort order; `[]` removes it                                                                                                                                        |
| `limit`           | Optional. New max rows per run; `null` removes the cap                                                                                                                                   |
| `name`            | Optional. New report name                                                                                                                                                                |
| `message`         | Optional. Message changes — only for reports with an email-family destination, rejected for other types                                                                                  |
| `message.subject` | Optional. New message subject or heading                                                                                                                                                 |
| `message.body`    | Optional. New message body template (supports `{{table}}`). Replaces the current body; if the report used an insight template, it switches to this custom message                        |

At least one change parameter must be provided (and `message`, when present, needs `subject` and/or `body`).

**Returns:**

| Field       | Description       |
| ----------- | ----------------- |
| `report_id` | Report identifier |
| `status`    | `updated`         |

### `delete_report` (requires `mcp:write`)

Permanently deletes a report. The report stops running and disappears from the project; the underlying data mart, destination, and any already-exported documents are not affected. This cannot be undone, so your assistant asks for confirmation before calling it.

**Input:**

| Field       | Description                                     |
| ----------- | ----------------------------------------------- |
| `report_id` | Report to delete (from `get_data_mart_reports`) |

**Returns:**

| Field       | Description       |
| ----------- | ----------------- |
| `report_id` | Report identifier |
| `status`    | `deleted`         |

## What costs credits

Most of what you ask costs nothing. These actions consume [credits](../billing/consumption-units.md):

- **`query_data_mart`** — reads actual data rows. Each successful call counts as one Report Run, billed as an **MCP Query Run**.
- **`run_report`** — starts a Report Run that delivers data to a destination.
- **`add_report` with its default initial run** — creating the report is free, but the automatically queued run consumes one Report Run. Set `run_immediately: false` for configuration-only creation without that run.

Everything else is free. Listing data marts, inspecting fields, browsing destinations, reading reports and schedules, and checking run status only read metadata. Creating a destination, report, or schedule is also free; `add_report` itself is free when `run_immediately` is `false` or the destination is pull-based. You pay when the report runs, not when you set it up.

Four things to expect:

- **Cost does not depend on size.** One call costs the same whether it returns 20 rows or 1,000. Ask one broad question rather than several narrow ones.
- **One question can cost several credits.** The assistant may run several queries to answer you — for example, one per month you asked about. Ask it to plan the queries first if you want to keep the count down.
- **Failed queries are free.** If a query fails, times out, or you cancel it, you pay nothing. A wrong guess about a field name costs nothing either.
- **Running out of credits blocks queries only.** The metadata tools keep working, so the assistant can still explore your catalog.

## How to use it: example prompts

Once the OWOX server is connected, just ask your assistant in plain language. You do not need to name the tools — the assistant calls them for you. Prompts marked **(costs credits)** read or deliver actual data — see [What costs credits](#what-costs-credits). Try prompts like:

- "Which OWOX project am I connected to, and what is my role in it?"
- "What data is available in this project, and what should I ask next?"
- "List all the data marts in my project."
- "Which of my data marts were updated most recently?"
- "Do I have any data marts about Facebook Ads? Show their descriptions."
- "What fields are available in the Facebook Ads data mart?"
- "Give me a one-line summary of each data mart and what it is for."
- "What's the total revenue by month in the Sales data mart?" **(costs credits)**
- "Show the top campaigns by spend in the Ads data mart." **(costs credits)**
- "Which destinations can I send a report to?"
- "Connect a Google Sheets destination for my account."
- "Create an email destination for `analytics-alerts@example.com`."
- "What reports and schedules already exist for the Sales data mart?"
- "Run the Weekly Ads Report now and tell me when it finishes." **(costs credits)**
- "Export the Ads data mart to a new Google Sheet called 'Weekly Ads Report' and tell me when the initial run finishes." **(costs credits)**
- "Create a Looker Studio report from the Sales data mart with all fields."
- "Send the daily revenue table to the Alerts Slack destination with the message 'Yesterday's numbers'." **(costs credits; sends immediately)**
- "Rename that report to 'Q3 Ads Report' and keep only the campaign and spend fields."
- "Change the subject of the daily Slack report to 'Morning numbers'."
- "Schedule that report to run every Monday at 9am New York time."
- "Turn off the schedule you just created."
- "Delete the old 'Test export' report from the Sales data mart."

> **What these tools can and cannot do:** They let the assistant discover your project, summarize the published data mart catalog, inspect data mart metadata, list destinations, list reports and schedules, and check report-run status. With `query_data_mart`, the assistant can run a bounded structured query and read the resulting data rows and totals; this is billable and recorded in Run History. With your confirmation, the assistant can also create destinations (`add_destination`), create a report for a Google Sheets, Looker Studio, email, Slack, Microsoft Teams, or Google Chat destination — optionally with the same filters, slices, aggregations, date buckets, and sort as a `query_data_mart` call, so the export matches the numbers you saw (`add_report`). New push-destination reports run once by default and return a `run_id` to poll; `run_immediately: false` creates configuration only. The assistant can also rename a report, change which fields it exports, replace its output controls, or edit the message of email-family reports (`update_report`), delete a report (`delete_report`), create, update, or delete report-run schedules, and start a later manual run for supported push-destination reports (`run_report`). They cannot run arbitrary SQL — only structured queries built from the fields, filters, and aggregations described above — and cannot edit a data mart, edit an existing destination, change project settings, retrieve destination secret keys, or run pull-based Looker Studio reports through `run_report`.
>
> **What is shared with your AI provider:** To answer your prompts, the project description and other project metadata, data-mart metadata, destination metadata, report and schedule metadata, report-run status, and your project roles can be sent to the AI provider behind your client, such as Anthropic for Claude or OpenAI for ChatGPT. If you ask the assistant to create an email-based destination, the email addresses you provide are also sent through that client. Whenever the assistant runs `query_data_mart`, the **resulting data rows and totals are sent** to that provider so it can answer with the data — only data you are permitted to query. Connect OWOX only to clients your organization permits to receive this information.

## Troubleshooting

### Requests return 401 Unauthorized

The MCP server rejects a request with `401` in these cases. Your AI client may surface these as a generic "couldn't connect" or "authorization expired" message rather than the exact text below:

| Message                                                     | Cause                                                                  | Fix                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Missing MCP bearer token`                                  | No `Authorization: Bearer` header was sent.                            | Re-run authorization so the client obtains a token. A `GET /mcp` without a token (a client probe) is expected and harmless. |
| `Invalid MCP bearer token`                                  | The token is expired, revoked, or invalid.                             | Disconnect and reconnect the MCP server to obtain a fresh token.                                                            |
| `Invalid MCP resource`                                      | The token was issued for a different MCP server URL than this request. | Confirm the client points to the same `/mcp` URL used during authorization, then reconnect.                                 |
| `Invalid MCP project context`                               | A project-specific server URL does not match the project in the token. | Disconnect and reconnect using the project-specific URL for the target project.                                             |
| `Missing MCP project context` / `Missing MCP project roles` | The token has no project selected or no active role in it.             | Reconnect and make sure you select a project, or use a project-specific URL for a project where you are an active member.   |

### A tool reports `Missing MCP scope: mcp:write`

The token does not include the write scope required for tools that create, change, run, or bill something. Disconnect and reconnect the MCP server, then approve the requested scopes during authorization. If your client lets you choose scopes manually, include both `mcp:read` and `mcp:write`.

### The wrong project is connected

Project selection is fixed at authorization time. See [Switch projects or disconnect](#switch-projects-or-disconnect) for how to reconnect and choose a different project or use another project-specific URL.

### A `query_data_mart` call fails

A failed query costs nothing — OWOX bills a call only after it succeeds. This covers queries that time out, queries you cancel, and queries the credit limit blocks.

If the assistant reports that the project is out of credits, `query_data_mart` has hit its credit limit — upgrade the plan to keep querying (the read-only tools keep working). If it says a field wasn't found, it likely guessed a field name; ask it to check the data mart's fields first with `get_data_mart_details_by_id`, then re-run the query.

### A Google Sheets destination created through `add_destination` is missing

For Google Sheets, `add_destination` only returns a setup link; the destination appears after the user opens the link and completes Google OAuth. Make sure the user signed in to OWOX with the same account that connected MCP, completed the browser flow, and has access to the project. Then call `list_destinations` and match the destination by `connectedGoogleAccount`. Do not pick the newest destination by `createdAt`.

### A `run_report` call fails

If the report uses a pull-based destination such as Looker Studio, it cannot be started through `run_report`. If the error says the report is already running or pending, use `get_report_run_status` for the existing `run_id` if you have it, or check Run History in OWOX Data Marts before starting another run.

### `add_report` returns `initial_run.status: failed_to_queue`

The report was created successfully, but its first run was not queued. Do not call `add_report` again because that would create a duplicate report and, for Google Sheets, another file. Call `run_report` once with the returned `report_id`, then poll `get_report_run_status` with its `run_id`.

## Related docs

- [Roles and permissions](../../project/roles-and-permissions.md)
- [Destination Management](../../destinations/manage-destinations.md)
- [Google Sheets destination](../../destinations/supported-destinations/google-sheets.md)
- [Report Triggers](./report-triggers.md)
- [API Keys](../../api/api-keys.md)
