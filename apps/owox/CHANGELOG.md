# owox

## 0.29.0

### Minor Changes 0.29.0

- 964d886: # Protect unsaved Output Schema changes from being lost

  When a data mart's Output Schema has unsaved changes, you're now asked how you'd like to proceed before any action that would replace the schema — so your edits are never discarded without warning.

  You'll see a clear prompt with three choices — **Save & continue**, **Discard & continue**, or **Cancel** — when you have unsaved schema changes and you:
  - generate field aliases or descriptions with AI,
  - refresh the schema,
  - publish the data mart,
  - update the input source, or
  - leave the page.

  This makes it obvious what will happen to your changes and lets you keep your work instead of losing it.

- 627880f: # Auto-create Google Sheets documents for reports

  Add a "Create document" action to the Google Sheets report form that auto-creates a new spreadsheet for the selected destination and fills in its link — so users no longer have to manually create and share a sheet. It works for both authentication methods: OAuth (the document is created in the connected account's Drive and shared with the requesting user) and Service Account (the document is created in a configured Shared Drive folder).

  Destinations can target a Drive folder for auto-created documents: paste a folder URL for Service Account destinations (validated on save — it must be a Shared Drive folder the service account can write to), or pick one with the Google Drive Picker for OAuth destinations. The Picker requires a new `GOOGLE_PICKER_API_KEY` environment variable, and the OAuth destination flow now also requests the non-sensitive `drive.file` scope (existing OAuth destinations must reconnect to grant it before folder placement and sharing work).

- e8b87e3: # Add a summarize_data_catalog MCP tool

  AI assistants connected to OWOX over MCP can now get a high-level summary of the current project's published Data Mart catalog. The summary includes the total Data Mart count and top published Data Marts ranked by relationship connectivity, report and trigger usage, and recent updates, with links and shortened descriptions — so users can understand what data is available and where to start.

  Only Data Marts visible to the current project member are included. The tool does not query actual data rows, expose sample values, or compute data freshness.

- e8b87e3: # Add a get_data_mart_details_by_id MCP tool

  AI assistants connected to OWOX over MCP can now inspect a selected Data Mart's metadata before querying it. The tool returns the Data Mart id, name, description, and available output schema fields, so the assistant can use exact field names instead of guessing when preparing `query_data_mart` calls.

  Only Data Marts the current project member can access are returned. The tool does not query actual data rows, sample values, owners, or freshness details.

- f680592: # Add a query_data_mart MCP tool and expose blended fields in data mart details

  AI assistants connected to OWOX over MCP can now query a data mart directly with the new `query_data_mart` tool: pick fields, filter (pre-join slices and post-join filters), aggregate (SUM, COUNT, COUNT_DISTINCT, AVG, MIN, MAX, percentiles), bucket dates by day/week/month/quarter/year, and get server-side totals over all matching rows. Results come back as a compact, header-once table. Each call runs against your warehouse and is recorded in Run History (query definition and executed SQL only — never row values). Every call costs credits.

  `get_data_mart_details_by_id` now also returns `joined_fields` — the fields contributed by blended/joined data marts, with their qualified names, source data mart, and allowed aggregations — so the assistant can discover, query, and slice on blended fields. Only fields from joined data marts you can report on are returned.

- 7e3ce65: # Add a get_data_mart_reports MCP tool

  AI assistants connected to OWOX over MCP can now list the reports tied to a data mart. Each report includes its destination, owner, all of its run schedules (a report can have several, each with a cron expression, timezone, and active flag), when it last ran, and the status of that last run — so you can review your reports without leaving the assistant.

  Only reports on data marts you have access to are returned.

- c1485c0: # Add an add_report MCP tool

  AI assistants connected to OWOX over MCP can now create a report that exports a data mart to a Google Sheets destination. A new Google Sheet is created automatically and the report is linked to it, so you get ready-to-open report and sheet links without leaving the assistant.

  You choose which fields to include (or all of them). The tool currently supports Google Sheets destinations.

- 4fe2c6e: # Add an update_report MCP tool

  AI assistants connected to OWOX over MCP can now update an existing report: rename it and/or change which data mart fields it exports. Everything you don't mention — destination, filters, sorting, owners, schedules — stays exactly as it was.

  Only reports you're allowed to edit can be updated.

- 5ed5a23: # Add run_report and get_report_run_status MCP tools

  AI assistants connected to OWOX over MCP can now run a report by its id: `run_report` starts the run and returns immediately with just the report id and run id, while data is delivered to the report's push destination (Google Sheets, Email, Slack, Microsoft Teams, or Google Chat). `get_report_run_status` then reports the current outcome for that run — still running, success, failed with an error message, cancelled, interrupted, or restricted — along with `queued_at`, nullable `started_at`, and the backend `raw_status`.

  While a run is in progress, the status response also carries `should_poll`, `stop_reason`, and an explicit guidance message that recommends polling about every 15 seconds. Assistants keep checking while `should_poll` is true, but can stop and show the run ids when a run stays queued too long or appears stuck.

  Pull-based consumers — Data Studio and the HTTP Data API — fetch data themselves, so such reports cannot be run through `run_report`. Runs are billed as standard Report Runs for the destination, not as MCP queries. Starting a run requires the mcp:write scope; checking its status only requires mcp:read.

- b8732c5: # Add a delete_report MCP tool

  AI assistants connected to OWOX over MCP can now delete a report on your behalf. The report stops running and disappears from the project; the underlying data mart, destination, and any already-exported documents are not affected.

  The tool is marked as destructive so assistants ask for your confirmation before calling it, and only reports you're allowed to manage can be deleted.

- e8499d4: # Add MCP tools for managing report run schedules

  Let MCP clients (such as AI assistants) manage recurring report runs directly from a conversation, without opening the OWOX UI. The MCP host now exposes four tools: list every report run schedule in the current project (with the trigger id, the report and data mart it belongs to, cron expression, timezone, next run time, and whether the current user may edit or delete it); create a new schedule for a report without replacing existing schedules; update one existing schedule by its trigger id; and delete a schedule by its trigger id while leaving the report itself intact. All actions respect the caller's project and report permissions, and creating, updating, or deleting a schedule requires both the `mcp:read` and `mcp:write` scopes.

- 5f7dbcf: # Add a list_destinations MCP tool

  AI assistants connected to OWOX over MCP can now list the destinations available in your active project. Each entry includes its name, type (Google Sheets, Looker Studio, Slack, Email, Microsoft Teams, or Google Chat), owner, and whether it's currently shared for use — so the assistant can pick the right target before creating a report on your behalf, or tell you a destination it just created still needs to be shared first.

  Only destinations you can access are returned.

- 9f2ca93: # Add an add_destination MCP tool

  AI assistants connected to OWOX over MCP can now create a new report-delivery destination on your behalf instead of only choosing from existing ones.

  For email-based destinations (email, Slack, Microsoft Teams, Google Chat) and Looker Studio, the destination is created directly and is ready to use right away. For Google Sheets, the assistant hands you a link to a simple in-app page where you sign in (if needed) and connect your Google account — the destination is created automatically once you approve access.

  Every destination created this way starts unshared, so a human reviews and shares it (Configure destination → Sharing) before it can be used in reports.

- 2a71167: # Automatic retry and clearer error messages for Criteo Ads imports

  Previously, a temporary server error from Criteo would fail the whole import immediately, and the logs only showed a raw stack trace with no explanation of what went wrong. Now, Criteo Ads imports automatically retry on server errors, rate limits, and network issues, so brief outages on Criteo's side no longer stop your import. When an import does fail, the logs now include a short summary — the HTTP status, the provider's own error message, and a note when the failure looks temporary — so you can tell at a glance whether it's worth just re-running the import.

- e575e99: # Add search functionality

  Add search functionality for finding project data marts, storages, and destinations from the project search index.

- 662871c: # API-key exchange and auth context

  Project member API keys can now be exchanged for IDP access tokens in Better Auth and the development Null IDP. Exchanged tokens are bound to the API key ID and are rejected from API-key management, project-member administration, user provisioning, Intercom identity, and MCP OAuth authorization endpoints.

  `@owox/api-client` now exposes `client.auth.getContext()`, and `owox-ctl status` includes the project and member context resolved from the exchanged token without exposing key secrets. The auth-context endpoint uses IDP token introspection, and Better Auth refreshes API-key token context from current user and membership state during introspection.

  Better Auth exchanged API-key tokens now include the project title used by auth-context responses.

  Better Auth exchanged API-key tokens now expire after 15 minutes, allowing clients to re-exchange the underlying API key instead of accepting already-issued access tokens indefinitely.

  Better Auth magic links now carry the encrypted invite role in the callback path so Better Auth callback query normalization does not drop the role before the user is added to the project.

- 36fb4d3: # Data Mart report aggregations

  Reports can now aggregate Data Mart data server-side, across all supported storages (BigQuery, Athena, Snowflake, Redshift, Databricks):
  - **Group-by + metric functions** — `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`, and percentiles `P25`/`P50`/`P75`/`P95`, rendered with the correct per-dialect SQL. Group-by is implied: every selected column without an aggregation rule becomes a grouping key.
  - **Date bucketing (`dateTruncConfig`)** — group a date/timestamp dimension by `DAY`/`WEEK`/`MONTH`/`QUARTER`/`YEAR` (e.g. "revenue by month"), with an optional per-rule IANA `timeZone` so the value is converted to that zone before truncation (absent = no conversion). Rendered with the correct per-dialect SQL.
  - **Aggregated column naming** — aggregated outputs are named `<column> | <TOKEN>` (an uppercase, spreadsheet-style function token, e.g. `revenue | SUM`, `customer_id | COUNTUNIQUE`) and carry the function's effective type.
  - **Multiple aggregations per column** — a column can carry several functions, each rendered as its own output column (e.g. `SUM` and `AVG` of `amount`).
  - **Auto Row Count** — aggregated reports automatically include a `Row Count` (`COUNT(*)`) column (no toggle).
  - **Unique Count (`uniqueCountConfig`)** — an opt-in `COUNT(DISTINCT <primary key>)` metric (composite primary keys supported via per-dialect concatenation), rejected at save time when the Data Mart has no primary key.
  - **Post-aggregation filtering (`HAVING`)** — a filter targeting an aggregated output column (a filter rule that carries its aggregate function) is applied as `HAVING` over the aggregate expression, auto-routed apart from row-level `WHERE` filters; the `(column, function)` pair must match a configured aggregation.
  - **Joined (blended) Data Marts** — post-join aggregation over the joined result (an outer `GROUP BY`), in addition to the existing pre-join join-rollup.
  - **Totals** — a per-column summary computed over the full filtered dataset (no grouping) as a DWH-side **separate query**: every selected numeric field is aggregated by all of its allowed functions (e.g. `SUM`/`AVG`/`MIN`/`MAX` of `cost`). Surfaced through the **HTTP Data API** (nested in its run subtree, never merged into the row stream); push destinations (Google Sheets, Email/Slack/Teams/Chat) don't compute totals. Row Count and Unique Count are not part of totals.
  - **Data-mart-level governance** — each schema field carries a dimension/metric role plus a type-derived set of **supported** aggregations (the menu the field may use — e.g. percentiles only for numerics) and an **on-by-default** subset, with a per-field override; reports may only aggregate with a function the field allows.
  - **Report aggregation UI** — a dedicated **AGG** control (next to output controls) plus a per-field AGG icon configure grouping, multi-aggregation, date bucketing, and timezone.

  Backend changes: three additive nullable report columns (`aggregationConfig`, `dateTruncConfig`, `uniqueCountConfig`), request/response API + OpenAPI contract, and save-time validation (column projection required for aggregated/date-trunc reports, function allowed for the field and numeric where required, date-trunc requires a date column, HAVING filters must target a configured aggregation and may not be pushed pre-join, `COUNT_DISTINCT`/`STRING_AGG` rejected on non-groupable `other`-category types, Unique Count requires a primary key).

  **Deployment ordering:** the aggregate-function list is mirrored by the separate `google-sheets-extension` report picker, which has no compile-time guard against drift. The API change is additive and safe new-server / old-client, so **deploy the backend (this package) before** shipping an extension build that exposes new aggregation options — that avoids a new client requesting a function an old server doesn't yet accept.

- 19a666c: # Add OpenAI Apps domain-verification endpoint for the MCP host

  Serve the OpenAI Apps verification token as `text/plain` (HTTP 200) at the origin-root well-known path `GET /.well-known/openai-apps-challenge`, so the OWOX MCP server can pass OpenAI's domain verification during app submission. The endpoint is public (no auth, served at the host root rather than under `/api`) and returns 404 until the token is configured via the new `MCP_OPENAI_APPS_CHALLENGE_TOKEN` environment variable.

- d80b20d: # Improved the Report Column Picker experience by adding a column search and refining the layout
  - Added a search bar to quickly find report columns.
  - Search works across native and blended Data Mart columns.
  - Added a clear empty state when no matching columns are found.
  - Reorganized the toolbar to make selection controls and search easier to find.
  - Search works together with **Show selected only** and **Select all** options.

### Patch Changes 0.29.0

- @owox/internal-helpers@0.29.0
- @owox/idp-protocol@0.29.0
- @owox/idp-better-auth@0.29.0
- @owox/idp-owox-better-auth@0.29.0
- @owox/backend@0.29.0
- @owox/web@0.29.0

## 0.28.0

### Minor Changes 0.28.0

![OWOX Data Marts – v0.28.0](https://github.com/user-attachments/assets/c9db0633-4566-4c5e-8ac2-3dfcb3a29cfc)

- 0165f6b: **Google Sheets Extension menu and sidebar updates**
  - **All Reports** — new menu item lists every report in the current document with its sheet name, last run status, and last run time, with direct access to open any report.
  - **Create new report** — new menu item creates a new sheet and opens the report creation form in one step.
  - **Report run failure reason** — hover the last run status icon in the sidebar to see why a run failed.
  - **Reliable active sheet tracking** — the sidebar correctly follows the active sheet when switching between sheets quickly.

- dad37e4: **Executed SQL in Run History**

  Report runs now record the exact SQL that ran — with output controls applied and filter parameter values inlined as literals — in a dedicated **Executed SQL** block in Run History. Previously only the raw Data Mart query was stored, which didn't reflect the parameters used at run time. Covers Google Sheets, Email, Slack, Google Chat, Microsoft Teams, and Looker Studio. The block appears only when output controls or blended SQL were applied.

- 8b20d18, 2a2efa1: **Output controls for Databricks and Snowflake**

  Filters, slices, sort, and limit are now supported on Databricks and Snowflake Data Marts, matching support already available for BigQuery, Athena, Redshift, and Legacy BigQuery. Filter values are correctly escaped per storage type; substring matchers avoid `LIKE` so user `%` and `_` stay literal. Available in the web app and the Google Sheets Extension.

- 0165f6b: **Quick run button for reports**

  Reports table now has a direct run button. A brief undo window appears before the run begins.

- 0165f6b: **Form validation and UI improvements**

  Submitting a form now opens any collapsed sections containing invalid fields and focuses the first error. Table filters now default to the `is` operator for fields that support both `contains` and `is`, and reset when switching filter fields. Project switcher menu received search, scroll-into-view, keyboard navigation, state reset on close, and accessibility improvements.

- 113ef2e: **Fail fast on disconnected report columns and output controls**

  Reports now reject orphaned column references upfront — after a joined Data Mart alias is renamed, a relationship is removed, or a field disappears from the schema or is hidden — instead of letting them leak into generated SQL and fail with a cryptic "Unrecognized name" error. The column picker shows a "Disconnected columns" block for stale selections; stale filter/slice rules are highlighted in red in Output Controls; the Output Controls button badge turns red when any control references a disconnected field.

- 19fbef7: **Readable field names and search in Output Controls**

  Filters, Slices, and Sort pickers now show the field's alias (or leaf column name), with the joined Data Mart name as a muted second line for blended fields, instead of raw nested identifiers. Each picker is now searchable by alias, Data Mart name, or technical field name.

- 25b43f6: **Criteo placement, category, and transaction reporting**

  Three new Criteo endpoints: placements, placement categories, and transactions. Added extra statistics dimensions (device, OS, channel) and reporting currency selection. Previously only campaign-level statistics were available.

- ffd8ef8: **Reliable incremental sync after partial connector run**

  The incremental date checkpoint is now written only after all accounts complete successfully. Previously, a mid-run failure could advance the checkpoint past data that was never fully fetched, silently skipping those dates on the next run. Affects MicrosoftAds, CriteoAds, GoogleAds, RedditAds, and XAds.

- fddcd83: **Criteo access token proactive refresh**

  The Criteo connector now refreshes the access token 60 seconds before it expires and retries any request that still returns an expired-token error. Previously the cached token was reused for the entire run without expiry checks, causing mid-run failures on long-running syncs.

- ec2fd8b: **Reconnect notice when Google Storage authorization expires**

  Expired authorization is now detected before a connector run starts and surfaced as a "Reconnect Storage" prompt, instead of starting the run and failing with an opaque authentication error. The storage health indicator updates automatically when access is lost.

- bbe8e34: **Drag-and-drop for service account JSON**

  Service account credential textareas now accept dropped JSON files, with JSON validation, file size limits, and error feedback.

- b856d11: **Shopify `totalOutstanding` field**

  Added `totalOutstanding` to Shopify orders — the total amount not yet transacted for the order.

- 39b4254: **Session invalidation on password change and reset**

  After a successful password change or reset, all other active sessions are revoked. The session that performed the change is preserved.

- e6e9296: **Unified column identifiers for output control slice filters**

  Slice (pre-join) filters now reference columns by the same fully qualified identifier as regular output filters (e.g. `category_details__item_event_count`) instead of a raw column name plus a separate `aliasPath`. Existing saved reports are migrated automatically.

- 1d2e04e: # **Bug fixes and improvements**
  - 1d2e04e: Fixed OAuth sign-in for ad platform connectors (Microsoft Ads, TikTok, LinkedIn, Google Ads) failing with "Not Found" after the provider authorization step — callback pages were routed to the backend instead of the web app. Affects both self-hosted and cloud deployments.
  - a222917: Fixed rotated Microsoft Ads refresh tokens not being persisted — OAuth responses returned a new token but it was discarded or overwrote the original user-provided token.
  - c110f35: Fixed AI Helper failing with `Unrecognized name: <field>` when the Output Schema contains disconnected fields. Disconnected fields are now excluded from the 30-row sample query; the fetch is skipped entirely when no connected fields remain.
  - f69f0b3: Fixed AI Helper failing with `Syntax error: Expected end of input but got "-"` for Data Marts whose fully qualified table name contains dashes (e.g. `my-project.dataset.my-table-name`). Table references and column names are now escaped per storage type via `IdentifierEscaperFacade`.
  - 4858830: Fixed missing validation feedback when a Google OAuth connection is required but not present.

### Patch Changes 0.28.0

- @owox/internal-helpers@0.28.0
- @owox/idp-protocol@0.28.0
- @owox/idp-better-auth@0.28.0
- @owox/idp-owox-better-auth@0.28.0
- @owox/backend@0.28.0
- @owox/web@0.28.0

## 0.27.1

### Patch Changes 0.27.1

- c782374: # Fix release build broken by duplicate google-auth-library

  A transitive dependency drift left two copies of `google-auth-library` (v10) in the
  tree — one hoisted at the root and a second pinned exactly by `googleapis-common` —
  which produced incompatible `OAuth2Client` types and broke the TypeScript build of the
  Google Sheets and BigQuery integrations. A scoped npm override now makes
  `googleapis-common` reuse the root copy, so the packages build and publish reliably again.

## 0.27.0

### Minor Changes 0.27.0

![OWOX Data Marts – v0.27.0](https://github.com/user-attachments/assets/43d7a5c1-26d5-4c76-9368-405b1711e7aa)

- 3d80135: **OWOX Data Marts API access**

  Added [`owox-ctl`](../../docs/api/owox-ctl.md), the OWOX Data Marts Control CLI, and [`@owox/api-client`](../../docs/api/api-client.md), a TypeScript/JavaScript API client for custom integrations. `owox-ctl` resolves credentials from environment variables, supports `.env` / `--env-file`, and defaults to OWOX Data Marts Cloud at `https://app.owox.com`.

  Available commands:
  - `owox-ctl status`
  - `owox-ctl data-marts list`
  - `owox-ctl data-marts stream`
  - `owox-ctl storages list`
  - `owox-ctl destinations list`

- cb97897: **HTTP Data API — stream Data Mart rows over HTTP**

  A new `GET /api/external/http-data/data-marts/{id}.ndjson` endpoint streams a published Data Mart's rows as newline-delimited JSON for project members authenticated with their ODM member token (`x-owox-authorization`).
  - `columns=*` returns Data Mart output columns; `columns=**` includes joined fields. Repeated `column=<name>` parameters select exact columns.
  - Optional base64url-encoded `filter`/`sort` and a `limit` are supported.
  - Only reporting-visible columns are selectable — hidden fields and excluded blend sources are rejected.
  - Every pull is recorded as an `HTTP_DATA` run in run history and counted for consumption.

- c721847: **User provisioning and project access requests**

  Added project-level user provisioning settings and context-scoped defaults for newly provisioned users. Users who receive a project token without assigned roles now stay inside a restricted ODM app shell, where they can request access to the current project or create a new one.

- 02d3048: **SQL preview icon on all reports**

  The SQL preview icon is now visible on all reports (Google Sheets, Email, Looker Studio). For reports with output controls or joined fields, clicking it opens the generated SQL dialog. For reports without, it shows a tooltip explaining that the report queries the Data Mart source directly, with a link to Data Setup.

- a47929c: **Project-wide Data Mart activity pages**

  Added project-wide pages for Data Mart triggers, reports, insights, and run history. The lists support project-level search and filters and preserve row-level permissions for actions.

- 8d83268, 3aefb24, 29c3af2: **Output controls expanded to Athena, Legacy BigQuery, and Redshift**

  Filters, slices, sort, and limit are now supported on AWS Athena, Legacy BigQuery, and AWS Redshift data marts, matching existing standard BigQuery support. Controls are available in both the web app and the Google Sheets Extension, including the generated-SQL preview and the Looker Studio cached path.

  Additionally, relative-date presets are tightened across all storages: `last_n_days` and `last_n_months` now stop at today (previously future-dated rows could leak in), and `this_month` / `this_year` are clamped to the current period.

- 060e2f9: **Automatic schema evolution for Snowflake and Redshift**

  Adding new fields to an existing Snowflake or Redshift Data Mart no longer causes MERGE or INSERT failures. Both storages now query the live table schema on every run and issue `ALTER TABLE` to add any missing columns before writing data.

- 64fca08: **Cancel Data Mart runs from Run History**

  In-progress connector and report runs can now be cancelled from Run History. Cancellation stops associated run triggers, marks the run as cancelled in history, and asks for confirmation that stopping a run can leave data incomplete.

- 4f38486: **Facebook Ads reach reporting at ad set and campaign level**

  Two new Facebook Ads endpoints report daily performance aggregated at the ad set and campaign level, with reach deduplicated to match the numbers shown in Meta Ads Manager. Previously, reach was only available per ad, so totals summed across ads overcounted the same people.

- fd7d9be: **Google Sheets destination access email visible for both auth methods**

  The email address that needs document access was previously only shown for Service Account connections. It is now displayed and copyable in one click — in both the destination form and the report form — for Service Account and Google OAuth alike.

- 62af9fb: **Default row limit for Google Sheets reports**

  New Google Sheets reports now apply a default limit of 10,000 rows instead of returning all rows, to prevent hitting Google Sheets cell limits. The output controls icon reflects the applied limit, and a tooltip is shown before the first run.

- 2f28f1d: **Availability labels renamed to "Shared for…"**

  "Available for use", "Available for reporting", and "Available for maintenance" are now "Shared for use", "Shared for reporting", and "Shared for maintenance". The "Not available" filter option is now "Not shared".

- 4409afe: **Clearer API error messages for resource access**

  Error messages returned when access is denied or a resource is not found now use product names — "Data Mart", "Data Storage", "Data Destination", "Technical User", "Project Admin" — instead of the former internal identifiers `DataMart`, `DataStorage`, `DataDestination`, `editor`, `admin`.

- 4656de0: **Anonymous CLI usage telemetry**

  `owox serve` now sends a single anonymous event on successful startup. Collected data: a random identifier (not derived from your machine or network), CLI/Node versions, OS platform/arch, and Docker/IDP/web flags. No hostnames, file paths, emails, or IP-derived identity are ever collected. Opt out by setting `OWOX_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`. Automatically disabled in CI.

- 0753de2: **Faster Google Sheets import from BigQuery views**

  Data Marts based on a BigQuery VIEW now import into Google Sheets faster and more reliably for large datasets. Previously, large views could stop responding mid-import and deliver no data at all.

- f573073: **Improved SQLite runtime stability**

  Improved runtime stability for SQLite-backed deployments, focusing on scheduled run processing and transaction coordination during concurrent background activity.

- 62af9fb: # **Bug fixes and improvements**
  - 62af9fb: Fixed connector-based Data Mart definition type and connector settings appearing empty after switching tabs when no Storage was configured. Connector-based Data Marts can now be saved without a configured Storage.
  - c6d9af1: Fixed graph zoom controls for deep relationship graphs where fit-to-view scaled the graph below the previous fixed zoom floor.

### Patch Changes 0.27.0

- @owox/internal-helpers@0.27.0
- @owox/idp-protocol@0.27.0
- @owox/idp-better-auth@0.27.0
- @owox/idp-owox-better-auth@0.27.0
- @owox/backend@0.27.0
- @owox/web@0.27.0

## 0.26.0

### Minor Changes 0.26.0

![OWOX Data Marts – v0.26.0](https://github.com/user-attachments/assets/b3d79515-3034-4273-93e6-00e83d92b83b)

- 10c540e: **New OWOX Extension for Google Sheets — public release 🎉**

  The next-generation [OWOX Extension for Google Sheets](https://workspace.google.com/marketplace/app/owox_data_marts/94902851409?utm_source=changelog) is now published on the Google Workspace Marketplace, replacing the legacy add-on. It brings Data Marts directly into Google Sheets with a redesigned UX and reaches parity with the previous Extension on the workflows users relied on.
  - **Column picker with field-level descriptions** — pick which Data Mart fields to pull into the sheet without SQL, with the alias and description from the Data Mart's Output Schema shown next to each field.
  - **All Scheduled Reports page** — a single place to see every report scheduled from the Extension, across spreadsheets and projects, subject to the user's permissions.
  - **Filters and slices on report output** — apply pre-join slices and post-join filters to shape what a report returns without editing the Data Mart.
  - **Refresh Current and Refresh All** — re-run a single report or every report on the sheet in one click.
  - **Granular permissions with Contexts support** — the Extension honours the full permissions model: per-member, per-entity availability flags, and Project Contexts so a user sees only the Data Marts, Storages, and Destinations relevant to their team. When OAuth scopes are missing or revoked, the Extension explains what's wrong and walks the user through re-granting access.
  - **In-product support via Intercom** — chat with the OWOX team without leaving the sidebar.

- 85b150c: **Default fields for connector endpoints**

  Each connector endpoint now ships with a curated set of pre-selected default fields, so users no longer have to choose fields from scratch on first use. Endpoint overviews and descriptions were also rewritten for clarity.

- c083319: **Data Mart run indicator**

  An "Updating data" badge with an animated spinner now appears in the Data Mart header during active runs. The badge includes a "View runs" button for one-click access to run history. The manual run button is disabled while another run is in progress, with a tooltip explaining why.

- 5b55bf2: **Membership requests on the Members page**

  Project Admins can now review and act on pending project join requests from Project Settings → Members. Pending requests appear as a collapsible card above the members list. Clicking a request opens a side sheet to assign role, role scope, and contexts before approving, or to decline with a confirmation dialog. The section is admin-only and hidden when there are no pending requests.

- 134884f: **"Enable Google Sheets" checklist group for onboarding**

  Users whose `onboarding.use_case` contains `sync_dwh_sheets` or `import_external_sheets` now see a dedicated "Enable Google Sheets" group in the Setup Checklist instead of the generic "Get data to your report" group. Three steps: create a Google Sheets Destination, install the Extension, and create and run a report from it. The group is non-blocking and auto-updates as users complete each step.

- c520e17: **Stricter OAuth credential checks when creating Destinations**

  Creating a Google Sheets destination with a pre-existing `credentialId` now enforces two checks already present on destination updates:
  - **Project ownership** — the credential must belong to the same project. Cross-project references are rejected with `403 Forbidden — Credential does not belong to this project`.
  - **Copy permission** — if the credential is already linked to another destination, the caller must have copy-credentials access on that destination. Without it, the request is rejected with `403 Forbidden — You do not have permission to copy credentials from this destination`.

  Legitimate flows are unaffected — a fresh `credentialId` returned by the OAuth callback is not yet linked to any destination and passes both checks transparently.

- 31ae838: **Clarified Microsoft Ads account and customer ID fields**

  Docs and in-product field tips now explicitly state that Account ID and Customer ID must be the numeric API identifiers from the `aid` and `cid` URL parameters, not the alphanumeric numbers shown elsewhere in the Microsoft Ads UI.

- dcd4b55: # **Bug fixes and improvements**
  - dcd4b55: Fixed Business Owner assignment reducing a Technical User's access. A Technical User tagged as Business Owner of a Data Mart that was _Available for maintenance_ lost Edit, Delete, and Manage Triggers — actions they would have had as a non-owner Technical User. Permissions now combine two paths: an ownership floor (always guarantees See + Use for any owner) and the non-owner sharing path (role-based maintenance actions). Context and role scope still apply to maintenance actions: a member with `Selected contexts only` scope needs a context overlap with the Data Mart for maintenance access. Business Users assigned as Business Owner are unchanged — they still receive See + Use only, as the Business User role does not permit Data Mart maintenance.
  - ce7d14d: Fixed empty Data Mart titles when emoji or special characters are entered — users now see a clear message that these characters are not supported for Legacy BigQuery storage.
  - ce7d14d: Fixed unexpected delay when loading Destinations in the Extension; hidden reporting fields no longer appear in the column picker; improved empty state for new users.
  - da6e5f0: Fixed ambiguous column errors in blended report filters and sorting — WHERE and ORDER BY clauses now qualify every reference with the correct CTE alias (`main.<col>` for native columns, `<subsidiary>.<alias>` for blended fields). Fixed duplicate CTE names when two relationships shared the same `targetAlias` — CTE names are now derived from the full `aliasPath` (dots → underscores) to guarantee uniqueness.
  - d0f5455: Fixed React SVG attribute warnings in Microsoft Teams and Azure Synapse icon components.
  - c9f5bea: Fixed project notification settings endpoints (`projects/:projectId/notification-settings*`) accepting a caller-controlled project ID — an authenticated user could previously read or modify another project's notification configuration.

### Patch Changes 0.26.0

- @owox/internal-helpers@0.26.0
- @owox/idp-protocol@0.26.0
- @owox/idp-better-auth@0.26.0
- @owox/idp-owox-better-auth@0.26.0
- @owox/backend@0.26.0
- @owox/web@0.26.0

## 0.25.0

### Minor Changes 0.25.0

![OWOX Data Marts – v0.25.0](https://github.com/user-attachments/assets/0e0800ac-f404-4986-a66b-53603cfd6e02)

- 9bb6393: **AI helper for Data Mart metadata**

  A Sparkles ✨ button appears next to title, description, field alias, and field description inputs. Click it to get an AI-generated draft grounded in the Data Mart's schema and up to 30 sample rows. Nothing is saved until you explicitly apply the suggestion.
  - Bulk fill available via **Generate field descriptions** and **Generate field aliases** next to _Refresh schema_ — populates the whole Output Schema at once for review before saving.
  - Available for SQL, Table, View, and Table Pattern definitions. Connector-based Data Marts are not yet supported.
  - Self-hosted deployments: set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in the environment to enable the buttons.

- 480a3be: **Bulk import of Data Marts from BigQuery**

  A new **Import…** button on the Data Marts page opens a picker that lists every table and view in the selected BigQuery storage. Select up to 20 resources and click **Create** — each becomes its own Data Mart named after the resource. Sharded tables (e.g. `events_20240101`, `events_20240102`) are recognized automatically and shown as a single `events_*` entry that creates a Table Pattern Data Mart. If the storage has broken credentials, the dialog explains what's wrong and offers a one-click shortcut to finish setup.

- 9e5e3e0: **Google Sheets export preserves column layout and side-by-side formulas**

  Refreshing an OWOX → Google Sheets report no longer wipes the entire tab. The exporter only touches the cells it owns, so anything else in the same sheet — extra columns, formulas, pivot tables, charts, named ranges — stays intact across refreshes.
  - Your column order wins. Reordering columns in the Output Schema after the first refresh no longer rearranges the sheet.
  - New SQL columns are appended on the right; removed columns disappear cleanly and leave a `#REF!` signal on any formula that depended on them.
  - Formulas in the first data row are automatically filled down across all new rows.
  - Output Schema aliases update the sheet header without rewriting the whole tab.
  - A failed refresh no longer wipes existing data — the sheet stays as last seen and the Data Mart status flips to "failed".

- da9bd7e: **Output controls per report — filters, sort, and row limit**

  A new **Output controls** panel in the Report Columns picker lets you shape what each report writes to its destination without changing the underlying Data Mart.
  - **Filters** apply WHERE-style conditions on the final SELECT. Multiple filters on the same column are combined with `AND`. Filtering by a column not selected for output is supported.
  - **Sort** orders output by one or more columns with `asc`/`desc` per column; drag to reorder priorities.
  - **Limit** caps the number of rows written. Leave empty for no limit.
  - Filter values are passed as named parameters (`@p0`, `@p1`, …), not inlined SQL.
  - Currently supported on BigQuery. Athena, Redshift, Snowflake, and Databricks will return a clear capability error until their adapters land.

- 814790c: **Report runs and trigger management for all Data Mart viewers**

  Manual report runs and Report Trigger CRUD are now available to any project member who can see the Data Mart and use the Destination — not just the Report owner. Report config editing (columns, filters, owners, destination) remains restricted to owners with an effective Destination.

- 99acce6: **New Data Marts, Storages, and Destinations are available by default**

  Newly created entities now default to `Available for reporting / use = ON`, so other project members can see them immediately. The `Available for maintenance` toggle still defaults to OFF. Existing entities are not migrated.

- 8cb62c9: **Improved BigQuery location search and grouping**

  Country names are now included in every location label (e.g. "Saudi Arabia" resolves to `me-central2 Dammam`). The catch-all "Other" group is replaced with dedicated Middle East, South America, and Africa groups. Three previously missing regions added: `northamerica-south1` (Querétaro, Mexico), `us-south1` (Dallas, United States), `europe-west10` (Berlin, Germany).

- 68ff850: **Looker Studio destination renamed to Data Studio**

  Renamed consistently across the destination type dropdown, availability toggle, report cards, run history, sidebar help menu, setup checklist, and notification labels. Existing configurations and dashboards are unaffected.

- a147210: **Storage picker button integrated into input field**

  The table/view picker button now appears inside the Fully Qualified Name input rather than next to it. Shows "Select…" with a database icon when empty; collapses to an icon-only button with "Change selection" tooltip when a value is set.

- 3d3c8d3: **Contextual promo and health UX for bulk Data Mart creation**

  When exactly one BigQuery Data Mart is configured, users now see a prompt to bulk-create Data Marts from existing tables and views. Resource browsers in storage pickers now show a health-state block instead of raw loading errors when the selected storage is not fully configured.

- 118e029: **Google Sheets promo and Email Reports owners column**

  Published Data Marts without a Google Sheets destination now show a contextual promo with a direct CTA to create one. Email Reports table now displays report owners as an avatar group.

- c2099e1: **"New Report" and "New Trigger" labels and empty states**

  Button labels standardized to "New Report" and "New Trigger" across the app. Empty states for destinations now show a prominent "New Report" button directly in place. Google Sheets destination empty state includes suggestions to invite teammates.

- 0cbca4d: **Report creation button enabled as soon as all fields are valid**

  The "Create & Run report" button no longer requires manually editing the default title to become active. It enables as soon as all required fields are filled.

- 661b280: **Data Mart table navigation and dialog improvements**
  - Cmd/Ctrl+Click on a Data Mart row opens it in a new tab.
  - Long Data Mart and report titles in delete dialogs now wrap correctly.
  - Sticky action cells no longer show a transparent background during scroll.

- f717600: **Accessibility and dark mode improvements**

  Extracted reusable `TableSelectionCheckbox` component used across all tables. Added `id`/`htmlFor` label associations to Switch components. Enabled sorting by Contexts column in Data Mart, Storage, and Destination tables. Fixed dark mode styles for health status ring indicators.

- 262a9c0: # **Bug fixes and improvements**
  - 262a9c0: Fixed wrong Input Source shown in the Data Marts list — the mismatch appeared when any Data Mart in the list had multiple owners or contexts assigned.
  - 4172cb7: Fixed incorrect column types and aggregations for blended fields from joined Data Marts in Looker Studio. `COUNT`/`COUNT_DISTINCT` now appear as numeric metrics; `STRING_AGG`/`ANY_VALUE` as dimensions; `MIN`/`MAX`/`SUM` use the correct matching aggregation. Fix applies across BigQuery, Snowflake, Redshift, Athena, and Databricks.

### Patch Changes 0.25.0

- @owox/internal-helpers@0.25.0
- @owox/idp-protocol@0.25.0
- @owox/idp-better-auth@0.25.0
- @owox/idp-owox-better-auth@0.25.0
- @owox/backend@0.25.0
- @owox/web@0.25.0

## 0.24.0

### Minor Changes 0.24.0

![OWOX Data Marts – v0.24.0](https://github.com/user-attachments/assets/1147e6ca-26c6-41ad-b6ba-b2d1bf4f632c)

- b335552: **Joinable Data Marts and joined reports**

  Data Marts can now be connected to each other, and reports can combine fields from several joined Data Marts in a single output.

  On a Data Mart's **Data Setup** tab, the new **Joinable Data Marts** block lets you add joinable Data Marts, configure join conditions, choose which fields each joined Data Mart exposes, and override their aliases or aggregations. When editing a Google Sheets, Looker Studio, or Email report, the **Report Columns** picker now shows fields from the base Data Mart together with fields from all joined Data Marts. The generated SQL is available for inspection, and any joined report can be saved as a standalone Data Mart.

  Supported on BigQuery, Snowflake, Redshift, Athena, and Databricks.

- d187cdf: **Project contexts and role scope**

  Added business-domain Contexts and per-member Role Scope to narrow what shared resources a non-owner can see.
  - Admins define Contexts in Project Settings, attach them to Data Marts, Storages, and Destinations, and pick between `Entire project` and `Selected contexts` for each member.
  - Owners and admins are never gated by Contexts.
  - Introduced a unified **Project Settings** page (Overview, Members, Contexts, Credit consumption, Subscription, Notification) that replaces the separate Members page.

- e817c93: **Setup checklist for guided onboarding**

  Added a **Setup Checklist** that guides new users through the key steps required to start working with the product. Each step includes a direct call to action, the checklist tracks progress in real time, and steps are grouped into logical stages.

- c669d11: **OAuth for LinkedIn Ads and LinkedIn Pages**

  Added OAuth authorization flow for both LinkedIn connectors, including UI login, callback handling, credential exchange, and token-backed execution. Existing LinkedIn configurations are migrated to the OAuth2 structure with compatibility for previously saved settings.

- ba44a8d: **Table and view browser for BigQuery Data Marts**

  A new **Fill from Storage** button lets you browse available tables and views through a `project → dataset → table` hierarchy. Selecting a table or view automatically fills the Fully Qualified Name field. Manual entry remains available as an alternative.

- d118b10: **Improved Data Mart publishing experience**
  - Data starts loading automatically after publishing a connector-based Data Mart.
  - Guidance now focuses on scheduling automatic updates instead of manual runs.
  - Promo messages appear only once.
  - Updated button labels and tooltips for better clarity.

- 3f8b831: **Data Mart page layout and table usability improvements**
  - Sticky actions column keeps row actions always visible during horizontal scroll.
  - Row actions are emphasized on hover to reduce visual noise.
  - Long values (including strings without spaces) now wrap correctly in tables and titles.
  - Refined layout behavior across different screen sizes.
  - Scrollable tabs now show a gradient fade indicator at the edge to signal hidden overflow.

- d8e7e84: **Project Settings documentation**

  New documentation section covering members, roles, and resource access. Includes three pages: Members Management, Roles and Permissions, and Ownership and Availability (with per-entity access tables for Storage, Data Mart, Destination, Report, and their Triggers).

- ba44a8d: **Enhanced security headers**

  Improved HTTP security headers now apply automatically to all application pages and authentication screens: Content Security Policy against clickjacking, Strict Transport Security for HTTPS enforcement, XSS and content-type protection, and referrer policy controls.

- ba44a8d: **Improved BigQuery configuration validation**

  Invalid project ID values are now caught immediately when saving OAuth-authenticated BigQuery storages, with clear error messages to correct typos or formatting issues before they cause runtime errors.

- 160574a: # **Bug fixes and improvements**
  - 160574a: Unconfigured storages now show a grey health indicator with the message "Complete setup to activate Storage" instead of a red one. Red is reserved for storages that have been configured but fail validation.
  - 50366c4: Fixed `campaign_id` and `adgroup_id` fields in `tiktok_ads_ad_insights` — both were always `null` due to missing parent-hierarchy IDs in the API request. Both fields are now correctly populated.

### Patch Changes 0.24.0

- @owox/internal-helpers@0.24.0
- @owox/idp-protocol@0.24.0
- @owox/idp-better-auth@0.24.0
- @owox/idp-owox-better-auth@0.24.0
- @owox/backend@0.24.0
- @owox/web@0.24.0

## 0.23.0

### Minor Changes 0.23.0

![OWOX Data Marts – v0.23.0](https://github.com/user-attachments/assets/8bfad6e5-a8cc-4859-8de6-7be54d5f3a83)

- d8b82e5: **Ownership foundations**

  Ownership is now explicit and visible across all major entities. This is the first stage of the Permissions Model Evolution — ownership is informational only and does not affect access control.
  - Data Mart has **separate Technical Owner and Business Owner**, editable on the Overview tab.
  - Storage, Destination, and Report **each have an Owners list**, editable in the configuration sheet and saved together with the entity.
  - **Creator is auto-assigned** as owner when a new entity is created.
  - **Owners column** is displayed in Storage, Destination, and Report list tables.
  - **Filter by owner** is available in Data Marts, Storages, and Destinations lists.
  - **"Not assigned" state** is shown when an entity has no owners.

- 11c0c77: **Availability model and owner-based access control**

  Introduced explicit availability settings for DataMarts, Storages, and Destinations (`Available for reporting / Available for maintenance` and `Available for use / Available for maintenance`). Ownership now affects access: owners have direct access to their entities regardless of availability state, while non-owners see only available entities.
  - Implemented table-driven `AccessDecisionService` that evaluates entity type, role, ownership status, availability state, and action for every single-entity operation.
  - Enforced access checks on all endpoints including direct URL access, sub-operations (SQL dry run, validate definition, run history), and report creation.
  - Existing entities default to fully available for backward compatibility; new entities default to not available (secure by default).

- 11c0c77: **Extended role definitions and report ownership**

  Reinterpreted existing project roles without changing stored identifiers: Viewer becomes Business User with self-service reporting capabilities, Editor becomes Technical User with full technical maintenance access.
  - Business Users can now create, edit, delete, and run their own Reports and manage Report Triggers.
  - Business Users can also create, edit, and delete Destinations.
  - Technical Users retain project-wide Report management.
  - Implemented ineffective owner logic: if a Report owner loses access to the DataMart or Destination, they become read-only until access is restored.

- 004b9a5: **Invite teammates from setup screens**

  Added contextual "Invite teammates" helper blocks to setup and empty state screens. Includes a reusable component with responsive layout and optional documentation link.

- 0f07594: **Auto-select the only storage when creating a Data Mart**

  When creating a Data Mart, if the project has only one storage, that storage is now selected automatically.

- 870de85: **Geographic performance reports for Google Ads connector**

  Added `Geo Stats` and `Geo Target Constants` nodes to the Google Ads connector. The two tables are designed to be joined in BigQuery on `country_criterion_id`.

- 4033235: **X Ads: country breakdown for ad stats**

  Added `stats_by_country` node for daily ad stats broken down by country. A companion `targeting_locations` reference table maps X Ads location IDs to country names and ISO codes — join on the `country` field.

- 15390c6: **Progressive save for Facebook Ads data**

  Data is now saved to BigQuery page by page. A failure only affects the remaining pages, not the entire dataset.

- 126280a: # **Bug fixes and improvements**
  - 126280a: **Fixed empty error** text for invalid storage status — now shows "Access validation failed" instead of a blank space.
  - a848ac4: **Fixed Storage column sorting** on the Data Marts page — storages with custom names now sort correctly by their visible name.
  - 832bb73: **Error boundaries for unexpected application crashes**. Replaced the default React error screen with a user-friendly fallback UI. The sidebar stays visible for in-layout errors so users can navigate away without a full page reload.

### Patch Changes 0.23.0

- @owox/internal-helpers@0.23.0
- @owox/idp-protocol@0.23.0
- @owox/idp-better-auth@0.23.0
- @owox/idp-owox-better-auth@0.23.0
- @owox/backend@0.23.0
- @owox/web@0.23.0

## 0.22.0

### Minor Changes 0.22.0

![OWOX Data Marts – v0.22.0](https://github.com/user-attachments/assets/dcd8ad37-7feb-4cc1-b8f8-a3309d9ee1c2)

- 4c9b96d: # **Business Owner & Technical Owner** for Data Marts

  Assign Business and Technical Owners to each Data Mart to track accountability and maintainability.
  - **Owners section** on the Data Mart edit page — assign one or more project members per role via an inline selector.
  - **Search and role display** — the member selector shows each user's project role with a search input for quick filtering.
  - **Outbound member warnings** — previously assigned owners who have been removed from the project are shown with a warning icon for easy reassignment.
  - **Business Owner and Technical Owner columns** in the Data Marts list table (hidden by default — enable via column settings).
  - **Filter by owner** in the Data Marts list to quickly find data marts by a specific team member.
  - **Auto-assigned Technical Owner** — the creator is automatically set as Technical Owner when a new Data Mart is created.

- b178723: # **Created By** visibility across major entities

  See who created each entity directly in the list views.
  - **Created By column** is now available in Data Storages, Data Destinations, Reports, Scheduled Triggers, and Insights tables.
  - **Filter by creator** is available in Data Destinations and Data Storages lists.

- 85abd92: # **Trigger-based execution** for connector and report runs

  Connector and report runs are now processed through a task queue instead of running immediately in the background. This improves reliability by ensuring runs are not lost on server restart, adds per-project concurrency limits, and automatically retries runs that cannot start due to concurrency limits. Includes a safety mechanism to detect and fail runs stuck in the queue for too long.

- 2406874: # **Onboarding video** for Email-based Reports

  A new onboarding video to improve adoption of Email-based Reports in Data Marts.
  - Shown once to new users on the **Destinations** tab in Data Mart.
  - Available in **Help menu → Video tutorials**.
  - Embedded in **Email Reports documentation**.

- 9395757: # **Sign In page** redesign with product-focused brand panel

  Redesigned the auth screen to better communicate product value and reduce sign-in friction.
  - **Brand panel** — replaced placeholder with a carousel of product use cases (Google Sheets, Looker Studio, Email delivery).
  - **Headline** — "Build once. Share anywhere." with outcome-driven copy and short supporting text per slide.
  - **Product preview** — visual workflows introduced directly on the auth screen.
  - **Carousel** — auto-rotation with lazy-loaded images.

- 737f292: # **Externalized connector secrets** from Data Mart definitions

  Non-OAuth secrets are moved from inline storage in Data Mart definitions to a separate `connector_source_credentials` table. Centralizes credential storage and reduces secret exposure in definition JSONs.
  - Added `_secrets_id` reference pattern (aligned with existing `_source_credential_id` for OAuth).
  - Secrets are extracted on save and injected during connector execution.
  - Includes data migration for existing Data Marts.

- a258b72: # **Improved UX for setting triggers**

  Reduced friction in the trigger setup flow: smart default type based on Data Mart configuration, improved empty state with a CTA button, and one-click schedule presets (Daily 9:00, Every hour, Every 6h, Weekdays 9:00).

- 2399254: # **Searchable Storage Selector** in Data Mart form

  The storage picker in the Create Data Mart form is upgraded to a searchable combobox.
  - Storages are listed in **alphabetical order** by title.
  - **Typeahead search** filters the list by typing — useful when many storages exist.
  - **Create new storage** option remains accessible at the bottom of the list.

- 62f435a: # **Auto-subscribe new project members** to notification settings

  New team members with Admin or Editor roles are automatically subscribed to existing notification settings when joining a project. Members who leave and rejoin are re-subscribed automatically. Manual unsubscribes are respected and not overridden. Members downgraded to Viewer are automatically removed from the receivers list.

- 6d53e58: # **Bug fixes and improvements**
  - **Connector definition validation** — fixed validators to allow early validation success; connector definitions no longer require credential validation during publish, resolving failures for Athena, BigQuery, Databricks, Redshift, and Snowflake.
  - **Delete confirmation dialog** — fixed undefined Data Mart title; dialog now correctly displays the actual data mart name.
  - **Edit button in oneOf config** — secret editing state is now tracked per-field, preventing unintended resets of sibling fields and auth type switches.

### Patch Changes 0.22.0

- @owox/internal-helpers@0.22.0
- @owox/idp-protocol@0.22.0
- @owox/idp-better-auth@0.22.0
- @owox/idp-owox-better-auth@0.22.0
- @owox/backend@0.22.0
- @owox/web@0.22.0

## 0.21.1

### Patch Changes 0.21.1

- b3befb4: # Fixed build failure issue

  Fixed build error caused by ESLint configuration issue

## 0.21.0

### Minor Changes 0.21.0

![OWOX Data Marts – v0.21.0](https://github.com/user-attachments/assets/01f4ddd8-5eb0-4407-8ba2-07dcc5cf9946)

- 7494cd6: # Introducing reusable **Insights with AI assistance**

  Insights is now available in OWOX! Use it to analyze your data mart results directly — create reports, explore your data, and share findings with your team. To get started, check out the [Insights setup guide](../../docs/getting-started/setup-guide/insights.md).

- a7bbb8c: # Add **OAuth for Google Ads** connector

  Added OAuth2 authentication flow for Google Ads connector. Users can now authorize access using a "Sign in with Google" button instead of manually entering RefreshToken, ClientId, and ClientSecret. The DeveloperToken is managed via environment variable and stored securely with other OAuth credentials. Also fixed a COOP SecurityError in the OAuth popup polling that affected all OAuth connectors.

- d906258: # Add **"Copy Credentials" button** to Storage and Destination

  Added a "Copy Credentials" button to Storage and Destination edit forms, allowing users to copy credential configuration from other storages or destinations of the same type. Includes new backend endpoints for listing storages and destinations by type with credential identity information.

- e68ca61: # **Improve Data Mart publish** status message

  The publish status message for data marts has been improved to provide more clarity and actionable information.
  - **Publish after:** The publish status message now shows what you need to do to publish the data mart. For example, if you need to complete storage configuration or configure an input source.
  - **Ready to publish:** The publish status message now shows that the data mart is ready to publish.

- cb57600: # Add **video tutorials** about completing storage setup and insights

  In the Help menu, we added two new video tutorials:
  - how to complete the Google BigQuery (used in OWOX extension) storage setup to publish Data Marts from OWOX Reports (Google Sheets extension)
  - how to get started with Insights

- 27e5af8: # **AWS Athena storage descriptions**

  Added support for column descriptions (comments) in AWS Athena storage and Output Schema.

- 90b7ee7: # Implement **destination name validation** for all data storage types

  Implements comprehensive destination name validation for `CONNECTOR` and `TABLE` definition types across BigQuery, Snowflake, Athena, Redshift, and Databricks. This update strengthens security by preventing malformed table names and ensuring all storage configurations are properly validated before processing.

- 1a7b5f8: # Improve form UI with **collapsible sections**

  This update introduces collapsible sections in forms to make configuration flows easier to complete. Less important or advanced settings can now be hidden by default, allowing users to focus on the most important fields first. For example, this approach can help when configuring storages that are automatically created during [integration](../../docs/getting-started/setup-guide/extension-data-marts.md) with the OWOX Reports extension for Google Sheets.

  The interaction follows the same collapsible pattern used in wizard screens, keeping the experience consistent across the product. Existing forms remain unchanged and continue to appear expanded by default.

- 6f1f61a: # Show **storage health status** in the configuration form

  This update improves visibility of the storage connection status when configuring a Data Storage. Users can now see whether the storage access is valid directly in the General section of the configuration form. This provides immediate feedback that the storage is correctly configured and ready to be used by Data Marts. This makes the setup experience clearer and helps users configure their storage with more confidence.

  **Benefits:**
  - Instantly understand if the storage connection is working
  - Quickly detect configuration issues
  - Maintain a consistent status indicator between the Data Storage list and the configuration form

- 7494cd6: # **Bug fixes and improvements**
  - Fix data storage validation for Google Legacy BigQuery connector
  - Fix missing dependencies for data destination and storage forms to avoid errors
  - Fix duplicate trigger runs caused by MySQL deadlocks not being handled as transient errors
  - Fix Google BigQuery storage not saving OAuth credentials and blocking OAuth-authenticated users from saving storage settings
  - Fix field descriptions and primary key flags being lost after schema sync in Redshift and Snowflake data marts

### Patch Changes 0.21.0

- @owox/internal-helpers@0.21.0
- @owox/idp-protocol@0.21.0
- @owox/idp-better-auth@0.21.0
- @owox/idp-owox-better-auth@0.21.0
- @owox/backend@0.21.0
- @owox/web@0.21.0

## 0.20.0

### Minor Changes 0.20.0

![OWOX Data Marts – v0.20.0](https://github.com/user-attachments/assets/22f124c9-ab12-4666-ba13-bb9926e145d4)

- cc5553d: # **New Sign Up options**: Email/Password and Microsoft Authentication in the Cloud edition on app.owox.com

  Users can now sign up using their email and password, or through Microsoft account integration for seamless access.

- 55ecd48: # **Table Filters** for Data Marts and Data Storages

  We’ve overhauled the table filtering experience to help you navigate large datasets with precision and speed:
  - Filter with logical conditions (Is / Is not / Contains / Does not contain)
  - Persistent filter states
  - Shareable, deep-linked views
  - At-a-glance status

- 800ec3c: # **Data table support** in email-based report templates

  You can now embed data mart results as a Markdown table in your email-based reports using the `{{table}}` tag with optional parameters.

- b88510a: # Add **Microsoft Ads OAuth** Integration
  - Implemented OAuth2 authentication flow for the Microsoft Ads connector to support secure, long-lived access.
  - Added frontend components (`MicrosoftLoginButton` and callback routing) to handle the user authorization process.
  - Updated the backend source configuration to parse and validate `AuthType` with Client ID, Client Secret, and Refresh Token.
  - Implemented `exchangeOauthCredentials` and automatic token refreshing (`getAccessToken`) using the `offline_access` scope for persistent background data fetching.
  - Created database migrations to support storing the new `AuthType` JSON configuration for Microsoft Ads datamarts.

- 8b935a2: # **Google OAuth authentication** for BigQuery and Google Sheets

  BigQuery storages (including Legacy BigQuery) and Google Sheets destinations now support Google OAuth as an alternative to service account JSON. Users can connect their Google account directly via an OAuth button in the settings form and switch between authentication methods at any time.

- 01e6516: # Upgrade API Version in **Facebook Marketing Connector to v25.0**

  Updated all Facebook Graph API / Marketing API endpoints from `v23.0` to `v25.0` across the Facebook Marketing connector.

- 089e45b: # Facebook Marketing **API Page Limit**

  Added a user-configurable `Limit` parameter to the Facebook Marketing source to control API page size, helping resolve 'reduce the amount of data' errors for specific ad accounts.

- cc5553d: # **Adaptive input for SQL Query**

  The SQL Query block has been made more convenient for use on small screens. The ability to control the size of the block has been added.

- a03a952: # **TikTok Ads Country Dimension**

  Added `country_code` dimension to TikTok Ads connector with a new `ad_insights_by_country` node to support geographic breakdown in reporting.

- d141171: # Add data mart **link to Google Sheets metadata notes**

  Google Sheets exports now include a link to your data mart in the cell note (A1). The link takes you directly to the data mart page for quick access.

- aec648d: # **AWS Redshift Storage UI improvements**

  Moved the "Database Name" field after connection type selection to match the natural AWS Console lookup order.

- 9198b94: # **Sort runs in notification emails** by time (newest first)

  Previously, runs in notification emails appeared in the order they were added to the queue, which could result in non-chronological ordering (e.g., 2:48, 3:02, 3:03). Now runs are sorted by finished time in descending order, so the most recent runs appear first.

- c7cff50: # **Fix string timestamp** handling in Snowflake storage
  - Added support for ISO 8601 string values in TIMESTAMP and DATETIME columns
  - String timestamps are now parsed and formatted to `YYYY-MM-DD HH:MM:SS` before being written to Snowflake
  - Invalid timestamp strings fall back to the existing special-character obfuscation path

### Patch Changes 0.20.0

- @owox/internal-helpers@0.20.0
- @owox/idp-protocol@0.20.0
- @owox/idp-better-auth@0.20.0
- @owox/idp-owox-better-auth@0.20.0
- @owox/backend@0.20.0
- @owox/web@0.20.0

## 0.19.0

### Minor Changes 0.19.0

![OWOX Data Marts – v0.19.0](https://github.com/user-attachments/assets/fb0a4e77-4334-43dd-b5a4-d9582086fc9c)

- 2ab606c: # Add email and webhook notifications for Data Mart runs

  Add notification settings per project with support for email and webhook channels. Notifications are grouped by a configurable delay window and sent automatically when Data Mart runs fail or succeed. Settings are created automatically on the first run of a project.

- a23ec87: # Add batch publish action for draft data marts

  Add the ability to publish multiple draft data marts at once from the list page.

- 6e25a0a: # Add health status indicator for data storages

  Display a live access-validation indicator (colored dot with details on hover) for each configured data storage — both in the storages list and in the storage selector when creating a new data mart.

- 465891c: # Show data mart counts by status on the data storages list

  Show separate counts for published and draft data marts in the data storages list.

- 465891c: # Publish data storage drafts

  Add a publish drafts action for data storages with confirmation and result toasts.

- ee89c84: # Show actual error details when Google Sheets access check fails

  Previously, when Google Sheets API access validation failed, the error message always displayed a generic "Access check failed" text. Now the actual error message from the Google Sheets API is shown, making it easier to understand and fix the issue.

- ee89c84: # Add direct table link for AWS Redshift storages

  Add a direct link to the AWS Redshift Query Editor v2 console from the Data Mart's input source. After the clicking to the table name opens the SQL Workbench for the configured AWS region, similar to the existing console links for BigQuery, Athena, and Snowflake.

- 2f61b9b: # Fix Athena MaxResults exceeding API limit of 1000

  Cap `MaxResults` parameter to 1000 in Athena `getQueryResults` to comply with the AWS Athena API limit. Previously, callers could pass values greater than 1000 (e.g., streaming batch size of 5000), causing `InvalidRequestException` errors.

- ee89c84: # Fix LinkedIn Ads field type definitions
  - Fix `runSchedule` field in campaign schema: remove duplicate entry and set correct type to `OBJECT` instead of `NUMBER`
  - Fix `id` fields in account, campaign, and campaign group schemas to use `STRING` type matching the LinkedIn API
  - Fix `dateRangeStart` and `dateRangeEnd` fields in analytics schema to use `DATE` type for proper date handling and BigQuery partitioning

- 807c16d: # Fix Looker Studio connector requests with forFilterOnly fields

  Remove incorrect `forFilterOnly` exclusion in `getRequestedFieldNames` to ensure all requested fields are returned in the connector data response.

- ee89c84: # Update Snowflake storage configuration form
  - Rename "Username & Password" authentication method to "Username & PAT" across the Snowflake setup form and all help descriptions
  - Update help text and security tips to reference Programmatic Access Tokens (PAT) instead of password
  - Update warehouse navigation instructions to match the current Snowflake UI

### Patch Changes 0.19.0

- @owox/internal-helpers@0.19.0
- @owox/idp-protocol@0.19.0
- @owox/idp-better-auth@0.19.0
- @owox/idp-owox-better-auth@0.19.0
- @owox/idp-owox@0.19.0
- @owox/backend@0.19.0
- @owox/web@0.19.0

## 0.18.0

### Minor Changes 0.18.0

![OWOX Data Marts – v0.18.0](https://github.com/user-attachments/assets/8053b97b-a659-440a-8b43-ed865fb7f315)

- 68d72af: # Add Databricks storage type with Personal Access Token authentication

  This change adds support for Databricks as a new storage type in OWOX Data Marts platform. Users can now connect to Databricks SQL warehouses using Personal Access Token authentication.
  - **Authentication:** Personal Access Token
  - **Storage Configuration:** Host, HTTP Path
  - **Driver:** @databricks/sql

- ee0459e: # Add OAuth flow for TikTok Ads connector
  - Added support for OAuth2 authentication in the TikTok Ads connector
  - Implemented OAuth credential exchange
  - Added TikTok login button UI component for OAuth flow
  - Added OAuth callback page for handling TikTok authorization redirect
  - Manual credential entry option remains available as fallback

- 38d3593: # Improved Looker Studio destination stability

  Enhanced Looker Studio destination stability and performance by implementing data streaming. This update ensures a smoother user experience and more reliable delivery of large datasets from Data Marts.

- 38d3593: # Descriptions for fields in AWS Redshift tables

  After launching the connector, field descriptions will be synchronized with tables in Redshift

- f52376f: # Enrich Facebook Marketing ad-account/ads endpoint

  The Facebook Marketing connector's `ad-account/ads` endpoint now returns real ad data instead of null values.

  **What's New:**
  - Added 19 useful fields including ad name, status, campaign/adset relationships, creative details, and timestamps
  - 8 essential fields are now pre-selected by default (id, name, status, effective_status, adset_id, campaign_id, created_time, updated_time)

  **Before:** Only 3 placeholder fields that returned null
  **After:** Comprehensive ad data ready for analytics

  **Note:** For performance metrics (impressions, clicks, spend), continue using the `ad-account/insights` endpoint.

- bcf4b10: # Fix Snowflake data mart schema derivation to properly handle queries with LIMIT clauses by wrapping them in subqueries instead of naive concatenation

  Enhanced Snowflake data mart schema derivation to properly handle queries with LIMIT clauses by wrapping them in subqueries instead of naive concatenation. This ensures that the schema is derived correctly even when the query contains a LIMIT clause.

- 997fcba: # Update Snowflake storage UI to use PAT terminology

  Updated the Snowflake storage settings interface to refer to "PAT (Programmatic Access Token)" instead of "Password" to align with Snowflake's current terminology.

  **This is a visual change only.** Your existing configurations remain unchanged, and **no action is required on your part**. Everything will continue to work as before.

### Patch Changes 0.18.0

- @owox/internal-helpers@0.18.0
- @owox/idp-protocol@0.18.0
- @owox/idp-better-auth@0.18.0
- @owox/idp-owox@0.18.0
- @owox/backend@0.18.0
- @owox/web@0.18.0

## 0.17.0

### Minor Changes 0.17.0

![OWOX Data Marts – v0.15.0](https://github.com/user-attachments/assets/5c46cc11-5282-41d5-b20f-ddcc74a3d47a)

- bfdbc6b: # **Insights** feature is now available for all projects in the cloud version

  Users can now try out the new Insights functionality and share their feedback.

- 3283bcd: # Insights: Improved permission handling and read-only mode

  We've enhanced how permissions work within Insights to provide a more seamless and informative experience.
  - **Read-only state**: You can now view Insights in a read-only mode when you don't have edit permissions.
  - **Action enforcement**: Buttons and actions (like editing or deleting) are now properly disabled based on your access level.
  - **Better feedback**: New tooltips and messages explain why certain actions are restricted, helping you understand your permission levels at a glance.

- 51a9bdd: # Added instant **health status indicators** to the Data Marts list

  Improved Data Marts list with instant health status indicators and automatic prefetching of recent run data, making it easier to monitor Data Mart health at a glance.
  - **Color-coded health status indicators** for each Data Mart
    (success, failure, mixed results, in progress, or no recent runs)
  - **Draft Data Marts** clearly communicate that publishing is required before runs are available
  - **Automatic prefetching** of run statuses for visible rows — no waiting, no hover-to-load surprises
  - **Helpful hover details** with recent run info and a quick path to full Run History

- d15a3c4: # Fix bugs in Data Mart **"Run History" tab**

  Fixed bugs that users may have encountered in the Data Mart "Run History" tab, namely:
  - Unexpected visual effects when clicking the "Load More" button.
  - Automatic deletion of run items that were loaded via the "Load More" button, and displaying only the last 20 runs.

- c10c3ff: # Refactor: **Standardize Data Types Across Connectors**

  Introduced centralized data type definitions and standardized type handling across all storage connectors and API references.
  - Created `Constants/DataTypes.js` with standardized type definitions (STRING, BOOLEAN, INTEGER, NUMBER, DATE, DATETIME, TIME, TIMESTAMP, ARRAY, OBJECT)
  - Updated all storage connectors (AWS Athena, AWS Redshift, Google BigQuery, Snowflake) to use standardized `DATA_TYPES` constants for type mapping
  - Refactored field definitions across all source connectors (Facebook Marketing, Google Ads, LinkedIn Ads, Microsoft Ads, Reddit Ads, TikTok Ads, X Ads, Shopify, GitHub, etc.) to use consistent data type references
  - Changed `AbstractStorage.getColumnType()` to throw an error if not implemented, enforcing proper implementation in child classes
  - Eliminated storage-specific type constants (e.g., `GoogleBigQueryType`) from API reference files where they were inappropriately used

- 7d7ddd1: # Add new fields to **Facebook Ads source** connector

  Added `cost_per_result`, `results` and `result_rate` fields to the Facebook Ad Account Insights report schema, allowing for better cost efficiency analysis.

- dad1fd2: # Feat: Add default fields for Microsoft Ads

  We've improved the **Microsoft Ads** connector to help you set up reports faster.

  Now, when you select the **User Location Performance Report** or **Campaigns**, we automatically pre-select common useful fields (like _Impressions_, _Clicks_, _Spend_) so you don't have to search for them.
  - **Convenient:** Standardization of commonly used metrics.
  - **Flexible:** You can still uncheck these fields if you don't need them.

- 4d4b7e9: # Add new fields to **Shopify** orders
  - discountCodes: Array of discount code strings applied to the order
  - discountApplications: Detailed discount applications with code, amount/percentage, target type, and allocation method

- 3f381f7: # Fix: **TikTok Connecto**r Type Handling

  Fixed "Unknown type STRING" errors in the TikTok Ads connector by updating type handling to use standardized DATA_TYPES constants.

### Patch Changes 0.17.0

- @owox/internal-helpers@0.17.0
- @owox/idp-protocol@0.17.0
- @owox/idp-better-auth@0.17.0
- @owox/idp-owox@0.17.0
- @owox/backend@0.17.0
- @owox/web@0.17.0

## 0.16.0

### Minor Changes 0.16.0

![OWOX Data Marts – v0.15.0](https://github.com/user-attachments/assets/7512a17d-74ab-4c61-af83-fb0477f62882)

- 81112e2: # Floating Popovers and Help Menu for Tutorials and Support
  - Added **FloatingPopover** component with context to manage popover state
  - Added **video tutorial popovers** for Google Sheets and Looker integration
  - Implemented **HelpMenu** with dropdown functionality for quick access to help resources
  - Integrated **FloatingPopoverProvider** and HelpMenu into AppSidebar for a better user experience
  - Enhanced **Intercom integration** with launcher visibility control and payload adjustments
  - Added **popover tutorial** in EmptyDataMartsState to guide new users

- 18c2a9f: # AI-Powered Insight Creation

  Added the ability to create the first insight using AI, significantly simplifying the user's journey to start using insights functionality.

  Users can now generate intelligent, data-driven insight templates with pre-configured AI prompts tailored to their data mart structure, making it easier to discover valuable insights without manual setup.

- 8d8b75b: # AWS Redshift Storage Support

  Introduced AWS Redshift as a new data storage type with comprehensive support for both Serverless and Provisioned clusters.
  - Authentication Methods: Username/Password authentication for secure connections
  - Flexible Configuration: Support for both Redshift Serverless (workgroup-based) and Provisioned (cluster-based) deployments
  - Complete Schema Management: Added schemas, guards, and services for Redshift data mart configuration and credentials
  - Enhanced Frontend: Updated UI components to handle Redshift configuration with relevant descriptions and validation
  - Type Safety: Implemented comprehensive DTOs, mappers, and type guards for Redshift data structures
  - Full Documentation: Included detailed documentation for setting up and using the Redshift connector

  This update enables users to seamlessly connect OWOX to AWS Redshift data warehouses, expanding the platform's data storage capabilities to one of the most popular cloud data warehouse solutions.

- 7d9eb45: # Streamlined Data Mart Onboarding

  Introduced interactive "next-step" suggestions to help you set up and use your Data Marts faster. Now, after publishing or loading data, you'll get clear guidance on the best next action—like running a connector, scheduling triggers, or creating reports—ensuring a smoother transition from configuration to results.

- 09c6270: # Add direct linking for Data Storages and Destinations
  - Added support for direct links to specific Data Storages and Destinations via URL parameters, making it easier to share specific entities with others.
  - Automatically synchronizes the URL with the currently opened entity.

- 2f99ff4: # Improve pagination
  - Improved pagination on lists of Data Marts, Storages and Destinations: added customizeble page-size selector and info about selected items and pages
  - Added persistent page size support for storing and retrieving the user's preferred page size from localStorage
  - Fixed "Select all" checkbox to operate on the current page only

- 2d311f6: # Improve UX in Reports
  - added buttons for running the report and opening the Google Sheets document directly in the table row
  - changed the default action for the new report from "Create" to "Create and Run" action. It's affected Google Sheets and Email destinations

- 6940365: # Add Shopify Connector

  Added new Shopify connector with support for multiple data nodes including orders, products, customers, metafields, and more

- 469e64f: # Improved Facebook Marketing Connector Stability and Data Depth
  - **More Reliable Imports**: Fixed an issue where missing or invalid dates could interrupt data transfers. Your pipelines will now be more resilient to data inconsistencies.

- c9e7dc5: # Microsoft Ads: AccountID changes to AccountIDs

  The Microsoft Ads connector configuration field has been renamed from `AccountID` to `AccountIDs` to better reflect its capability. You can now specify multiple Account IDs (comma-separated) in a single field, allowing you to load data for several accounts using one connector instead of creating separate connectors for each account.

  Existing Microsoft Ads connectors will be automatically migrated with no action required on your part.

### Patch Changes 0.16.0

- @owox/internal-helpers@0.16.0
- @owox/idp-protocol@0.16.0
- @owox/idp-better-auth@0.16.0
- @owox/idp-owox@0.16.0
- @owox/backend@0.16.0
- @owox/web@0.16.0

## 0.15.0

### Minor Changes 0.15.0

![OWOX Data Marts – v0.15.0](https://github.com/user-attachments/assets/9c9fcaa3-9a36-403c-b57d-410aa8819277)

- 8298a39: # Improve Storage Creation UX and Interaction Safety

  The Storage creation flow is now smoother and more predictable.
  - Added click-lock protection to prevent accidental double-clicks when selecting a Storage type.
    This prevents duplicate creation requests and ensures users trigger the action only once.
  - Buttons now automatically switch to a disabled state while a new Storage is being created.
    This provides clear visual feedback and blocks unwanted interactions during processing.

  These updates improve safety, reduce friction, and help users stay in control while the system handles their request.

- Enhance Report Creation Workflow and Scheduling

  The Report creation experience has been upgraded to support immediate execution and seamless scheduling.
  - Integrated schedule triggers directly into the creation screen. This allows users to configure data delivery rules upfront, maintaining consistency with the Data Mart Triggers tab.
  - Implemented a split-action button for the creation step. Users can now choose to not only save but also immediately run the report, eliminating the need to navigate back to the list to trigger a manual run.

  These updates reduce navigation friction and unify the definition and automation steps.

- 81aedad: # Fix Report Reader for View-Defined Data Marts in BigQuery Storage

  Fixed report reader functionality for data marts defined by views in BigQuery Storage.
  - Enhanced definition type checking in BigQuery Storage report reader to properly distinguish between definition types.
  - Added explicit `definitionType` parameter validation to ensure correct handling of view-based data mart definitions in BigQuery Storage.

### Patch Changes 0.15.0

- @owox/internal-helpers@0.15.0
- @owox/idp-protocol@0.15.0
- @owox/idp-better-auth@0.15.0
- @owox/idp-owox@0.15.0
- @owox/backend@0.15.0
- @owox/web@0.15.0

## 0.14.0

### Minor Changes 0.14.0

![OWOX Data Marts – v0.14.0](https://github.com/user-attachments/assets/f56e992c-d00e-46fe-b988-ad0bc4c8a9cf)

- 30d95a8: # Fix migration error on application start with SQLite database

  Fixed an issue where users running OWOX with SQLite database could encounter errors like "SQLITE_ERROR: no such column: runType" during database migrations.

- 1c03024: # Added additional information about users in UI
  - Added display of the Data Mart creator in the Data Marts list.
  - Added display of the run initiator on the Run History tab.

- 2c636b8: # Add Snowflake support for Data Marts and Connectors

  You can now use Snowflake as a data storage destination for both Data Marts and Connectors, giving you more flexibility in how you store and manage your data.

  Snowflake Data Storage
  - Create and manage Data Marts with Snowflake as the destination
  - Configure Snowflake connections with username/password or key-pair authentication
  - Automatic schema detection and validation for Snowflake tables
  - Run SQL queries directly on your Snowflake data warehouse

  Connector Support
  - Load data from any connector directly into Snowflake tables
  - Automatic table creation and schema management
  - Support for merging and upserting data based on unique keys
  - Proper handling of Snowflake data types including VARIANT for JSON data

  Data Mart Features
  - Read data from Snowflake tables for reports and exports
  - Support for custom SQL queries as Data Mart sources
  - Schema customization with Snowflake-specific field types
  - Case-sensitive table and schema name support
  - Support Data Studio features
  - Support for AI Insights features

### Patch Changes 0.14.0

- @owox/internal-helpers@0.14.0
- @owox/idp-protocol@0.14.0
- @owox/idp-better-auth@0.14.0
- @owox/idp-owox@0.14.0
- @owox/backend@0.14.0
- @owox/web@0.14.0

## 0.13.0

### Minor Changes 0.13.0

![OWOX Data Marts – v0.13.0](https://github.com/user-attachments/assets/d25bc921-4d17-4373-921f-7045544ad2ec)

- 5adbb9f: # New: Email-based destinations

  New: Email as a data destination
  - You can now add Email as a destination and deliver reports directly to inboxes.

  New: Email report editor
  - Create and configure email-based report deliveries with a dedicated editor.
  - Compose messages using Markdown for clear, readable emails.
  - Inline descriptions help you set up destination type, message template, and sending conditions.
  - Preview and save your email delivery configuration.

  New: Slack, Microsoft Teams and Google Chat integrations added via the email channel.

  Edition-aware visibility
  - Features are shown or hidden based on your app edition to keep the UI clear and relevant.

  No breaking changes
  - This release adds new capabilities; existing flows remain unchanged.

- fc1dca7: # The creative field in the Facebook Marketing connector is no longer supported; use creative_id instead
- dc9b5ab: # Implement OAuth2 flow for Facebook Marketing connector
  - Add OAuth2 base oauth flow implementation
  - Add OAuth2 authentication option for Facebook Marketing connector
  - Implement token exchange and refresh logic
  - Store OAuth credentials securely in database
  - Add "Set up manually" option for manual token configuration

### Patch Changes 0.13.0

- @owox/internal-helpers@0.13.0
- @owox/idp-protocol@0.13.0
- @owox/idp-better-auth@0.13.0
- @owox/idp-owox@0.13.0
- @owox/backend@0.13.0
- @owox/web@0.13.0

## 0.12.0

### Minor Changes 0.12.0

![OWOX Data Marts – v0.12.0](https://github.com/user-attachments/assets/edd235e0-183b-4fde-b7bd-721c11dbe261)

- bd09d56: # Enhanced Run History: Google Sheets Reports and Looker Studio Data Fetching

  The **Run History tab now displays all Data Mart runs** in one place:
  - Google Sheets Export report runs and Looker Studio report runs are now tracked in Run History alongside Connector runs
  - Each run shows its title, connector logo or destination icon, start datetime, and trigger type (manual/scheduled)
  - Hover over start time to see detailed start/finish datetimes and execution duration
  - Added "Pending" status for queued operations
  - ☝️ All historical Runs before the update are considered manual

- ba8ca14: # Improve ConnectorEditForm with Auto-Save and Smarter DataMartDefinition Handling

  This update enhances the connector setup experience with automatic saving, improved validation, and better handling of connector configurations.
  - Added **auto-saving** for connector settings in the ConnectorEditForm
  - Introduced **safeguards for unsaved changes** to prevent data loss
  - Enabled **auto-updates** for `DataMartDefinition` upon form submission
  - Refactored related components for **clearer validation** and **smoother configuration flow**

- 5c98ca4: # Safer and Smoother Connector Editing Experience

  We’ve made it easier — and safer — to edit your connector settings.
  Now, if you make changes and try to close the form before saving, you’ll see a **confirmation dialog to prevent losing your work**.

  We’ve also simplified how configuration details are managed and improved tooltips for better clarity — so you can focus on setting up your data connections with confidence and less friction.

- e2da6ef: # Facebook Connector: Added support for nested creative fields in ad-group endpoint

  New flat fields available:
  - `creative_id` - Unique ID for the ad creative
  - `creative_name` - Name of the ad creative
  - `creative_url_tags` - UTM parameters and URL tags
  - `creative_object_story_spec` - Object story spec with page_id and other details
  - `creative_effective_object_story_id` - Page post ID used in the ad

- 66e494d: # **Fixed false error notification** about actualizing schema

  When configuring the Connector-based Data Mart, attempts to update the table schema would cause users to receive an error message in the UI that was not actually an error. For the Connector-based Data Mart, the table and schema are created on first run, so attempting to update the schema before the first run would result in an error in the UI. Now updating schema trigger checks the Data Mart type and doesn't try for these cases

- 061b00c: # Refactor connector execution architecture by removing the standalone `@owox/connector-runner` package and integrating its functionality directly into `@owox/connectors` package

  **⚠️ Breaking changes:**
  - Removed `@owox/connector-runner` package entirely
  - Moved connector execution logic to `@owox/connectors/src/connector-runner.js`
  - Migrated DTOs to `@owox/connectors/src/Core/Dto/`

  **Improvements:**
  - Simplified dependency management by consolidating connector-related packages
  - Updated connector execution service to use new DTOs and exports from connectors package
  - Removed redundant GitHub workflows for connector-runner
  - Cleaned up repository structure

- 961140b: # Remove `@kaciras/deasync` and `sync-request` dependencies and migrate to async/await

  This is a minor breaking change that removes the `@kaciras/deasync` and `sync-request` dependencies from connectors package and migrates all synchronous blocking code to modern async/await patterns.

  **Changes:**
  - Removed `@kaciras/deasync` dependency
  - Removed `sync-request` dependency
  - Removed Google Apps Script support - Only Node.js environment is now supported
  - Refactored `EnvironmentAdapter` into specialized utility classes:
    - `HttpUtils` - HTTP requests
    - `DateUtils` - Date formatting
    - `AsyncUtils` - Async delays
    - `CryptoUtils` - Cryptographic operations
    - `FileUtils` - File parsing and decompression
  - Removed `ENVIRONMENT` enum and environment detection logic
  - Updated connector documentation

- 87aed3f: # **Show Connector State in Manual Run menu**
  - In Manual Run → State Info for incremental runs, you can now view the Connector State.
  - For connectors with multiple configurations, the state is shown for each configuration with a "Created at" tooltip.
  - If no state is available, we show "No state available".
  - The state is displayed as read-only JSON with a copy option.

  This helps you quickly understand where incremental loading will continue from and simplifies troubleshooting.

- f97c4e7: # Add new Facebook Marketing insights endpoints and improve Facebook field schema filtering

  Introduced several new **Facebook Marketing API insights** endpoints with specific breakdowns:
  - `ad-account/insights-by-age-and-gender` — provides age and gender breakdowns
  - `ad-account/insights-by-device-platform` — provides device platform breakdown
  - `ad-account/insights-by-product-id` — provides product ID breakdown
  - `ad-account/insights-by-publisher-platform` and
    `ad-account/insights-by-publisher-platform-and-position` — provide publisher platform and platform position breakdowns
  - `ad-account/insights-by-region` — provides region-level breakdown

  **⚠️ Breaking Changes**
  The legacy `ad-account/insights` endpoint **no longer supports breakdown fields**.

  If your Data Mart previously used `ad-account/insights` with breakdowns (such as `age`, `gender`, `country`, `device_platform`, `link_url_asset`, `product_id`, `publisher_platform`, `platform_position`, or `region`),
  please migrate to the appropriate new endpoint:

  | Breakdown Type                | New Endpoint                                             |
  | ----------------------------- | -------------------------------------------------------- |
  | Age / Gender                  | `ad-account/insights-by-age-and-gender`                  |
  | Country                       | `ad-account/insights-by-country`                         |
  | Device Platform               | `ad-account/insights-by-device-platform`                 |
  | Link URL Asset                | `ad-account/insights-by-link-url-asset`                  |
  | Product ID                    | `ad-account/insights-by-product-id`                      |
  | Publisher Platform / Position | `ad-account/insights-by-publisher-platform-and-position` |
  | Region                        | `ad-account/insights-by-region`                          |

  ***

  **Recommendation:**
  ☝️ Recreate your Data Mart using the correct endpoint to ensure compatibility with the latest Facebook Marketing API structure.

- cd3bcd9: # Hidden optional connector config knobs

  Marked shared connector config fields as either **hidden manual backfill dates** or **“Advanced”** tuning options so the UI only surfaces essential settings by default.

### Patch Changes 0.12.0

- @owox/internal-helpers@0.12.0
- @owox/idp-protocol@0.12.0
- @owox/idp-better-auth@0.12.0
- @owox/idp-owox@0.12.0
- @owox/backend@0.12.0
- @owox/web@0.12.0

## 0.11.0

### Minor Changes 0.11.0

![OWOX Data Marts - v0.11.0](https://github.com/user-attachments/assets/2365a8a6-c9a0-4b7a-8b85-30d57aae2434)

- 7617b79: # Enhanced Data Mart run history monitoring with automatic updates

  Improved the overall experience when working with Data Mart by introducing automatic data refresh and better run handling:

  **Automatic data updates:**
  - Run history now automatically refreshes, keeping you informed about the latest execution status
  - Google Sheets reports automatically update with fresh data without manual page refresh
  - Auto-refresh can be toggled on/off in run history, with your preference saved for future sessions
  - Updates happen silently in the background without disrupting your work

  **Better connector run experience:**
  - Clear loading indicators when manually running connectors, with the ability to cancel
  - Improved error messages when attempting to run a connector that's already in progress
  - No more technical error messages - you'll see friendly notifications like "Connector is already running. Please wait until it finishes"

  These improvements ensure you always have up-to-date information about your Data Mart executions without needing to manually refresh the page.

- 0a99a0b: # Add ability to copy connector configuration from existing Data Marts

  Added a new feature that allows users to copy connector configuration settings from existing Data Marts when creating or editing connector-based Data Marts.
  - **Copy configuration button**: New dropdown menu in the connector configuration step that shows all Data Marts with the same connector type
  - **Multi-configuration support**: For Data Marts with multiple configurations, a nested menu allows selecting specific configuration
  - **Configuration preview**: Tooltip on each item shows required fields with masked secrets
  - **Secure secret copying**: Secrets are properly masked and merged from source on backend

- 5cd552c: # Improve Data Mart Creation Flow and Connector Editor Experience

  This update brings several enhancements to the Data Mart creation flow and connector-related components, improving UI consistency, usability, and workflow efficiency.

  **Changes**
  - **Data Mart creation flow**:
    - Added new icons for Facebook Ads, X Ads, and LinkedIn Ads
    - Updated Empty Data Marts state with options to create Data Marts in different modes
    - Improved **DataMartDefinitionSettings** to handle mode-based initialization
    - Enhanced **CreateDataMartPage** to set default titles based on selected mode
    - Added animations on the Empty Data Marts page for a smoother user experience
  - **UX improvements**: implemented auto-open logic for Connector Setup Sheet when selecting a definition type
  - **UI improvements**: updated theme handling in **DataMartCodeEditor** for consistent styling

- c929eb0: # Fix BigQuery data duplication with NULL in unique keys

  Fixed MERGE query in BigQueryStorage to correctly handle NULL values in unique key columns using `IS NOT DISTINCT FROM` instead of `=`. This prevents duplicate records when fields like `AssetGroupId` are NULL.

- ccb4fef: # Fix Boolean type in Connector Data Mart configuration

  Fixed an issue with boolean field types in connector configurations when setting up data marts.
  This fix ensures that boolean fields in connector configurations are properly handled, making them interactive and displaying appropriate UI indicators regardless of their default values.

- 6059657: # Fixed connector configuration fields editing

  Fixed an issue where connector configuration fields with default values were difficult to edit when setting up a data mart.
  Fields now properly handle user input and allow modification of default values.

- 7617b79: # Improved SQL validation flow in Data Marts to prevent timeout issues

  Previously, users were unable to save SQL queries in Data Marts when validation took longer than 30 seconds, causing timeout errors.

  This update resolves the issue by:
  - Made SQL validation asynchronous and non-blocking for saving SQL in Input Sources
  - SQL validation is no longer required for Publishing Data Marts

  Users can now save SQL queries regardless of validation time, improving the overall experience when working with complex queries or large datasets.

- 7617b79: # Fix messages for Data Mart publish button

  Improved the clarity of status messages displayed on the Data Mart publish button.
  You'll now see more accurate and informative feedback when publishing your Data Marts.

- f96f9aa: # Add Google Ads connector

  Added new Google Ads connector with Service Account authentication

  Available data nodes:
  - `campaigns`, `campaigns_stats` - Campaign data
  - `ad_groups`, `ad_groups_stats` - Ad group data
  - `ad_group_ads_stats` - Ad performance data
  - `keywords_stats` - Keyword performance data
  - `criterion` - Criteria data

- b11b726: # Added support for oneOf fields with recursive secret masking

  This release adds comprehensive support for oneOf configuration fields with nested secret handling. The connector secret service now recursively masks and merges secret fields within oneOf structures, ensuring sensitive data like API keys and tokens in nested authentication configurations are properly protected.

  New UI components include ButtonGroup for value-based selection and AppWizardCollapsible for expandable sections. Fixed an issue where the wrong oneOf variant was pre-selected when editing existing configurations.

  Added Advanced Fields section to the connector configuration form, allowing users to configure advanced settings for the connector.

- 1b97886: # Remove MaxFetchingDays parameter and improve incremental fetching logic

  Removed the `MaxFetchingDays` parameter from all data source connectors. The incremental data fetching now works as follows:
  - **First run (no state)**: Data fetching starts from the 1st of the previous month
  - **Subsequent runs**: Data is fetched from the `LastRequestedDate` (with `ReimportLookbackWindow` applied) up to today
  - **Manual backfill**: Continues to work as before, fetching data for the specified date range

### Patch Changes 0.11.0

- @owox/internal-helpers@0.11.0
- @owox/idp-protocol@0.11.0
- @owox/idp-better-auth@0.11.0
- @owox/idp-owox@0.11.0
- @owox/backend@0.11.0
- @owox/web@0.11.0

## 0.10.0

### Minor Changes 0.10.0

![OWOX Data Marts - v0.10.0](https://github.com/user-attachments/assets/09ec0e4e-428a-4ac2-bded-cd056886367d)

- 7b8747c: # Fix incremental state management for multiple connector configurations

  Fixed an issue where incremental updates only saved state for the last configuration when a Data Mart had 2+ connector configurations. Now each configuration's state is tracked separately using its `_id`. Also enhanced logging with structured metadata (dataMartId, projectId, runId, configId).

  **Changes:**
  - Updated state structure to support array of states per configuration: `{at, states: [{_id, state, at}]}`
  - Modified `ConnectorStateService` to handle `configId` parameter for getting and updating state
  - Updated `ConnectorExecutionService` to extract and pass `configId` from configuration
  - Added database migration to transform existing state data from old to new format
  - Enhanced logging with structured metadata (dataMartId, projectId, runId, configId)

- 526abdc: # Improved Connector Setup and Usability Enhancements
  - Simplified the connector setup flow with a cleaner layout and improved step structure
  - Added **keyboard shortcuts** for faster field selection in the Connector Editor (Command + Shift + A on macOS, Control + Shift + A on Windows)
  - Refined default titles and interface texts for better clarity
  - Adjusted side sheet layouts for more consistent visuals

- 2898354: # Improved environment variable logging
  - Reduced verbose logging from EnvManager that was confusing users with unnecessary technical details about environment variable processing.
  - Environment setup now shows only essential information instead of detailed variable counts and processing steps.

- 3370b36: # Added migration to rename Bing Ads connector to Microsoft Ads
  - Fixed an issue where Run History tab was not displaying history if the user previously used the Bing Ads connector.

- Fixed Looker Studio Connector error with deleted Data Marts.

### Patch Changes 0.10.0

- @owox/internal-helpers@0.10.0
- @owox/idp-protocol@0.10.0
- @owox/idp-better-auth@0.10.0
- @owox/idp-owox@0.10.0
- @owox/backend@0.10.0
- @owox/web@0.10.0

## 0.9.0

### Minor Changes 0.9.0

![OWOX Data Marts - v0.9.0](https://github.com/user-attachments/assets/ef52acdb-33d3-41c8-b0ae-8f7f1f9099c7)

- 701a05f: # Add System Theme Option to User Menu
  - Added **System** option to the theme switcher for automatic theme selection.
  - Enhanced **UserMenu** with theme selection and submenu support for better usability.

- 54df91e: # Convert boolean parameters to proper boolean type

  Updated boolean configuration parameters to use proper `boolean` type instead of `string` or `bool` types:
  - **ProcessShortLinks** (FacebookMarketing): `string` → `boolean`
  - **SandboxMode** (TikTokAds): `bool` → `boolean`
  - **IncludeDeleted** (TikTokAds): `bool` → `boolean`

- 8402b05: # Add new CLI commands for database migrations
  - `migrations up` - run all pending migrations
  - `migrations down` - revert last migration
  - `migrations status` - migration's status check

- 8fffa5e: # Mask connector secrets in UI
  - Secret fields in connector configuration are masked on the configuration page and in the Run History tab.

- 0b0a8fb: # Enhanced Connector Setup Flow
  - Improved structure with **AppWizard** components for a more consistent and flexible setup layout
  - Better usability across all setup steps
  - Refined **accessibility** and **visual design** throughout the connector editing interface

- 32b0314: # Enhanced connectors to support CreateEmptyTables configuration option
  - Now tables will be created even when no data is fetched, if the CreateEmptyTables parameter is set to "true".

- 8e673e9: # Enhanced Google BigQuery Location Options
  - Updated location labels to include region codes alongside city names for better clarity (e.g., `us-central1 (Iowa)` instead of just `Iowa`).
  - Improved Combobox component with better search functionality using keywords and increased minimum width for better display of longer location names.

- 43adfcb: # Split Facebook Marketing insights endpoint into three separate endpoints
  - Split `ad-account/insights` into three endpoints: base insights, insights by country, and insights by link URL asset
  - Added `ad-account/insights-by-country` endpoint with country breakdown
  - Added `ad-account/insights-by-link-url-asset` endpoint with link_url_asset breakdown
  - Refactored insights data fetching to use object parameters and separate fields from breakdowns
  - **⚠️ Breaking Changes:** `ad-account/insights` endpoint no longer supports breakdown fields
  - **⚠️ Breaking Changes:** if your data mart was using `ad-account/insights` with breakdown fields (e.g., country, link_url_asset), you need to recreate it using the appropriate new endpoint:
    - Use `ad-account/insights-by-country` for country breakdown
    - Use `ad-account/insights-by-link-url-asset` for link URL asset breakdown

- 646511d: # Fix data mart run history time logs
  - Fixed bad time in data mart run history logs. Now the time is displayed in the correct timezone.

- 438c48f: # Added magic link confirmation page to `idb-better-auth`
  - Generated magic links direct users to a confirmation page before the password setup page.

- 9773ba4: # Improvements & Bug Fixes

  This update includes general interface improvements, performance enhancements, and minor fixes to ensure a smoother and more reliable user experience.

- 95dcaec: # Intercom chat integration

  💬 Intercom chat integration is now available in the Web app for faster support and onboarding.

### Patch Changes 0.9.0

- @owox/internal-helpers@0.9.0
- @owox/idp-protocol@0.9.0
- @owox/idp-better-auth@0.9.0
- @owox/idp-owox@0.9.0
- @owox/backend@0.9.0
- @owox/web@0.9.0

## 0.8.0

### Minor Changes 0.8.0

![OWOX Data Marts - v0.8.0](https://github.com/user-attachments/assets/de14394e-b126-429f-89bf-b606f867dae7)

- 2932470: # Better Auth: Primary Admin Setup & Password Reset
  - **Primary admin auto-creation**: Configure `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` to automatically create or manage primary admin on server startup
  - **Password reset UI**: Admins can reset user passwords through Admin Dashboard (`/auth/dashboard`) with automatic magic link generation
  - **Enhanced documentation**: Added comprehensive user management guide at `/docs/getting-started/setup-guide/members-management/better-auth.md`

  **Features:**
  - Auto-creates admin if doesn't exist (generates magic link in logs)
  - Generates new magic link if admin exists without password
  - Password reset button for existing users with passwords
  - Magic link generation for users without passwords

  **New Environment Variables:**
  - `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` – Email for automatic primary admin creation

- 518cfe1: # refactor: rename Bing Ads to Microsoft Ads and update documentation, images, and references
- 29f72ea: # Enhance DataMartCreateForm with New Storage Creation
  - Updated storage selection to allow **creating new storage directly** from the form.
  - Refined **CreateDataMartPage styling** for better visual consistency.

- 099befb: # fix: allow deleting a datamart within a project if it was created by another user
- 25ab28e: # fix: a user with the viewer role is not allowed to modify objects in the application with idp = better-auth
- edb4478: ✨ Google Tag Manager integration
  - 🚀 Added Google Tag Manager support across the web app. Enable by setting `GOOGLE_TAG_MANAGER_CONTAINER_ID` in your environment. This allows non‑technical teams to ship marketing/analytics tags without deployments.

  Why this matters
  - 📊 Faster iteration on analytics and marketing experiments (no code release required for common changes).

- 19c21a1: # ⚠️ Breaking Change: LinkedIn Authentication Update

  **What changed:**
  LinkedIn connectors now require **3 credentials** instead of 1 Access Token: Client ID, Client Secret, and Refresh Token.

  **What you need to do:**
  1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/) → your app → **Auth** tab
  2. Copy these 3 values:
     - **Client ID** (top of Auth page)
     - **Client Secret** (top of Auth page)
     - **Refresh Token** (generate via OAuth 2.0 tools)

  **How to update:**
  1. Go to your OWOX Data Marts
  2. Find your LinkedIn connector configuration
  3. Enter the 3 new credentials instead of the old Access Token:
     - **Client ID**
     - **Client Secret**
     - **Refresh Token**

- b41b62d: # Logging System Architecture Refactor
  - **Refactored logging architecture**: Extracted Pino logger creation from LoggerFactory into a provider-agnostic architecture while maintaining backward compatibility
  - **Simplified configuration**: Removed `environment` presets from LoggerConfig, now only `LogLevel` controls logging behavior
  - **Environment variables update**:
    - Changed from `LOG_LEVELS` (comma-separated) to `LOG_LEVEL` (threshold-based)
    - Updated `.env.example` with clear documentation
  - **Enhanced TypeORM integration**: Improved `CustomDataSourceLogger` with proper parameter usage and context formatting

  **Breaking Changes:**
  - `LOG_LEVELS` environment variable renamed to `LOG_LEVEL`
  - Removed `environment` field from `LoggerConfig` interface

  **Migration:**
  - Replace `LOG_LEVELS=log,warn,error` with `LOG_LEVEL=info` (threshold-based) or app will use default `info` level
  - Remove `environment` parameter from LoggerFactory calls

- 8a1ef12: # Secure MySQL connections (TLS/SSL)
  - New, simple way to enable encrypted MySQL connections via environment variables:
    - Backend (NestJS/TypeORM): `DB_SSL`
    - Identity provider (Better Auth): `IDP_BETTER_AUTH_MYSQL_SSL`

  Learn more
  - See “MySQL SSL” section in the deployment guide: <https://docs.owox.com/docs/getting-started/deployment-guide/environment-variables/#mysql-ssl>

- 32cd6c9: # Revamp NotFound Page and Improve Mobile Layout
  - **Redesigned 404 page** with a new foreground card and animated background tunnel effect.
  - Updated **styles** for improved responsiveness and visual appeal.
  - Added **icons and navigation button** to guide users.
  - Improved **mobile layout** and updated **SidebarTrigger icon** for consistency.

- e19073a: # Refactor OpenHolidays connector according to common architecture and fix bugs
- 90a8711: # Simplified MySQL configuration in the `idp-better-auth`
  - **idp-better-auth** uses the `DB_*` environment variables unless `IDP_BETTER_AUTH_MYSQL_*` is specified.

- fc17562: # Enhance Error Handling and Notifications
  - Enhanced **API error handling** and notifications across components.
  - Updated **Toaster** component styles for improved clarity and consistency.
  - Other UI improvements

- af2e412: # Updated Google BigQuery & Google Sheets authentication
  - Switched to JWT-based auth client (`google-auth-library`).
  - Removed deprecated credential paths and warnings.
  - Improved reliability of loads/queries.
  - No action required — existing service account JSON keys continue to work.

- 58e2ead: # Updated Looker Studio data destination
  - Clarify `PUBLIC_ORIGIN`: base public URL of the application (scheme + host [+ optional port]).
    - Examples: `http://localhost:3000`, `https://data-marts.example.com`
    - Default: `http://localhost:${PORT}`
    - In production, set this to your actual deployment URL.
  - Introduce `LOOKER_STUDIO_DESTINATION_ORIGIN`: public origin used to generate the deployment URL for the Looker Studio destination.
    - If empty, it falls back to `PUBLIC_ORIGIN`.
    - Example: `https://looker.example.com`

  Heads up
  - When retrieving the current JSON config for a Looker Studio Data Destination, the `deploymentUrl` field is now generated from `LOOKER_STUDIO_DESTINATION_ORIGIN` (fallback: `PUBLIC_ORIGIN`). If you previously set `deploymentUrl` manually during creation, it is now populated from the environment variable values.

  Learn more
  - See “Public URLs” section in the deployment guide: <https://docs.owox.com/docs/getting-started/deployment-guide/environment-variables/#public-urls>

### Patch Changes 0.8.0

- @owox/internal-helpers@0.8.0
- @owox/idp-protocol@0.8.0
- @owox/idp-better-auth@0.8.0
- @owox/idp-owox@0.8.0
- @owox/backend@0.8.0
- @owox/web@0.8.0

## 0.7.0

### Minor Changes 0.7.0

![OWOX Data Marts - v0.7.0](https://github.com/user-attachments/assets/5b5e5b28-60e9-4c4e-9b2c-1b61e8ec4e74)

- 7d83d7c: # Add configurable timeout middleware for long-running operations
  - Increase server timeout from 2 minutes to 3 minutes (180s) to prevent timeout errors
  - Add operation-specific timeout middleware for data mart operations:
    - SQL editing operations: 3 minutes timeout
    - Schema operations: 3 minutes timeout
    - Publishing operations: 3 minutes timeout
    - All other operations: 30 seconds timeout (default)
  - Update frontend timeout configuration for specific operations to 3 minutes
  - Prevent race conditions in timeout middleware by ensuring only one timeout per request
  - Add proper cleanup and error handling in timeout middleware

  This change fixes timeout issues for long-running operations like SQL editing, schema refresh, and data mart publishing while maintaining reasonable timeouts for other operations.

- 342e534: # Switch between projects in the Cloud edition on app.owox.com ✨

  You can now quickly switch between your projects right from the sidebar menu. This makes it easier to:
  - Move between workspaces without signing out
  - Keep your context while browsing different projects
  - Access project-specific data and settings faster

  No setup required — just open the project switcher and choose the project you need.

- Fixes
  - Fixed indefinite "Running" status for Report Runs
  - Fixed indefinite "Running" status for Connector Runs caused by app shutdown  
    (added graceful shutdown for Connector Runner)
  - Fixed MySQL adapter compatibility with idp-better-auth
  - Fixed unexpected session logout for Cloud edition (idp-owox)
  - Fixed the error of multiple connector launches at the same time

- 78b8972: # Clarifies LinkedIn Pages import steps, adds new images, and improves error handling and API logging
  - Updated GETTING_STARTED.md for LinkedIn Pages with clearer import options and detailed instructions for using Organization URN.
  - Added new images to the documentation to improve user guidance and onboarding.
  - Enhanced error handling in the LinkedIn Pages source code for more robust integration.
  - Improved logging of API responses to assist with debugging and troubleshooting.

- e6af151: # Refactor BankOfCanada connector according to common architecture and fix bugs
- 4b487c8: # Refactor GitHub connector according to common architecture and fix bugs
- ea803b2: # Refactor: enhance Reddit Ads connector reporting logic with new field definitions

### Patch Changes 0.7.0

- @owox/backend@0.7.0
- @owox/idp-protocol@0.7.0
- @owox/idp-better-auth@0.7.0
- @owox/idp-owox@0.7.0
- @owox/internal-helpers@0.7.0
- @owox/web@0.7.0

## 0.6.0

### Minor Changes 0.6.0

![OWOX Data Marts – v0.6.0](https://github.com/user-attachments/assets/a12287fc-397f-4071-89be-47d6aae7eb6b)

- 2bbf7ba: # Initial release of Better Auth IDP provider with comprehensive authentication features
  - Added web-based admin dashboard for user management
  - Implemented hierarchical role-based access control (admin/editor/viewer) with invitation permissions
  - Created magic link authentication system with encrypted role passing and auto-name generation
  - Added comprehensive environment variable configuration with SQLite and MySQL database support

- 22762cd: Add project ID in URL routing
  - Update routing structure to support project-based navigation
  - Add project-scoped routing with `/ui/:projectId` URL structure
  - Extract hardcoded `/ui` prefix to configurable `VITE_APP_PATH_PREFIX` environment variable
  - Update all navigation links to use project-scoped routes
  - Add proper route parameters validation in DataMartDetailsPage

- c5e95be: # Fix undefined values in BigQuery Storage and cleanup Facebook fields
  - Fixed undefined values being stored as "undefined" strings instead of NULL in BigQuery Storage
  - Removed non-working fields from Facebook Marketing adAccountInsightsFields schema

- 78ea317: # Fix Facebook referral_id field causing whitelist error
  - Removed referral_id field from Facebook Marketing schema that was causing whitelist validation errors

- 83c178c: # Optimize logging and fix security issues
  - Reduced log noise in BigQuery storage
  - Fixed credentials exposure in Sources logs
  - Added progress tracking and explicit time series flags to Facebook connector

- f154ad9: # Split LinkedIn dateRange fields and hardcode field limits
  - Replace single dateRange field with separate dateRangeStart and dateRangeEnd fields for better data granularity
  - Remove MaxFieldsPerRequest param and hardcode the value

- 0f2add4: # Standardize Facebook Marketing table names with facebook*ads* prefix
  - Update all destinationName values in FacebookMarketingFieldsSchema to include facebook*ads* prefix

### Patch Changes 0.6.0

- Updated dependencies [4749749]
  - @owox/idp-owox@0.6.0
  - @owox/backend@0.6.0
  - @owox/idp-protocol@0.6.0
  - @owox/idp-better-auth@0.6.0
  - @owox/web@0.6.0

## 0.5.0

### Minor Changes 0.5.0

- d129eb0: # Triggers and reports columns available in the Data Marts list
  - Added columns for the number of triggers and reports to the Data Marts list

- 6335c25: # Fixed BingAds report data export and added proper field mapping
  - Fixed data export issues in BingAds reports by separating into two report types with proper field schemas
  - Fixed issue where values were being saved with quotes in database

- 2f2d4bf: # Add manual backfill functionality for data mart connectors
  - Added support for manual connector runs with custom payload parameters

- 0f590bb: # Connector Target step: editable dataset/database and table
  - Added editable dataset/database and table fields with sensible defaults
  - Defaults come from sanitized destination name: dataset/database `${sanitizedDestinationName}_owox`, table `${sanitizedDestinationName}`
  - Inline validation: required, only allowed characters, accessible error state
  - Helper text shows full path: `{dataset}.{table}`

- db3a03a: # Show Individual Destination Cards in Destination Tab

  The Destination tab now displays a separate card for each specific destination in the project.
  Each card shows only the reports belonging to that destination, making it easier to find and manage reports at a glance.

- 863ad3e: # Enhanced Output Schema Formatting

  The Output Schema has received a major upgrade to improve control over data readability in Destinations.
  - Added support for column header descriptions as cell notes in the Google Sheets Destination, so you can define metrics everyone is aligned on
  - Implemented automatic formatting for BigQuery and Athena timestamp fields
  - Introduced the ability to control the order of fields delivered from Data Mart to Destination via simple drag & drop in the Output Schema

- aac5411: # Update API version and refactor insights data fetching logic
  - Updated the Facebook Graph API base URL to use version 23.0 directly in the code, removing the configurable ApiBaseUrl parameter.
  - Refactored the insights data fetching logic to pass the API base URL explicitly to helper methods.
  - Modified \_fetchInsightsData and_buildInsightsUrl to accept and use the API base URL as a parameter.
  - Removed the unsupported activity_recency field from adAccountInsightsFields.
  - Improved code clarity and maintainability by simplifying how the API URL is constructed and used throughout the Facebook Marketing source integration.

- b6cdb5a: # TypeORM Entity Migration Mechanism
  - Introduced an automatic migration system for TypeORM entities.
  - Ensures database schema stays up-to-date with entity definitions.
  - Runs migrations automatically on application startup—no manual steps required.
  - Prevents data loss and supports seamless schema evolution.

- 66a6c38: # Improving credentials management security for Data Storage and Data Destination
  - API no longer returns credential secrets to the UI.
  - Credential secrets are no longer displayed in the UI.
  - Credentials are only updated if explicitly changed.
  - Added a link to manage Google Cloud Platform service accounts.

- 6f772ee: # Added Looker Studio Connector support
  - Added Looker Studio as a new data destination type
  - Implemented external API endpoints for Looker Studio integration
  - Added JWT-based authentication for Google service accounts
  - Enabled direct connection from data marts to Looker Studio dashboards
  - You can now enable or disable a Data Mart's availability for Looker Studio in **one click** using the switcher on the **Destinations** tab of the specific Data Mart page.
  - Added data caching system for improved performance
  - Connector available at: <https://datastudio.google.com/datasources/create?connectorId=AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A>
  - Documentation available at: <https://docs.owox.com/docs/destinations/supported-destinations/looker-studio/>
  - **Note**: OWOX Data Marts installation must be accessible from the internet for the connector to work properly

- e4e59f0: # Remove unsupported fields
  - Removed the following unsupported or deprecated fields from `adAccountInsightsFields` in the Facebook Marketing API reference:
    - `age_targeting`
    - `estimated_ad_recall_rate_lower_bound`
    - `estimated_ad_recall_rate_upper_bound`
    - `estimated_ad_recallers_lower_bound`
    - `estimated_ad_recallers_upper_bound`
    - `gender_targeting`
    - `labels`
    - `location`
  - Cleaned up the field definitions to avoid including unsupported fields for Facebook API v19.0 and above.
  - Improved maintainability and reduced the risk of API errors related to invalid fields.

- f351f63: # Hover Cards in Triggers List — Now Smarter and More Visual

  The Triggers list just got a big usability boost!
  Hover over any Report Run or Connector Run to instantly see key details — no extra clicks needed.
  - For Reports: name, last edit, run history, and 1-click access to Google Sheets.
  - For Connectors: source name, field count, run history, and direct Google BigQuery or AWS Athena link.

  Check status, spot issues, and jump to your data faster than ever — all right from the Triggers list.

- 6e76c87: # Implement column visibility and sorting persistence

  Previously, user interface configurations such as selected columns in tables and accordion states were reset upon every page refresh. This change ensures that the system now remembers these chosen states at the browser level for:
  - Data Marts list
  - Storages list
  - Data Marts details (Destinations, Triggers, and Reports lists).

- db0732e: # Connector-Based Data Mart UX improvements
  - Used connector-based data mart for data mart setup right destination name in `Target Setup` step.
  - Added in connector-based data mart inline validation for target dataset/database name in `Target Setup` step with accessible error state.
  - Enabled double-click on a connector card to select and advance to the next step.
  - Added field sorting controls in `Fields Selection` step:
    - A–Z, Z–A, and Original order
    - Unique key fields always appear at the top across all sorting modes
  - Minor UI polish: sort icon with dropdown next to search input; helpful link to open an issue from fields step.
  - Added helpful link to open an issue from nodes step.

- 229c7a1: # Updated connector configuration step
  - Added type to date fields.
  - Moved field descriptions to tooltips.
  - Used field labels as titles instead of field names.

### Patch Changes 0.5.0

- @owox/backend@0.5.0
- @owox/idp-protocol@0.5.0

## 0.4.0

### Minor Changes 0.4.0

- ac64efd: **# Add Data Mart Connector Icons**

  Enhance data-mart with connetors:
  - add connector icons
  - can cancel connector run
  - add connector documentation link

- ae26689: **# Fixed unexpected behaviour**
  - 404 error after reloading page
  - error with crashing the react app
  - error with publishing connector-based data mart

- 09aaade: **# Add data mart run history feature that allows users to view and track execution history of their data marts**

  This feature provides
  - New "Run History" tab in the data mart details view
  - Comprehensive run history display with pagination support
  - Real-time tracking of data mart execution status and results
  - Load more functionality for viewing extensive run history
  - Integration with existing data mart context and state management

  Additional improvements include:
  - Ability to edit source fields in already published connector-based data marts
  - Enhanced connector runner with better config handling for non-string values
  - Improved AWS Athena storage with optimized query execution and DDL handling
  - UI refinements including conditional chevron display in list item cards
  - Cleanup of unused connector-related code from data storage features

  This enhancement improves monitoring capabilities and gives users better visibility into their data mart execution patterns and performance.

- ca4062c: **# Add data mart schema management feature that allows users to view, edit, and manage the structure of their data marts**

  This feature provides:
  - Visual schema editor for both BigQuery and Athena data marts
  - Ability to add, remove, and reorder fields in the schema
  - Support for defining field types, modes, and other properties
  - Schema validation to ensure compatibility with the underlying data storage
  - Ability to actualize schema from the data source to keep it in sync

  This enhancement gives users more control over their data mart structure and improves the data modeling experience.

- 2b6e73d: **# ✨ Add SQL validation for Data Marts**

  Enhance your data mart experience with real-time SQL validation:
  - 🚀 Instant feedback on SQL query validity
  - ❌ Clear error messages when something goes wrong
  - 📊 Estimated data volume for successful queries
  - ⏱️ Automatic validation as you type

  This feature helps you write correct SQL queries with confidence, reducing errors and saving time when working with your data marts.

- 6d97d91: **# UX/UI Improvements**

  Add Planned Data Storages with "Coming Soon" Status
  - Snowflake
  - Databricks
  - AWS Redshift
  - Azure Synapse

  UI Updates: Triggers Table and Reports Table
  - Minor UI updates to the Triggers Table
  - UI improvements to the Reports Table for consistency

  More Friendly and Consistent Forms

  We’ve improved the interface to make working with forms in OWOX Data Marts more intuitive and user-friendly.
  - Unified form layout. All forms — for Triggers, Reports, Storage, and Destinations — now share a consistent design. This makes it easier to navigate and work with confidence.
  - Helpful hints where you need them. Tooltips and inline descriptions have been added next to form fields, so you can better understand what’s expected without second-guessing.
  - Improved tooltip styling. Tooltips now feature a more noticeable background, making important information easier to spot.
  - Faster editing. You can now enter edit mode in the Storage and Destinations tables with a single click on a row — no need to hunt for buttons.
  - Warnings before leaving with unsaved changes. If you make changes to a Storage or Destination and try to leave without saving, you’ll see a confirmation dialog — helping prevent accidental data loss.

  Refined Data Mart Page: Layout, Menu, and Texts
  - Updated the layout of the Connector block
  - Polished the dropdown menu on the Data Mart page

  Redesigned "Create Data Mart" Page
  - The form on the Create Data Mart page has been updated for visual consistency and a better user experience.

  Extra Visual and Text Tweaks
  - We’ve also made a few small improvements to the UI and copy to make everything feel more polished and cohesive.

### Patch Changes 0.4.0

- @owox/backend@0.4.0

## 0.3.0

### Minor Changes 0.3.0

- 543f30d: # ⏰ Time Triggers: Schedule Your Reports and Connectors

  ## What's New

  We're excited to introduce **Time Triggers** - a powerful new feature that allows you to schedule your reports and connectors to run automatically at specified times!

  ## Benefits

  - ✅ **Save Time**: Automate routine data refreshes without manual intervention
  - 🔄 **Stay Updated**: Keep your data fresh with regular scheduled updates
  - 📊 **Consistent Reporting**: Ensure your reports are generated on a reliable schedule
  - 🌐 **Timezone Support**: Schedule based on your local timezone or any timezone you need
  - 🔧 **Flexible Scheduling Options**: Choose from daily, weekly, monthly, or interval-based schedules

  ## Scheduling Options

  - **Daily**: Run your reports or connectors at the same time every day
  - **Weekly**: Select specific days of the week for execution
  - **Monthly**: Schedule runs on specific days of the month
  - **Interval**: Set up recurring runs at regular intervals

  Now you can set up your data workflows to run exactly when you need them, ensuring your dashboards and reports always contain the most up-to-date information without manual intervention.

### Patch Changes 0.3.0

- @owox/backend@0.3.0

## 0.2.0

### Minor Changes 0.2.0

- 71294b2: 2 July 2025 demo

### Patch Changes 0.2.0

- @owox/backend@0.2.0
