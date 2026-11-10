# MCP Server

> New to OWOX MCP? [See what it does and who it's for](https://www.owox.com/features/mcp) or [book a demo](https://www.owox.com/book-a-call).

OWOX Data Marts exposes a Model Context Protocol (MCP) server. It lets AI assistants and MCP-compatible clients connect to your project data using standard OAuth authorization.

Use the MCP server to explore your [data marts](../core-concepts.md) in plain language with an AI assistant like Claude or ChatGPT. You never have to leave the assistant. The assistant can summarize the available catalog and inspect data mart fields. It can run bounded queries, list destinations and reports, and set up report delivery. It can also manage report schedules and start report runs for supported push destinations. Authorized users can also configure and publish Data Marts, maintain their models, inspect previews, and manage connector runs. Editors can create, test, publish and maintain custom connectors. See [Available tools](#available-tools) for exactly what it can and cannot do.

## Prerequisites

- An active OWOX Data Marts project. Reporting queries require a published Data Mart that you can see. Authorized users can create and finish Data Marts through [setup tools](#data-mart-setup-models-and-execution) or the web app. See the [connector-based](./connector-data-mart.md) and [SQL-based](./sql-data-mart.md) guides for source requirements.
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

Project admins can provide up to 10,000 characters of business context, terminology, and project-specific conventions for AI assistants in **Project settings → Overview → Description**. OWOX returns the complete description through `get_project_context`; the MCP instructions and the tool description tell the assistant to call that tool before its first project-specific operation.

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

Once connected, the MCP server exposes the following tools across two scopes:

- **`mcp:read`**: discovery and status tools — `get_owox_guide`, `summarize_data_catalog`, `get_project_context`, `list_contexts`, `get_context_impact`, `list_project_members`, `get_project_settings`, `list_custom_connectors`, `get_custom_connector`, `get_custom_connector_version`, `get_custom_connector_specification`, `get_custom_connector_fields`, `list_data_marts`, `get_relevant_data_marts_by_prompt`, `get_data_mart_details_by_id`, `list_storages`, `get_storage`, `validate_storage_access`, `list_storage_resources`, `list_destinations`, `get_destination`, `get_destination_impact`, `get_data_mart_reports`, `get_relevant_reports_by_prompt`, `get_report_output_schema`, `list_report_run_schedules`, `get_report_run_status`, `list_credential_definitions`, `list_credentials`, `get_credential`, `get_credential_setup_status`, `get_connector_fields`, `get_connector_specification`, `list_connectors`, `get_data_mart_change_impact`, `get_data_mart_setup`, `list_setup_data_marts`, `get_data_mart_run`, `list_data_mart_run_schedules`, `list_data_mart_runs`, `list_data_mart_relationships`.
- **`mcp:write`**: tools that create, change, run, or bill something — `create_context`, `update_context_metadata`, `set_context_members`, `delete_context`, `update_project_description`, `create_custom_connector`, `update_custom_connector`, `save_custom_connector_draft`, `test_custom_connector`, `publish_custom_connector`, `activate_custom_connector_version`, `delete_custom_connector`, `query_data_mart`, `create_storage`, `update_storage`, `set_storage_access`, `delete_storage`, `add_destination`, `update_destination`, `set_destination_access`, `delete_destination`, `rotate_destination_secret_key`, `add_report`, `update_report`, `delete_report`, `create_report_run_schedule`, `update_report_run_schedule`, `delete_report_run_schedule`, `run_report`, `update_credential`, `validate_credential`, `consent_credential_definition`, `delete_credential`, `start_credential_setup`, `preview_connector_field_options`, `preview_connector_fields`, `actualize_data_mart_schema`, `create_data_mart`, `delete_data_mart`, `publish_data_mart`, `set_data_mart_contexts`, `set_data_mart_owners`, `set_data_mart_sharing`, `update_data_mart_definition`, `update_data_mart_description`, `update_data_mart_icon`, `update_data_mart_schema`, `update_data_mart_title`, `validate_data_mart`, `cancel_data_mart_run`, `create_data_mart_run_schedule`, `delete_data_mart_run_schedule`, `run_data_mart`, `update_data_mart_run_schedule`, `create_data_mart_relationship`, `delete_data_mart_relationship`, `preview_data_mart`, `update_data_mart_relationship`. `query_data_mart` and the report-run schedule mutation tools also require `mcp:read`. `query_data_mart` reads data rows, records each call in Run History, and costs [credits](../billing/consumption-units.md) per call. Your MCP client may ask you to confirm before it calls one of these.

Custom connector metadata and schema reads require `mcp:read`. Reading a complete
version manifest also requires editor access. Custom connector writes and live
tests require `mcp:write`. See [Custom connector authoring](#custom-connector-authoring).

Data Mart setup, model, connector, and execution tools follow the scope and permission rules in [Data Mart setup, models, and execution](#data-mart-setup-models-and-execution).

Storage and Destination operations enforce resource permissions. See [Storage management](#storage-management)
and [Destination management](#destination-management).

### `get_owox_guide`

Returns the workflow guide for one topic: `reporting`, `data_mart_setup`, `data_mart_runs`, `credentials`, `storages_destinations`, or `custom_connectors`. The guide is static text and does not read project data.

Some AI clients give the model only part of the MCP server instructions, or none of them. So the instructions stay short, and the longer workflow rules are in these guides. The descriptions of tools that start a multi-step task, such as `add_report`, `create_data_mart`, and `start_credential_setup`, tell the assistant which guide to read. Rules that protect your data, secrets, and numbers are also in the tool descriptions, because an assistant can skip a guide.

### `summarize_data_catalog`

Returns a high-level summary of the published data mart catalog available to this MCP connection. It helps the assistant answer broad orientation questions like "What data is available here?" or "Where should I start?" without querying actual data rows.

**Returns:**

| Field                            | Description                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_id`                     | Project identifier                                                                                                                                                                    |
| `data_mart_count`                | Number of published data marts visible to you                                                                                                                                         |
| `top_data_marts_by_connectivity` | Data marts ranked by configured relationship connectivity                                                                                                                             |
| `getting_started`                | Only when the catalog is empty: links and next steps for creating the first data mart (see [The assistant says there are no data marts](#the-assistant-says-there-are-no-data-marts)) |
| `_instruction`                   | Internal guidance for the assistant on how to summarize the returned catalog                                                                                                          |

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

### `list_contexts`

Lists the connected project's business contexts. Returns `contexts`, with `id`, `name`, the complete Markdown `description`, and `icon` for each context. Missing descriptions are `null`; icons are a built-in key or a `lucide:<name>` identifier, or `null` for the default icon. This tool is read-only and accepts no project override.

For an overview of business goals, use `get_project_context` → `list_contexts` → `list_data_marts` or `get_relevant_data_marts_by_prompt` with `context_ids`. For example, ask: "Go through all contexts, read their goals and Data Marts, and produce an overview."

Context descriptions can contain links to specific Data Marts. The assistant can identify the Data Mart from its OWOX URL, then verify access and field names with `get_data_mart_details_by_id`. A link does not attach the Data Mart to the context or grant access to it.

The MCP instructions and the descriptions of `list_contexts` and `get_data_mart_details_by_id` tell assistants to follow a description link only when the question needs that Data Mart, and not to follow a cycle. A link's `?field=` parameter is the URL-encoded technical field name, which the assistant verifies before use. MCP tools return description text without recursively loading linked descriptions; adherence to these rules depends on the connected AI client.

### Context and project configuration

These tools use the project selected for the MCP connection and retain its existing permissions. Context administration requires a project admin; member discovery and reading project settings require at least viewer access.

| Tool                         | Scope       | Inputs and behavior                                                                                                                                                                                                          |
| ---------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_context`             | `mcp:write` | Required `name` (1–255 characters); optional `description` and `icon`. Returns the saved Context, including its icon, creator and dates.                                                                                     |
| `update_context_metadata`    | `mcp:write` | Required `context_id` and at least one of `name`, `description`, or `icon`. Omitted fields are preserved. `null` clears the description or restores the default icon; the name cannot be cleared. Returns the saved Context. |
| `get_context_impact`         | `mcp:read`  | Required `context_id`. Returns counts of attached Data Marts, storages, destinations, members and provisioning defaults, plus affected member IDs. Requires an admin.                                                        |
| `set_context_members`        | `mcp:write` | Required `context_id` and `assigned_user_ids`. Replaces all assignments; `[]` removes them. Returns `assigned_user_ids` and `dropped_admin_ids`.                                                                             |
| `delete_context`             | `mcp:write` | Required `context_id`. Use the impact tool first and detach every resource, member and provisioning default. Returns `context_id` and `status: "deleted"`; attached Contexts cannot be deleted.                              |
| `list_project_members`       | `mcp:read`  | No inputs. Returns `members` with `user_id`, `email`, nullable `display_name` and `avatar_url`, `role`, `role_scope`, and `context_ids`. Use these IDs for Context assignments.                                              |
| `get_project_settings`       | `mcp:read`  | No inputs. Returns the project `description`, or `null` when missing.                                                                                                                                                        |
| `update_project_description` | `mcp:write` | Required `description`: 1–10,000 characters, or `null` to clear it. Requires an admin. Leading and trailing whitespace is trimmed; returns the saved description.                                                            |

Context names and project descriptions follow the same Unicode length rules as the API. Context icons accept a recommended Data Mart icon key (for example, `purchases`) or a library identifier such as `lucide:megaphone`, up to 64 characters. An omitted or `null` icon on create uses the default. For an update, for example, `{ "context_id": "…", "icon": "lucide:megaphone" }` changes only the icon.

Before assigning members, use `list_project_members` to identify the intended people by name or email. Admins already have project-wide access, so their IDs are ignored by `set_context_members` and reported in `dropped_admin_ids`.

Removed project members are excluded from discovery and cannot be assigned. If member lookup is unavailable, the tool reports an error instead of an empty project. Configuration tools reject unknown input fields, including misspelled optional fields.

Before deletion, `get_context_impact` reports the attachments that must be removed.
Its `affected_member_ids` lists members whose only Context assignment is this one.
With your approval, the assistant can remove assignments through `set_context_members`.
Use `set_storage_access` or `set_destination_access` to change a resource's `context_ids`.
Keep the other Context IDs that still apply. Use `set_data_mart_contexts` to replace the complete Context list for a Data Mart. Detach user provisioning defaults in the OWOX web app.

### Credential management

Manage reusable Credentials in the connected project without sending provider
secrets through your AI client. These tools require at least the viewer role and
retain the same resource permissions as the OWOX web app. Ownership and sharing
determine which Credentials you can see, use, maintain or delete.

| Tool                            | Scope       | Inputs and behavior                                                                                                                                                                                                                                                                  |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_credential_definitions`   | `mcp:read`  | This tool takes no inputs. It returns provider IDs, names, authentication types, supported consumers and AI support.                                                                                                                                                                 |
| `list_credentials`              | `mcp:read`  | This tool takes no inputs. It returns visible Credentials with safe metadata, access settings, validation state and usage. Check `can_use` before you select one.                                                                                                                    |
| `get_credential`                | `mcp:read`  | Supply `credential_id`. The tool returns safe metadata for one visible Credential.                                                                                                                                                                                                   |
| `update_credential`             | `mcp:write` | Supply `credential_id` and at least one metadata, access or AI mapping field. Existing permissions to edit, manage owners and configure sharing apply.                                                                                                                               |
| `validate_credential`           | `mcp:write` | Supply `credential_id`. You must have edit access. The tool checks the stored Credential with its provider and returns `validation_state`. It may refresh an OAuth grant.                                                                                                            |
| `consent_credential_definition` | `mcp:write` | Supply `credential_id`. You must have edit access. The tool accepts the current external provider definition after you review the change.                                                                                                                                            |
| `delete_credential`             | `mcp:write` | Supply `credential_id`. You must have delete access. The tool refuses to delete a Credential with active consumers.                                                                                                                                                                  |
| `start_credential_setup`        | `mcp:write` | To create a Credential for a known Storage or Destination, supply a compatible `definition_id`. To replace secrets or reconnect an account, supply `credential_id`. Omit both IDs only for an explicit provider-picker request without a known target. Returns `setup_id` and `url`. |
| `get_credential_setup_status`   | `mcp:read`  | Supply `setup_id`. Optionally, set `wait_seconds` from 0 to 25. The tool returns `pending`, `completed`, `cancelled` or `expired`. After completion, it returns the exact `credential_id`.                                                                                           |

To create a Credential or replace its secret, open the URL from
`start_credential_setup`. Sign in with the same OWOX account that connected MCP.
Complete the authenticated OWOX form in the connected project. Enter provider
secrets only in that form.

The assistant can pass an optional `title` to prefill the name of a new Credential.
You can change this name in the form. If no name is supplied, manual setup uses
the provider name. OAuth uses the connected account details when available.
Reconnecting an existing Credential keeps its current name.

The setup request belongs to the initiating user and project. It expires after
15 minutes. Its URL contains no secret material. New Credentials created through
this flow start unshared. The form opens only when the active project matches
the project in the setup link.

The assistant checks the same request with `get_credential_setup_status`. It can
wait up to 25 seconds per call and repeat while the status is `pending`. Clients
do not need background notifications.

Completion means that the form was saved. It does not mean that the provider
verified the Credential. Read `validation_state` or use `validate_credential`
when provider validation is needed.
Until cleanup, the completed status remains available if the Credential is deleted
or its access changes. Reading or using that Credential still requires current access.

All setup requests are removed after 30 minutes from creation, regardless of status.
Completing or cancelling setup does not extend this time. The cleanup task runs every
five minutes on instances with `SCHEDULER_EXECUTION_ENABLED=true`.
The page explains when a link has expired or is no longer available and asks you to
request a new link. Deleting a setup request does not delete its Credential.

Saving can finish after setup expires or is cancelled. If the page shows a saved
Credential ID, share that ID with your assistant. The assistant checks access with
`get_credential` before reusing it. If the ID is unavailable, the assistant uses
`list_credentials` and asks you to confirm a match by provider and title.
It starts a new setup only if no suitable Credential is confirmed. The same recovery
steps apply after the setup request is removed.

`update_credential` accepts `title`, `enabled`, `owner_ids`, `context_ids`,
`available_for_use`, `available_for_maintenance`, `ai_model_mappings` and
`ai_model_mapping_modes`. Omitted fields stay unchanged. Owner and Context arrays
replace their complete lists. At least one owner must remain.

AI mapping keys are `fast`, `reasoning` and `embedding`.
Mapping modes are `recommended` or `override`.
Provider-specific AI requirements still apply. These tools reject unknown input
fields, including secret values, field dictionaries and OAuth tokens.

Responses omit stored provider fields, authentication contracts and raw validation
messages. They include the Credential title, which can contain an account email
or other identity information. Visible consumers
appear in `used_by`. Hidden consumers contribute only to
`hidden_consumer_count`. Deletion checks every active consumer. Remove bindings
in the OWOX web app before retrying a blocked deletion.

### Custom connector authoring

You can create and maintain [custom connectors](../../connectors/custom-connectors.md)
through your assistant. This includes creating drafts, testing, publishing and
rollback. Every operation uses the connected project. Use `list_custom_connectors`
to find `connector_id`. Use `get_custom_connector` to find version numbers.

| Tool                                 | Scope       | Minimum role | Inputs and behavior                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ----------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_custom_connectors`             | `mcp:read`  | Viewer       | This tool takes no inputs. The result contains `connectors` with metadata and active version numbers. It does not contain manifests.                                                                                                                                                                                                                                       |
| `get_custom_connector`               | `mcp:read`  | Viewer       | Provide `connector_id`. The result includes metadata, a Connector Builder `url` and `versions`. Versions appear oldest first, with status and publication date.                                                                                                                                                                                                            |
| `create_custom_connector`            | `mcp:write` | Editor       | Provide `name`, `title` and `manifest`. Optional inputs are `description`, `logo` and `doc_url`. The tool creates version 1 as a draft. It returns `connector_id`, `name`, `title` and a Connector Builder `url`.                                                                                                                                                          |
| `update_custom_connector`            | `mcp:write` | Editor       | Provide `connector_id` and any metadata fields to update. Omitted fields remain unchanged. Use `null` to clear `description`, `logo` or `doc_url`. The connector name cannot change.                                                                                                                                                                                       |
| `get_custom_connector_version`       | `mcp:read`  | Editor       | Provide `connector_id` and `version`. The tool returns the complete draft or published manifest. You must be an editor because manifests can contain credentials.                                                                                                                                                                                                          |
| `save_custom_connector_draft`        | `mcp:write` | Editor       | Provide `connector_id` and the complete `manifest`. The tool replaces the current draft, or creates the next draft if none exists. Published versions remain unchanged.                                                                                                                                                                                                    |
| `test_custom_connector`              | `mcp:write` | Editor       | Provide `manifest`, `node` and a flat `configuration` map. For authentication, use a compatible saved `credential_id` or supply temporary keys in `configuration`. Optional inputs are `max_rows` (1–1000, default 25) and `max_pages` (1–50, default 1). The test makes real upstream API requests without saving. It returns `rows`, `logs`, `error` and a raw `sample`. |
| `publish_custom_connector`           | `mcp:write` | Editor       | Provide `connector_id`. The tool validates the latest draft and publishes it. This version becomes active immediately. The result contains version status, publication date, `warnings` and a Connector Builder `url`.                                                                                                                                                     |
| `activate_custom_connector_version`  | `mcp:write` | Editor       | Provide `connector_id` and a published `version`. The tool makes that version active. This includes rollback to an earlier published version.                                                                                                                                                                                                                              |
| `delete_custom_connector`            | `mcp:write` | Editor       | Provide `connector_id`. The tool soft-deletes an unused connector and makes its name available for reuse. Deletion fails if any Data Mart references the connector.                                                                                                                                                                                                        |
| `get_custom_connector_specification` | `mcp:read`  | Viewer       | Provide `connector_id`. Optionally, provide a published `version`. The tool uses the active version by default. The result contains `specification` without secret parameter values or OAuth internals.                                                                                                                                                                    |
| `get_custom_connector_fields`        | `mcp:read`  | Viewer       | Provide `connector_id`. Optionally, provide a published `version`. The tool uses the active version by default. The result contains node and field schemas, including primary keys and default fields.                                                                                                                                                                     |

Use the [manifest reference](../../connectors/manifest-reference.md) to write a
connector manifest:

1. If a draft exists, read its latest version before editing. Saving replaces the whole document.
2. Create or save the draft. Drafts can be incomplete.
3. Test the relevant nodes.
4. Review the test result before publishing. Publication validates the full manifest.

Manifest JSON and test-configuration JSON each have a limit of 120 KiB. Live tests
have a 20-second timeout and concurrency limits.

The results of `create_custom_connector`, `get_custom_connector` and
`publish_custom_connector` include a `url`. This URL opens the connector in the
Connector Builder on your OWOX deployment.

Test results include up to 50 recent log entries plus an omission notice. Each
entry has at most 2000 characters. The total limit is 8000 characters, including
notices. Truncation markers identify shortened entries. An omission notice gives
the number of omitted earlier entries. Rows, raw samples and the test error remain
unchanged.

Check `logs` and `sample` even when `error` is null. Empty `rows` alone do not
prove that the test succeeded.

Publishing or activating changes future runs of every Data Mart that follows the
active version. You must have edit access to each of these Data Marts. Otherwise,
ask a project admin or request edit access. Data Marts pinned to a version keep
that version. Publication warnings identify credential configuration that needs
attention. Publishing and activating may also update display metadata from the
manifest.

If deletion fails because Data Marts reference the connector, reconfigure those
Data Marts in the web app before retrying.

Tool metadata uses `connector_id`, `doc_url`, `active_version_id`, `active_version`
and `published_at`. The nested `manifest`, `specification` and `fields` keep their
native connector JSON keys, including camelCase names. MCP metadata responses do
not include base64 logos. Logos remain available in the Connector Builder.

Do not put literal secrets in a saved manifest. Declare secret parameters with
`attributes: ["SECRET"]` and use parameter references in the manifest.
For tests, you can reuse a compatible saved Credential with `credential_id`.
Omit fields supplied by that Credential from `configuration`.
Use `start_credential_setup` to create or update a Credential in the browser.

You can also test with temporary keys in `configuration` and omit `credential_id`.
The test does not create a Credential or save its configuration.
This option lets you test a connector before you save provider access.

Manifests, test configuration, sample rows and logs pass through your AI client.
The client may send this content to its provider.

OWOX masks recognized credential values in MCP test results, errors and tool-call
telemetry. This includes `SECRET` parameters and values referenced by authentication
fields or credential headers such as `Authorization` and `X-API-Key`.
Telemetry also masks credential defaults, placeholders, options and literal values
in recognized credential fields. Public settings, such as pagination tokens, remain
visible. Test results can still contain sensitive upstream data.

### Data Mart setup, models, and execution

Setup tools can work with visible drafts. Reporting discovery, `get_data_mart_details_by_id`,
`query_data_mart`, and report tools still require published Data Marts.
Use `list_setup_data_marts` and `get_data_mart_setup` for setup work.
The setup getter requires visibility. It does not grant permission to edit.
If a connector specification cannot be read safely, the getter still returns metadata,
schema, and access settings. It returns `definition: null` with `definition_read_error`.
Repair the connector in OWOX before replacing its definition. This is not an empty draft.

All calls use the connected project, current user, and existing OWOX resource permissions.
Read tools require `mcp:read`. Changes and provider queries require `mcp:write` as well.
Most mutations require an editor or admin role. Resource ownership, sharing, and Contexts
still control each action. A role or a visible resource alone does not grant maintenance access.

| Tools                                                                                                                             | Purpose and access                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_setup_data_marts`, `get_data_mart_setup`                                                                                    | Find drafts or published Data Marts and inspect saved setup, SQL, schema, and access settings. Viewer role and visibility are sufficient. The response omits connector secrets.                                  |
| `create_data_mart`                                                                                                                | Create a draft on a Storage that you can use. Requires editor or admin. Keep the returned `data_mart_id`.                                                                                                        |
| `update_data_mart_title`, `update_data_mart_description`, `update_data_mart_icon`                                                 | Change Data Mart metadata. Requires permission to edit.                                                                                                                                                          |
| `update_data_mart_definition`                                                                                                     | Replace the complete source definition. Requires permission to edit. Supports SQL, Table, View, Table Pattern, and Connector definitions.                                                                        |
| `validate_data_mart`, `get_data_mart_change_impact`                                                                               | Validate saved source settings or inspect dependencies before a source change or deletion. Both require editor or admin. The shared API permission checks remain in effect.                                      |
| `actualize_data_mart_schema`, `update_data_mart_schema`                                                                           | Refresh source fields or replace the complete saved schema. Both require permission to edit. Actualization retains the HTTP viewer role requirement. Schema replacement requires editor or admin.                |
| `publish_data_mart`, `delete_data_mart`                                                                                           | Publish or delete the selected Data Mart with the existing API permissions. Requires editor or admin. Review impact and authorize deletion first.                                                                |
| `set_data_mart_owners`, `set_data_mart_contexts`, `set_data_mart_sharing`                                                         | Replace owner or Context assignments, or set reporting and maintenance sharing. Each retains the existing ownership and sharing checks. Sharing retains the HTTP viewer role requirement.                        |
| `list_data_mart_relationships`                                                                                                    | Inspect the visible relationship model. The response omits inaccessible Data Marts.                                                                                                                              |
| `create_data_mart_relationship`, `update_data_mart_relationship`, `delete_data_mart_relationship`                                 | Make requested model changes using the existing API permissions. Creating a relationship requires edit access to both Data Marts. Requires editor or admin.                                                      |
| `preview_data_mart`                                                                                                               | Read a bounded sample through the saved source and model. Requires viewer role, Data Mart visibility, and write scope. It can call the warehouse.                                                                |
| `list_connectors`, `get_connector_specification`, `get_connector_fields`                                                          | Inspect bundled connector metadata and source requirements. Requires read scope. Use custom connector tools for custom connector versions.                                                                       |
| `preview_connector_fields`, `preview_connector_field_options`                                                                     | Check live fields or dynamic options with non-secret parameters and an optional saved Credential. Requires editor or admin and write scope.                                                                      |
| `run_data_mart`, `get_data_mart_run`, `list_data_mart_runs`, `cancel_data_mart_run`                                               | Queue a manual connector run, inspect run status/history, or cancel a supported active run. Starting and cancelling require edit permission and write scope. Reading history requires visibility and read scope. |
| `list_data_mart_run_schedules`, `create_data_mart_run_schedule`, `update_data_mart_run_schedule`, `delete_data_mart_run_schedule` | Inspect or manage connector run schedules. Management requires the existing trigger permission and write scope. These tools do not change Report or Data Quality schedules.                                      |

#### Create and publish a Data Mart

1. Select a Storage that you can use. Configure and validate its saved Credential if needed.
2. Call `create_data_mart` and retain its returned `data_mart_id`.
3. Call `update_data_mart_definition` with the complete source definition.
4. Call `validate_data_mart` and resolve reported errors.
5. Read `get_data_mart_setup`. Refresh the schema or inspect `preview_data_mart` when the source is available.
6. Review warnings, intended owners, Contexts, and sharing. Call `publish_data_mart` when setup is ready.
7. For connectors, inspect `list_data_mart_runs` for the initial run. Poll `get_data_mart_run` with its `run_id`.

Validation and schema updates return safe application diagnostics. Schema updates include up to
50 warning summaries. `warning_count` includes all warnings. Provider errors can contain connection
details, so their full text stays in OWOX. Follow the returned guidance if you need more detail.

An unloaded connector source can need publication and its initial run before schema or preview is available.
Connector publication starts an asynchronous initial run. Published status does not prove data readiness or execution success.
If no initial run appears, check the Data Mart in OWOX before starting another run.
Use the actual run status and source preview to report the result.

#### Credentials and complete replacements

Use existing compatible Credential IDs. Use `start_credential_setup` and
`get_credential_setup_status` when authorization must be created or renewed in the browser.
Never put raw secrets in a Data Mart definition or connector preview.
Use `_credential_id` in a connector definition. Preserve an existing configuration's `_id`
and `_credential_id` when replacing it. The definition save path uses the same checks as HTTP.
For older configurations without a reusable Credential binding, the server retains omitted
Credential-owned values and legacy references for the same configuration and authentication variant.
Selecting a different Credential does not retain the old sign-in.

`update_data_mart_definition` replaces the complete definition, including its connector configuration list.
`update_data_mart_schema` replaces the complete schema. Owner and Context setters replace complete lists.
Preserve fields and assignments that still apply. A supplied relationship join-condition list also replaces that list.
Use project member and Context discovery tools to obtain valid IDs. Do not guess IDs.

#### Destructive changes and execution

Inspect `get_data_mart_change_impact` before replacing an existing input source or deleting a Data Mart.
Review affected Reports, relationships, schedules, and referencing Data Marts with the user.
Obtain authorization for destructive source changes and deletion.
Deleting a Data Mart deletes its dependent Reports, schedules, and relationships. Warehouse tables remain.
Never delete dependencies to bypass another operation's restriction.

`run_data_mart` returns `status: "queued"` and a `run_id`. It does not wait for completion.
Poll `get_data_mart_run` until `should_poll` is false, waiting up to 15 seconds between checks.
Use `error_summary` to explain a known failure. If it points to Run History, inspect the details
in OWOX. MCP does not return raw provider errors.
This flag describes the selected run, which can be one segment of a longer backfill.
Do not call `run_data_mart` again to check progress. Each run can load data and incur usage.
Cancellation of a backfill-chain segment stops the active segment and remaining chain.

Backfill segments include `backfill.chain_id`, `segment_index`, and `segments_total`.
Use `list_data_mart_runs` with `limit` and `offset` to find later runs with the same
`chain_id`, then poll their run IDs. Inspect the outcomes of all visible segments.
Another segment can follow a failed segment. Success of the last segment does not prove
that earlier segments succeeded. The source can also finish a chain early.
If no later segment is visible and completion is uncertain, check Run History in OWOX.
do not report the whole backfill as complete or start a duplicate run.
It retains data already loaded and usage already incurred.

Creating a run schedule adds a new schedule. List schedules before changing or deleting a specific `trigger_id`.
Use the intended IANA timezone. Creation defaults to UTC and an active schedule.
Cron expressions and timezones must be valid even when a schedule is inactive.
Use the separate Report schedule tools for recurring report delivery.

### `list_data_marts`

Lists Data Marts visible to you in the current project. By default, it returns published Data Marts. You can request draft metadata for catalog browsing. Use `get_data_mart_setup` to inspect a visible draft. Reporting details and queries still require publication.

**Input:**

| Field         | Description                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `context_ids` | Optional array of IDs from `list_contexts`. Matches any selected context. Omit or pass `[]` for no context filter.      |
| `status`      | Optional: `published` (default) returns queryable data marts; `draft` returns draft metadata for catalog browsing only. |

**Returns** an array of data mart objects:

| Field         | Description                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`          | Data mart identifier                                                                                                     |
| `title`       | Data mart name                                                                                                           |
| `description` | Data mart description                                                                                                    |
| `url`         | Link to open the data mart in OWOX Data Marts                                                                            |
| `status`      | Current status: `PUBLISHED` or `DRAFT`. Response values are uppercase and differ from the lowercase input filter values. |
| `contexts`    | All attached context IDs and names (`[{"id": "...", "name": "..."}]`); `[]` when none.                                   |
| `updated_at`  | Last update timestamp                                                                                                    |

Use this tool to discover available data marts before running queries or building reports.

The response also includes `project.id` and `project.title`, so the assistant can state which project its discovery results belong to.

An empty context-filtered list does not mean the project is empty. `getting_started` appears only when you have no accessible published Data Mart anywhere in the connected project. When you see no published data mart, the response also includes `getting_started` — links and next steps for creating the first one (see [The assistant says there are no data marts](#the-assistant-says-there-are-no-data-marts)).

The list reflects your access: it includes only the data marts your [project role](../../project/roles-and-permissions.md) permits you to see. If a data mart you expect is missing, check your role in that project.

### `get_relevant_data_marts_by_prompt`

Finds the data marts most relevant to a natural-language question, ranked by relevance. Use it to discover which data marts can answer a specific question without listing the whole project.

**Input:**

| Field         | Description                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `context_ids` | Optional array of IDs from `list_contexts`; match any. Omit or pass `[]` for no context filter. |
| `prompt`      | Natural-language search prompt                                                                  |
| `limit`       | Optional maximum number of results                                                              |

**Returns** an array of matching data mart objects:

| Field             | Description                                         |
| ----------------- | --------------------------------------------------- |
| `id`              | Data mart identifier                                |
| `title`           | Data mart name                                      |
| `description`     | Data mart description                               |
| `url`             | Link to open the data mart in OWOX Data Marts       |
| `contexts`        | All attached context IDs and names; `[]` when none. |
| `relevance_score` | How closely the data mart matches your question     |

The response also includes `project.id` and `project.title`.

Only non-draft data marts visible to your [project role](../../project/roles-and-permissions.md) are returned. An empty result usually means nothing matched the prompt; when you see no published data mart at all, the response also includes `getting_started` (see [The assistant says there are no data marts](#the-assistant-says-there-are-no-data-marts)) so the assistant explains what to do instead of rephrasing the search.

Context filtering happens before search candidate limits and ranking. Unknown, deleted, or other-project context IDs are rejected. Filters never expand your existing Data Mart access. An empty filtered result does not trigger onboarding when accessible published Data Marts exist elsewhere in the project.

### `get_relevant_reports_by_prompt`

Finds existing reports from a natural-language prompt, ranked by relevance. Use it when you refer to a report by name or subject — "open the revenue report", "rerun the weekly ads export" — and its identifier is not yet known. The report name is matched first, then the names of its data mart and destination.

**Input:**

| Field    | Description                                    |
| -------- | ---------------------------------------------- |
| `prompt` | Natural-language search prompt                 |
| `limit`  | Optional maximum number of results, default 10 |

**Returns** an array of matching report objects:

| Field             | Description                                                   |
| ----------------- | ------------------------------------------------------------- |
| `report_id`       | Report identifier                                             |
| `title`           | Report name                                                   |
| `data_mart`       | The report's data mart — `id`, `title`                        |
| `destination`     | The destination the report exports to — `id`, `title`, `type` |
| `relevance_score` | How closely the report matches your prompt                    |
| `url`             | Link that opens the report in OWOX Data Marts                 |

The response also includes `project.id` and `project.title`.

A report is returned when both its data mart and destination are visible to you under the [project access rules](../../project/roles-and-permissions.md), matching the Data Mart's Destinations tab. You do not need to own a report to find it; permissions to edit or run it are checked separately. Use `get_data_mart_reports` when the data mart is already known and you need every report with its full definition.

### `get_data_mart_details_by_id`

Returns field-level metadata for one data mart visible to you in the current project.

The response also includes all attached `contexts` as IDs and names (`[]` when none), linking the selected Data Mart back to the business descriptions returned by `list_contexts`.

**Input:**

| Field          | Description                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data_mart_id` | Data mart identifier returned by `list_data_marts` or `get_relevant_data_marts_by_prompt`                                                                           |
| `detail_level` | Optional: `native` (default) returns only the data mart's own fields; `with_joined_fields` additionally returns joined fields when the question truly requires them |

**Returns:**

| Field                    | Description                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | Data mart identifier                                                                                                                                                                                                                                                                                                               |
| `name`                   | Data mart name                                                                                                                                                                                                                                                                                                                     |
| `url`                    | Link to open the data mart in OWOX Data Marts                                                                                                                                                                                                                                                                                      |
| `description`            | Data mart description                                                                                                                                                                                                                                                                                                              |
| `fields`                 | The data mart's own (native) output fields with query `name`, presentation `displayName`, types, descriptions, and business names when available. A field OWOX already computes for you also carries a `usage` note saying so; a calculated field whose number a join can distort carries a caveat there to pass on with the value |
| `joined_fields_included` | Whether joined fields were requested and evaluated. When `false`, `joined_fields` was intentionally omitted rather than evaluated as empty.                                                                                                                                                                                        |
| `joined_fields`          | Fields contributed by blended/joined data marts when requested, each with exact query `name`, presentation `displayName`, source data mart, type, and allowed aggregations                                                                                                                                                         |
| `joins`                  | How each joined Data Mart relates to this one, one entry per join path: `aliasPath`, the source and target Data Mart titles, `joinConditions` (the field pairs rows are matched on), and `description` when set — the override for this join path, otherwise the relationship's own description                                    |
| `operators_by_category`  | For each field-type category present in the data mart (`number`/`string`/`date`/`time`/`boolean`/`other`), the `query_data_mart` filter/slice operators its fields accept                                                                                                                                                          |

Use this tool when you need to understand the fields available in a specific data mart. It returns native fields by default; request `detail_level=with_joined_fields` before concluding that the native schema cannot answer a question or after a `field_not_found` error. Like `joined_fields`, `joins` is returned only with `with_joined_fields` and stays empty otherwise. A field's `allowedAggregations` and its category's entry in `operators_by_category` tell the assistant which aggregations and operators the field supports. The assistant can build queries without trial and error. An empty `allowedAggregations` on a [calculated field](./calculated-fields.md) whose formula already aggregates means the value is **already computed**, not that the field is unusable — select it by name and read its `usage` note. It does not return sample values, data freshness, owners, or actual data rows. To learn how joined/blended fields are set up, see [Joinable Data Marts](./joinable-data-marts.md).

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

When the data mart already defines the quantity being asked for as a [calculated field](./calculated-fields.md) that aggregates — a ROAS written as `SUM(revenue) / NULLIF(SUM(adCost), 0)`, say — list **that** field in `fields` instead of pulling its inputs and dividing them in the reply. OWOX then computes it in the warehouse at the grain the question asks for, over every matching row rather than only the rows the `limit` let through.

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

### Storage management

These tools manage Storage connections in the connected project.
They enforce resource permissions for reading, use, editing, ownership, and sharing.
They accept saved Credential IDs. Enter provider secrets only in the OWOX Credential form.

`list_storages`, `get_storage`, `create_storage`, and `update_storage` return `url`,
a direct link to the Storage in the OWOX Data Marts web UI.

| Tool                      | Inputs and behavior                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_storages`           | Optional `storage_type`, `owner_id`, and `owner_filter`. Returns visible Storage IDs, names, types, and timestamps. Use `get_storage` for details.                                                                             |
| `get_storage`             | Supply `storage_id`. Returns safe configuration, Credential state, owners, Contexts, and sharing settings.                                                                                                                     |
| `create_storage`          | Supply `storage_type`. An optional `title` names the Storage. Returns an unconfigured Storage with use sharing enabled and maintenance sharing disabled.                                                                       |
| `update_storage`          | Supply `storage_id` and the changed `title`, `configuration`, or `credential_id`. Omitted fields stay unchanged. The Storage type cannot change.                                                                               |
| `set_storage_access`      | Supply `storage_id` and the changed `owner_ids`, `context_ids`, `available_for_use`, or `available_for_maintenance`. Supplied lists replace their complete lists.                                                              |
| `validate_storage_access` | Supply `storage_id`. Checks the saved configuration and Credential. Returns a safe validation state and the next step when setup is incomplete.                                                                                |
| `list_storage_resources`  | Supply `storage_id` and `level`: `namespaces` or `resources`. The `resources` level requires `namespace_id`. Optional `resource_type` filters tables, views, or table patterns. Resource browsing currently supports BigQuery. |
| `delete_storage`          | Supply `storage_id`. Deletion fails while Data Marts reference the Storage. It preserves the saved Credential and warehouse data.                                                                                              |

To configure a Storage:

1. Call `list_credential_definitions` and match `storage_types` and the required authentication method to the Storage.
2. Select a usable saved Credential. To create one, pass the matching `definition_id` to `start_credential_setup` and complete browser setup.
3. Call `create_storage` with the required type.
4. Keep the returned `storage_id`.
5. Call `update_storage` with that ID, the provider configuration, and `credential_id`.
6. Call `validate_storage_access` to check the connection.
7. Use `set_storage_access` to change owners, Contexts, or sharing as requested.

Legacy BigQuery Storages cannot be created or deleted through these tools.
Their titles and BigQuery project IDs stay unchanged when you update them.
For access changes, use `list_project_members` and `list_contexts` to find valid IDs.
Keep every owner or Context that the user still needs in a replacement list.

### Destination management

Use `list_destinations` and `get_destination` to identify the intended Destination.
Use `add_destination` to create a Destination.

| Tool                            | Inputs and behavior                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_destination`               | Supply `destination_id`. Returns safe settings, recipients, Drive folder, Credential state, owners, and Contexts.                                 |
| `update_destination`            | Supply `destination_id` and the changed `title`, `emails`, `drive_folder_url`, or `credential_id`. Field support depends on the Destination type. |
| `set_destination_access`        | Supply `destination_id` and the changed owners, Contexts, or sharing flags. Input names and list replacement rules match `set_storage_access`.    |
| `get_destination_impact`        | Supply `destination_id`. Returns the dependent Report and Data Mart counts. This operation requires permission to delete the Destination.         |
| `delete_destination`            | Supply `destination_id`. Deletion fails while Reports reference the Destination. It preserves saved Credentials and external documents.           |
| `rotate_destination_secret_key` | Supply `destination_id`. Rotates the Looker Studio key. Returns the Destination URL, never the key.                                               |

`get_destination` and `update_destination` return `destination_id`,
`connected_google_account`, and `created_at`.
`list_destinations` returns `id`, `connectedGoogleAccount`, and `createdAt`.

To create a Credential, use `list_credential_definitions` to match `destination_types`
and the required authentication method. Pass the matching `definition_id` to
`start_credential_setup`. Use `google-sheets-oauth` for Google Sheets sign-in,
`google-service-account` for a service-account key, or `google-chat-webhook`
for Google Chat webhook delivery.

For Google Sheets, `drive_folder_url` selects the folder for newly created spreadsheets.
Pass `null` to `update_destination` to clear the folder.
Changing the Google account can clear an omitted folder setting.

For service accounts, use a Shared Drive folder.
If folder access fails, grant the service account permission to create files there.

For Google sign-in, both the connected account and OWOX must already have access to the folder.
Supplying its URL does not grant access.
If folder access fails, select the folder through the OWOX Picker with the connected Google account.
OAuth folder access errors can occur when OWOX creates a spreadsheet.

Use `emails` for email, Slack, Teams, or Google Chat channel-email delivery.
Use `credential_id` to select a saved Credential for Google Sheets or a webhook Credential for Google Chat.
For Google Chat, `emails` replaces webhook delivery, and `credential_id` replaces saved recipients with webhook delivery.
Do not combine these fields. Never send a secret webhook URL through MCP.
Existing Excel Destinations can be managed, but `add_destination` does not create them.

Before key rotation, explain that the old Looker Studio key will stop working.
The user must open the returned Destination URL to copy the new key into Looker Studio.

### Creation and key rotation

Repeating a successful creation creates another Storage or Destination.
Each key-rotation call replaces the current key.
If a response is lost, check the result in OWOX before repeating the operation.
The initial Google Sheets browser setup call creates a Credential setup request, not a Destination.

### `list_destinations`

Lists the destinations in the current project — such as Google Sheets, Looker Studio, or messaging destinations — so the assistant knows where a report could be sent.

Optional `destination_type`, `owner_id`, and `owner_filter` inputs narrow the list.
The result includes the fields below, current owners, Contexts, sharing settings, and safe Credential state.

**Returns** an array of destination objects:

| Field                    | Description                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`                     | Destination identifier                                                                                    |
| `url`                    | Link to open this destination in OWOX                                                                     |
| `name`                   | Destination name                                                                                          |
| `type`                   | Destination type (for example `google_sheets`, `looker_studio`, `slack`, `email`, `teams`, `google_chat`) |
| `owner`                  | Email of the member who created the Destination, or `null` when unavailable                               |
| `connectedGoogleAccount` | For Google Sheets destinations, the Google account that completed OAuth consent                           |
| `createdAt`              | Destination creation timestamp                                                                            |

The list includes only destinations that your [project role](../../project/roles-and-permissions.md) permits you to use.
When `add_destination` creates a destination, use its returned `destination_id` to identify the result.
Do not select the newest destination by `createdAt`.
To add or manage destinations, see [Destination Management](../../destinations/manage-destinations.md).

### `add_destination` (requires `mcp:write`)

Starts or completes setup for a report-delivery destination. The exact flow depends on `destination_type`.

**Input:**

| Field              | Description                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destination_type` | Destination type to connect or create: `google_sheets`, `looker_studio`, `email`, `slack`, `teams`, or `google_chat`                                                                              |
| `title`            | Supply an optional destination name. For Google Sheets browser setup, keep this title for the follow-up `add_destination` call. The browser form title names the Credential.                      |
| `emails`           | Supply target email addresses or delivery addresses. This field is required for `email`, `slack`, `teams` and Google Chat delivery through channel email. Do not combine it with `credential_id`. |
| `credential_id`    | Select a compatible saved Credential for `google_sheets` or `google_chat` webhook delivery. You must have permission to use it. Get its ID from `list_credentials` or completed browser setup.    |
| `drive_folder_url` | Optional Google Drive folder URL for a Google Sheets Destination. Requires folder access for the connected account and, with Google sign-in, for OWOX. Keep it for creation after setup.          |

**Returns:**

| Field               | Description                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorization_url` | For `google_sheets` without `credential_id`, open this link to create a Google Sheets Credential in OWOX.                                                                          |
| `setup_id`          | Use this ID with `get_credential_setup_status` to identify the exact saved Credential. The tool returns it when browser setup is required.                                         |
| `destination_id`    | The tool returns the new destination ID when it creates a destination. This includes `google_sheets` with `credential_id`. The initial browser setup call does not return this ID. |
| `destination_url`   | Open the created destination in OWOX. The tool returns this URL only when it creates a destination.                                                                                |
| `instructions`      | Human-readable next steps for finishing setup or using the new destination                                                                                                         |

For `google_sheets` or `google_chat`, supply `credential_id` to use a compatible saved Credential.
You must have permission to use it. For Google Chat, this selects webhook delivery.
The tool creates the destination directly and returns `destination_id`.
New destinations start unshared. Never send Credential values or secret webhook URLs through MCP or chat.

For `google_sheets` without `credential_id`, the tool starts the same Credential setup flow as `start_credential_setup`.
It returns `authorization_url` and `setup_id`. This call does not create a destination.

1. Open `authorization_url` in the browser.
2. Sign in to OWOX with the same account that connected MCP. You must be a member of this project.
3. Complete the Google Sheets Credential form. Its title names the Credential.
4. Call `get_credential_setup_status` with `setup_id`. If the status is `pending`, repeat the call as needed.
5. If the status is `completed`, call `add_destination` again with `destination_type: "google_sheets"`, the exact `credential_id`, and the intended destination `title`.
6. Use the returned `destination_id` for reports.

The follow-up call creates the destination. Its title names the destination, which can differ from the Credential title.
New Credentials and destinations start unshared. Other project members need permission to use them.
If setup is `cancelled`, `expired` or missing, first recover the saved Credential
as described in [Credential management](#credential-management).

For `email`, `slack` and `teams`, the tool creates the destination directly and returns `destination_id`.
For `google_chat` without `credential_id`, the tool uses channel-email delivery and requires `emails`.

For `looker_studio`, the tool creates the destination directly and returns `destination_id`.
The tool never sends connector credentials or secret keys through MCP or chat.
Open the destination in OWOX Data Marts to copy those credentials.
The returned `instructions` include the [Data Studio destination](../../destinations/supported-destinations/data-studio.md) guide with the full walkthrough.

### `get_data_mart_reports`

Lists the reports tied to a data mart, including each report's destination, what it exports, the spreadsheet it writes to (Google Sheets), its run schedules (a report can have any number of schedule triggers), and its last run status.

**Input:**

| Field          | Description          |
| -------------- | -------------------- |
| `data_mart_id` | Data mart identifier |

**Returns** an array of report objects:

| Field                     | Description                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `report_id`               | Report identifier                                                                                                                                                                                                                                            |
| `report_url`              | Link to the report's Data Mart reports page in OWOX                                                                                                                                                                                                          |
| `data_mart_id`            | Data mart identifier                                                                                                                                                                                                                                         |
| `name`                    | Report name                                                                                                                                                                                                                                                  |
| `destination_id`          | Destination the report exports to                                                                                                                                                                                                                            |
| `destination_url`         | Link to the destination in OWOX                                                                                                                                                                                                                              |
| `destination_type`        | Destination type (for example `google_sheets`)                                                                                                                                                                                                               |
| `owner`                   | The user who created the report                                                                                                                                                                                                                              |
| `created_by_current_user` | `true` when the connected user created the report                                                                                                                                                                                                            |
| `created_at`              | Creation timestamp                                                                                                                                                                                                                                           |
| `fields`                  | Column names the report exports, or `["*"]` for every field; `[]` is a metrics-only report that exports no dimension column, only its Unique Count metric(s)                                                                                                 |
| `unique_count_sources`    | Unique Count metrics the report carries — `unique_count` for its own data mart, `<source>__unique_count` for joined sources. Set in the OWOX UI; `update_report` keeps them                                                                                  |
| `filters`, `slices`       | Row filters and pre-join filters applied on every run, in the same vocabulary `add_report` and `update_report` accept                                                                                                                                        |
| `ui_only_filters`         | Present only when the report also applies rules created in the OWOX UI that the assistant cannot express — post-aggregation constraints, regex, calendar presets such as "today". `update_report` keeps them untouched; change or remove them in the OWOX UI |
| `aggregations`            | Aggregations applied on every run, in `add_report` vocabulary (including the report-only `STRING_AGG` and `ANY_VALUE`)                                                                                                                                       |
| `date_buckets`            | Date buckets applied on every run                                                                                                                                                                                                                            |
| `sort`                    | Sort order of the exported rows                                                                                                                                                                                                                              |
| `limit`                   | Max rows per run, or `null` when uncapped                                                                                                                                                                                                                    |
| `spreadsheet_id`          | Google Sheets only. Spreadsheet the report writes to — pass it as `spreadsheet_id` to `add_report` to put a related export into the same document                                                                                                            |
| `sheet_url`               | Google Sheets only. Link to the report's sheet                                                                                                                                                                                                               |
| `schedules`               | Array of run schedules — `trigger_id`, `cron_expression`, `time_zone`, `is_active`, `next_run_at`, `last_run_at`                                                                                                                                             |
| `last_run_at`             | Timestamp of the most recent run                                                                                                                                                                                                                             |
| `last_run_status`         | Status of the most recent run                                                                                                                                                                                                                                |

Use this tool before creating a report, to find one that already exports what you asked for, and before scheduling or changing a report's cadence, to see what already exists.

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

Creates a report that exports a data mart to an existing destination (see `list_destinations`). This is how the assistant exports, saves, or delivers OWOX data — it does not copy query rows into files or documents of its own. For push destinations, it also queues the first run by default so the destination is populated immediately. Set `run_immediately` to `false` only when the user explicitly wants configuration without delivery, such as before creating a schedule.

One report per request: when you ask to change a report that already exists — add a filter, sort it differently, rename it — the assistant updates that report with `update_report` instead of creating another one. To keep a conversation from piling up duplicates, `add_report` refuses a report whose fields duplicate one you already created on the same data mart and destination: it returns `error_code: similar_report_exists` together with the existing report's definition, and the assistant updates that report instead. If you really want a second, separate report, say so — the assistant then passes `allow_similar: true`.

- **Google Sheets**: a new Google Sheet is created automatically and linked to the report. The initial run then writes data into it by default. The file and its sheet both take the report's name. Unlike every other tool, this path reaches outside OWOX: it creates a file in Google Drive and attempts to share it with you. When you ask for several related exports, the assistant passes the first report's `spreadsheet_id` to the next `add_report` calls, so each report becomes a separate sheet of the same document instead of a separate file; that sheet is named after its report too. See [Google Sheets destination](../../destinations/supported-destinations/google-sheets.md) for how to set the destination up.
- **Looker Studio**: the report is created with default settings (data cache lifetime of 5 minutes) — the tool accepts no Looker-Studio-specific parameters, and no `name` (Looker Studio reports carry no name). Each data mart + destination pair can have exactly one Looker Studio report; creating a second one returns an error instead of a duplicate. Creating the report only makes the data mart available to the destination: data appears in a dashboard after you connect Looker Studio to OWOX with the destination's JSON Config (it contains a secret key, so it is never sent through the assistant). The response includes `instructions` and a `setup_guide_url` so the assistant can walk you through it; the full guide is [Data Studio destination](../../destinations/supported-destinations/data-studio.md). If the project has no Looker Studio destination yet, the assistant can create one with `add_destination` first.
- **Email, Slack, Microsoft Teams, Google Chat**: the report carries the message subject and body; the recipients or channels are configured on the destination itself, not on the report. The default initial run sends the rendered message immediately. The send condition is always the default ("Send always") — change it in the OWOX Data Marts UI if you need a conditional report.

**Input:**

| Field             | Description                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data_mart_id`    | Data mart to export                                                                                                                                                                                                                                                                                                                                                                         |
| `destination_id`  | The destination to export to (from `list_destinations`)                                                                                                                                                                                                                                                                                                                                     |
| `fields`          | Exact column names to include, or `["*"]` for every field                                                                                                                                                                                                                                                                                                                                   |
| `filters`         | Optional. Row filters applied on every report run — same shape and operator vocabulary as `query_data_mart`'s `filters`, so the assistant can create a report that exports exactly the filtered result you were looking at. A filter may reference a field that is not in `fields`. Omit to export all rows                                                                                 |
| `slices`          | Optional. Pre-join filters that narrow a joined data mart before blending — same as `query_data_mart`'s `slices`. Blended data marts only                                                                                                                                                                                                                                                   |
| `aggregations`    | Optional. Aggregations applied on every run — same as `query_data_mart`'s `aggregations`, plus the report-only `STRING_AGG` and `ANY_VALUE`. Each aggregated field must also appear in `fields`; other fields become group-by dimensions                                                                                                                                                    |
| `date_buckets`    | Optional. Bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR — same as `query_data_mart`'s `date_buckets`. Each bucketed field must also appear in `fields`                                                                                                                                                                                                                       |
| `sort`            | Optional. Order of the exported rows — same as `query_data_mart`'s `sort`                                                                                                                                                                                                                                                                                                                   |
| `limit`           | Optional. Max rows each run exports; omit for no cap (the interactive query limit is deliberately NOT carried over)                                                                                                                                                                                                                                                                         |
| `name`            | Report name — also the new sheet's title (Google Sheets) and the default message subject (email family). Required for those destination types; not accepted for Looker Studio                                                                                                                                                                                                               |
| `message`         | Message settings — required for email, Slack, Teams, and Google Chat destinations, rejected for other types                                                                                                                                                                                                                                                                                 |
| `message.subject` | Optional message subject or heading. Defaults to the report name                                                                                                                                                                                                                                                                                                                            |
| `message.body`    | Message body template. Supports the `{{table}}` placeholder, which renders the report's result table                                                                                                                                                                                                                                                                                        |
| `run_immediately` | Optional. Defaults to `true` for push destinations, which starts one billed Report Run and delivers data. Set `false` for configuration-only creation. Looker Studio is pull-based: omit this field or set it to `false`; `true` is rejected                                                                                                                                                |
| `spreadsheet_id`  | Optional, Google Sheets only. Add the report as a new sheet of this existing spreadsheet (from an earlier `add_report` result or `get_data_mart_reports`) instead of creating a new file. The destination's connected Google account needs edit access, a sheet with the report's name must not exist yet, and the spreadsheet must be shared with you — one confirmed not to be is refused |
| `allow_similar`   | Optional. Create the report even though you already have one exporting the same fields from this data mart to this destination. Without it, such a call returns `error_code: similar_report_exists`                                                                                                                                                                                         |

**Returns:**

| Field                     | Description                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`               | Report identifier                                                                                                                                                                                                                            |
| `destination_type`        | Type of the destination the report was created for                                                                                                                                                                                           |
| `report_url`              | Link to the report in OWOX Data Marts                                                                                                                                                                                                        |
| `spreadsheet_id`          | Google Sheets only. Spreadsheet the report writes to — reuse it to add related exports as sheets of the same document                                                                                                                        |
| `sheet_url`               | Google Sheets only. Link to the report's sheet                                                                                                                                                                                               |
| `owner`                   | The user who created the report                                                                                                                                                                                                              |
| `status`                  | `created`                                                                                                                                                                                                                                    |
| `initial_run`             | Outcome of the first run: `queued`, `not_requested`, `not_applicable`, or `failed_to_queue`. The report exists for every outcome                                                                                                             |
| `initial_run.run_id`      | Present for `queued`; pass it with `report_id` to `get_report_run_status` and do not call `run_report` again for this initial run                                                                                                            |
| `initial_run.should_poll` | `true` only for `queued`; poll until the status tool returns `should_poll: false`                                                                                                                                                            |
| `placed_in_root`          | Google Sheets only, new files only. `true` if the configured Drive folder could not be used, so the sheet was created in the Drive root                                                                                                      |
| `shared_with_requester`   | Google Sheets only. New file: `false` if the sheet could not be shared with you. Existing spreadsheet: `false` if your access to it could not be confirmed (it is never granted). Either way, opening the link may require requesting access |
| `instructions`            | Looker Studio only. What has to happen before dashboard data flows — the assistant relays this to you                                                                                                                                        |
| `setup_guide_url`         | Looker Studio only. Link to the step-by-step Looker Studio connection guide                                                                                                                                                                  |

### `update_report` (requires `mcp:write`)

Updates an existing report: renames it, replaces which data mart fields it exports, replaces its output controls (filters/slices, aggregations, date buckets, sort, limit — same vocabulary as `query_data_mart`), and/or — for reports with an email, Slack, Teams, or Google Chat destination — changes the message subject or body. Anything not provided stays unchanged — the destination, owners, schedules, and send condition are preserved as-is. This is the tool the assistant uses when you ask to change a report it created earlier in the conversation.

By default, a Google Sheets report is run again after an update that actually changed what it exports, so the sheet reflects the new definition; a name-only or message-only change, or re-sending the same controls, does not trigger a run. Email, Slack, Microsoft Teams, and Google Chat reports are not re-sent by an update — a run would deliver the message to every recipient or channel — unless you explicitly ask to send it now. The response returns the report as it is after the update.

**Input:**

| Field             | Description                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `report_id`       | Report to update (from `get_data_mart_reports`)                                                                                                                                                                                                                                                                                                                          |
| `fields`          | Optional. Replacement column selection, or `["*"]` for every field                                                                                                                                                                                                                                                                                                       |
| `filters`         | Optional. Replacement row filters (same vocabulary as `query_data_mart`'s `filters`). Replaces only the current row filters the assistant can express — stored slices and `ui_only_filters` are untouched; `[]` removes every expressible row filter                                                                                                                     |
| `slices`          | Optional. Replacement pre-join filters (blended data marts only). Replaces only the current slices the assistant can express — stored row filters and `ui_only_filters` are untouched; `[]` removes every expressible slice                                                                                                                                              |
| `aggregations`    | Optional. Replacement aggregations (including the report-only `STRING_AGG` and `ANY_VALUE`); replaces the whole list, so copy the ones to keep from `get_data_mart_reports`; `[]` removes them                                                                                                                                                                           |
| `date_buckets`    | Optional. Replacement date buckets; `[]` removes them                                                                                                                                                                                                                                                                                                                    |
| `sort`            | Optional. Replacement sort order; `[]` removes it                                                                                                                                                                                                                                                                                                                        |
| `limit`           | Optional. New max rows per run; `null` removes the cap                                                                                                                                                                                                                                                                                                                   |
| `name`            | Optional. New report name                                                                                                                                                                                                                                                                                                                                                |
| `message`         | Optional. Message changes — only for reports with an email-family destination, rejected for other types                                                                                                                                                                                                                                                                  |
| `message.subject` | Optional. New message subject or heading                                                                                                                                                                                                                                                                                                                                 |
| `message.body`    | Optional. New message body template (supports `{{table}}`). Replaces the current body; if the report used an insight template, it switches to this custom message                                                                                                                                                                                                        |
| `run_immediately` | Optional. Omit for the default (re-run a Google Sheets report when the export changed; no run for a name-only or message-only change; email-family reports are never re-sent by default). `false` updates a Google Sheets report without refreshing it; `true` re-delivers, including re-sending an email-family report. Looker Studio is pull-based: `true` is rejected |

At least one change parameter must be provided (and `message`, when present, needs `subject` and/or `body`); `run_immediately` alone is not a change.

**Returns:**

| Field                                                                          | Description                                                                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `report_id`                                                                    | Report identifier                                                                                                                                            |
| `status`                                                                       | `updated`                                                                                                                                                    |
| `destination_type`                                                             | Type of the report's destination                                                                                                                             |
| `name`                                                                         | Report name after the update                                                                                                                                 |
| `fields`, `filters`, `slices`, `aggregations`, `date_buckets`, `sort`, `limit` | The report's definition after the update — the same shape `get_data_mart_reports` returns                                                                    |
| `spreadsheet_id`, `sheet_url`                                                  | Google Sheets only. The spreadsheet and sheet the report writes to                                                                                           |
| `run`                                                                          | Outcome of the refresh run: `queued` (with `run_id` to poll), `not_requested`, `not_applicable`, or `failed_to_queue`. The update is saved for every outcome |

### `delete_report` (requires `mcp:write`)

Deletes a report. The report stops running and disappears from the project; the underlying data mart, destination, and any already-exported documents are not affected. This cannot be undone, so your assistant asks for confirmation before calling it.

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

Everything else is free. Context and project configuration, including member discovery and assignments, does not consume credits. Listing data marts, inspecting fields, browsing destinations, reading reports and schedules, and checking run status only read metadata. Creating a destination, report, or schedule is also free; `add_report` itself is free when `run_immediately` is `false` or the destination is pull-based. You pay when the report runs, not when you set it up.

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
- "Add a filter to that report so it only includes paid channels." **(costs credits; the report is updated and refreshed, not duplicated)**
- "Export the ad spend by source into the same spreadsheet as a second sheet." **(costs credits)**
- "Create a Looker Studio report from the Sales data mart with all fields."
- "Send the daily revenue table to the Alerts Slack destination with the message 'Yesterday's numbers'." **(costs credits; sends immediately)**
- "Rename that report to 'Q3 Ads Report' and keep only the campaign and spend fields."
- "Change the subject of the daily Slack report to 'Morning numbers'."
- "Schedule that report to run every Monday at 9am New York time."
- "Turn off the schedule you just created."
- "Delete the old 'Test export' report from the Sales data mart."

> **What these tools can and cannot do:** They let the assistant discover your project, summarize the published data mart catalog, inspect data mart metadata, list destinations, list reports and schedules, and check report-run status. With `query_data_mart`, the assistant can run a bounded structured query and read the resulting data rows and totals; this is billable and recorded in Run History. With your confirmation, the assistant can also create destinations (`add_destination`), create a report for a Google Sheets, Looker Studio, email, Slack, Microsoft Teams, or Google Chat destination — optionally with the same filters, slices, aggregations, date buckets, and sort as a `query_data_mart` call, so the export matches the numbers you saw (`add_report`). New push-destination reports run once by default and return a `run_id` to poll; `run_immediately: false` creates configuration only. Related Google Sheets exports can share one spreadsheet as separate sheets. The assistant can also rename a report, change which fields it exports, replace its output controls, or edit the message of email-family reports (`update_report`) — it does this, rather than creating a second report, when you ask to change one that exists — delete a report (`delete_report`), create, update, or delete report-run schedules, and start a later manual run for supported push-destination reports (`run_report`). Editors can also create, configure, validate, share, and delete Storages. Destination management includes settings, ownership, sharing, deletion, and Looker Studio key rotation. These operations enforce resource permissions. Editors can create, test, publish, update and delete custom connectors, and activate earlier published versions. Authorized users can create and maintain Data Marts through the setup tools. `query_data_mart` uses structured fields and controls. SQL source definitions use `update_data_mart_definition` and the existing validation and preview workflow. The tools cannot change project settings other than the description, retrieve destination secret keys, or run pull-based Looker Studio reports through `run_report`.
>
> **What is shared with your AI provider:** Tool inputs and results can reach the AI provider behind your client, such as Anthropic or OpenAI. These include project and data mart metadata, report and schedule metadata, report-run status, and your project roles. Data Mart setup can also expose SQL, schemas, non-secret connector settings, ownership, and sharing. Preview results include source data rows. Storage tools also return configuration, such as warehouse hosts, project IDs, accounts, and workgroups, plus discovered resource names. Storage and Destination details include owners, Contexts, and sharing settings. Destination details can include existing recipient addresses for email, Slack, Microsoft Teams, and Google Chat, plus Drive folder URLs and connected account identities. Addresses that you supply when you create or update a Destination also pass through the client.
>
> When the assistant runs `query_data_mart`, the **resulting data rows and totals are sent** to that provider. This includes only data you are permitted to query. Custom connector authoring can also send complete manifests, test configuration, upstream sample rows, and logs. Connect OWOX only to clients your organization permits to receive this information.

## Troubleshooting

### A tool reports `Structured content does not match the tool's output schema`

Your client may be validating a response against a tool schema cached before a server update.
Refresh the server's tool list or reconnect the MCP server (in Claude Code, use `/mcp`).
Then retry the tool call.

### The assistant does not see new tools or tool rules

Some clients keep the tool list from the time when you connected OWOX. For example, ChatGPT keeps the tool list and tool descriptions that it received when you added the app. After an OWOX update, disconnect and reconnect the OWOX app or connector (see [Switch projects or disconnect](#switch-projects-or-disconnect)) to load the new tools, such as `get_owox_guide`.

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

### The assistant says there are no data marts

Reporting tools use **published** Data Marts that your [project role](../../project/roles-and-permissions.md) lets you see. Setup tools can inspect visible drafts and complete authorized configuration. When there is none, `list_data_marts`, `get_relevant_data_marts_by_prompt`, and `summarize_data_catalog` return `getting_started` instead of a bare empty list, and the assistant explains what a data mart is and what to do next rather than retrying the search or querying data:

| Field                   | Description                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `can_create_data_marts` | Whether your role may create data marts (Project Admin or Data Owner)                                                                                |
| `create_data_mart_url`  | The page in OWOX Data Marts where a new data mart is created                                                                                         |
| `data_marts_url`        | The Data Marts list of the connected project                                                                                                         |
| `guides`                | Links to the [core concepts](../core-concepts.md), [connector-based](./connector-data-mart.md), and [SQL-based](./sql-data-mart.md) data mart guides |
| `draft_data_marts`      | Visible drafts available through setup tools; reporting tools require publication                                                                    |
| `instructions`          | Internal guidance the assistant relays to you                                                                                                        |

Authorized users can create and publish Data Marts through MCP. To continue:

- **Project Admin or Data Owner with write scope:** use the [Data Mart setup workflow](#create-and-publish-a-data-mart). Inspect an existing draft before creating another Data Mart. You can also use `create_data_mart_url` in the web app. A connection with read scope alone must obtain write scope before setup mutations.
- **Business User:** ask a Project Admin or a Data Owner of the project to create and publish a data mart and share it with you for reporting.

After publication and any initial connector run, ask the assistant to continue reporting discovery. Reconnection is only needed if the connection lacks required write scope.

### The wrong project is connected

Project selection is fixed at authorization time. See [Switch projects or disconnect](#switch-projects-or-disconnect) for how to reconnect and choose a different project or use another project-specific URL.

### A `query_data_mart` call fails

A failed query costs nothing — OWOX bills a call only after it succeeds. This covers queries that time out, queries you cancel, and queries the credit limit blocks.

If the assistant reports that the project is out of credits, `query_data_mart` has hit its credit limit — upgrade the plan to keep querying (the read-only tools keep working). If it says a field wasn't found, it likely guessed a field name; ask it to check the data mart's fields first with `get_data_mart_details_by_id`, then re-run the query.

### A Google Sheets destination is missing after browser setup

For Google Sheets without `credential_id`, `add_destination` starts Credential setup. It does not create a destination.
The user must complete the browser form with the same OWOX account that connected MCP.
The user must also be a member of the connected project.

Call `get_credential_setup_status` with the returned `setup_id`.
If the status is `pending`, repeat the call after the user completes the form.
If the status is `completed`, call `add_destination` again with the exact `credential_id` and the intended destination title.
Use the returned `destination_id` for reports.
If setup is `cancelled`, `expired` or missing, first recover the saved Credential
as described in [Credential management](#credential-management).

### A `run_report` call fails

If the report uses a pull-based destination such as Looker Studio, it cannot be started through `run_report`. If the error says the report is already running or pending, use `get_report_run_status` for the existing `run_id` if you have it, or check Run History in OWOX Data Marts before starting another run.

### `add_report` returns `initial_run.status: failed_to_queue`

The report was created successfully, but its first run was not queued. Do not call `add_report` again because that would create a duplicate report and, for Google Sheets, another file. Call `run_report` once with the returned `report_id`, then poll `get_report_run_status` with its `run_id`. The same applies when `update_report` returns `run.status: failed_to_queue` — the update is saved; retry delivery with `run_report`.

### `add_report` returns `error_code: similar_report_exists`

Nothing was created: you already have a report exporting the same fields from this data mart to this destination, and the response carries it under `existing_report`. Ask the assistant to change that report instead (it calls `update_report`), or say explicitly that you want a separate report — the assistant then retries with `allow_similar: true`.

### `add_report` with `spreadsheet_id` fails to open the spreadsheet

The destination's connected Google account must be able to edit the spreadsheet. Share the spreadsheet with that account (see [Google Sheets destination](../../destinations/supported-destinations/google-sheets.md)), or omit `spreadsheet_id` to create a new file. A sheet with the report's name must not exist yet in that spreadsheet — pick another report name if it does.

## Related docs

- [Roles and permissions](../../project/roles-and-permissions.md)
- [Destination Management](../../destinations/manage-destinations.md)
- [Google Sheets destination](../../destinations/supported-destinations/google-sheets.md)
- [Report Triggers](./report-triggers.md)
- [API Keys](../../api/api-keys.md)
