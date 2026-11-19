# MCP Promo Events

MCP promo elements point users to Claude and ChatGPT. Each element sends two events. This file is the contract for every surface that sends them.

## Contract (every surface)

| Event               | When                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_promo_shown`   | When the element first becomes visible: a shown row, line, block or hint, an opened popover, or a shown toast. Each surface says how often an element sends it. |
| `mcp_promo_clicked` | On each click on an element action.                                                                                                                             |

### Properties

| Property    | Values                                         | Meaning                                                                               |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `surface`   | See the surface values below.                  | The product surface that sent the event. Required.                                    |
| `placement` | One of the placement ids below.                | The screen element that sent the event.                                               |
| `mcp_part`  | `consumption`, `setup`, `both`                 | The part of MCP that the element promotes.                                            |
| `mode`      | `prompt`, `connector`                          | The element offers a ready prompt or the connector.                                   |
| `action`    | `claude`, `chatgpt`, `copy`, `docs`, `details` | The clicked action. Only on `mcp_promo_clicked`. `details` opens the dialog of a row. |

### Surfaces

| `surface` value       | Product                      |
| --------------------- | ---------------------------- |
| `web_app`             | OWOX Data Marts web app.     |
| `sheets_extension`    | Google Sheets extension v2.  |
| `excel_addin`         | Excel add-in.                |
| `sheets_addon_legacy` | Legacy Google Sheets add-on. |

`surface` is required on every event. A placement id is unique only within its surface. Every query must filter by `surface`.

Each surface adds its own placement table to this file. Use one table per surface.

## Web app transport (GTM dataLayer)

The web app sends both events to the GTM dataLayer with the category `McpPromo`.

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| `category` | `McpPromo`                                                       |
| `action`   | `Shown` for `mcp_promo_shown`, `Clicked` for `mcp_promo_clicked` |
| `label`    | The placement.                                                   |
| `context`  | `mcp_part`.                                                      |
| `value`    | The clicked action. Only on `mcp_promo_clicked`.                 |
| `details`  | A JSON string with all properties.                               |

### Web app placements

| Placement id                 | `mcp_part`    | `mode`      | Screen                                                                                                                                                                                                              |
| ---------------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidebar_connect`            | `both`        | `connector` | Sidebar footer, above Help, on every page. The "Connect AI assistant" row opens a popover.                                                                                                                          |
| `create_data_mart`           | `setup`       | `prompt`    | Create Data Mart page. Line under the Create Data Mart and Go back buttons.                                                                                                                                         |
| `data_setup_toast`           | `setup`       | `prompt`    | Data Setup tab, right after a Data Mart is created. Toast. It is skipped when the Data Mart is not a draft, or when the link has `connectorName`, a `CONNECTOR` preset or the `TABLE` preset.                       |
| `data_setup_card`            | `setup`       | `prompt`    | Data Setup tab of a draft Data Mart. Row at the top of the tab. A published Data Mart shows `data_setup_card_maintain`.                                                                                             |
| `data_setup_card_maintain`   | `setup`       | `prompt`    | Data Setup tab of a published Data Mart. Row at the top of the tab. A publish while the tab is open replaces `data_setup_card` with it.                                                                             |
| `overview_card`              | `consumption` | `prompt`    | Overview tab of a published Data Mart. Row at the top of the tab.                                                                                                                                                   |
| `storage_sheet`              | `setup`       | `prompt`    | Config sheet of Storages, opened from the Storages list or from the Storage card of a Data Mart. It shows right after the type pick creates the Storage, and when a Storage with an incomplete config opens.        |
| `data_setup_storage_hint`    | `setup`       | `prompt`    | Data Setup tab, Storage card. Hint under "Storage configuration is incomplete" or under the validation error of the Storage. A configured, valid Storage shows no hint.                                             |
| `storage_sheet_maintain`     | `setup`       | `prompt`    | Config sheet of Storages, opened from the Storages list (row click or `?id=` link) or from the Storage card of a Data Mart. It shows when the config of the Storage is complete. Not right after the type pick.     |
| `destination_sheet`          | `setup`       | `prompt`    | Add sheet of Destinations, opened from the Destinations list. The edit sheet shows `destination_sheet_maintain`.                                                                                                    |
| `destination_sheet_maintain` | `setup`       | `prompt`    | Edit sheet of Destinations, opened from the Destinations list (row click or `?id=` link).                                                                                                                           |
| `credential_sheet`           | `setup`       | `prompt`    | Add sheet of Credentials, opened from the Credentials page. Not the edit sheet.                                                                                                                                     |
| `context_sheet`              | `setup`       | `prompt`    | Add sheet of Project settings, Contexts. The edit sheet shows `context_sheet_maintain`.                                                                                                                             |
| `context_sheet_maintain`     | `setup`       | `prompt`    | Edit sheet of Project settings, Contexts, opened by an admin. Not the read-only sheet of a member.                                                                                                                  |
| `connector_builder`          | `setup`       | `prompt`    | Custom connector page (`/connectors/builder/new` or `/:id`), Builder mode, until the first publish. After it, the page shows `connector_builder_maintain`. Not on a test link (`?test=`) that an AI assistant made. |
| `connector_builder_maintain` | `setup`       | `prompt`    | Custom connector page (`/connectors/builder/:id`), Builder mode, after the first publish. Not on a test link (`?test=`).                                                                                            |
| `report_sheet`               | `setup`       | `prompt`    | Create sheet of a report for any destination type, opened from the Destinations tab of a Data Mart. The edit sheet shows `report_sheet_maintain`.                                                                   |
| `report_sheet_maintain`      | `setup`       | `prompt`    | Edit sheet of a report, opened from the Destinations tab of a Data Mart or from the Reports page. Not the report sheet of an Insight.                                                                               |
| `empty_project`              | `setup`       | `prompt`    | Data Marts list with no Data Marts. The "Set it up with AI" block under the illustration. On narrow screens it is under the options.                                                                                |
| `reports_hint`               | `consumption` | `connector` | Reports page, empty state. `AiAssistantHintCard`.                                                                                                                                                                   |
| `reports_promo`              | `consumption` | `connector` | Reports page. Claude and ChatGPT `PromoBlock`.                                                                                                                                                                      |
| `destinations_tab_card`      | `consumption` | `connector` | Destinations tab of a Data Mart. `AiAssistantDestinationCard`.                                                                                                                                                      |
| `destinations_empty_tab`     | `consumption` | `connector` | Empty Destinations tab of a Data Mart. The rotating "mcp" tab. Shown when that tab becomes the active one.                                                                                                          |
| `setup_checklist`            | `both`        | `connector` | Setup checklist step "Connect AI assistant".                                                                                                                                                                        |

The placements `reports_hint`, `reports_promo`, `destinations_tab_card`, `destinations_empty_tab`, and `setup_checklist` keep their visibility and send events whether or not `mcpServerUrl` is set. The other placements render and send events only when `mcpServerUrl` is set.

Every `setup` placement shows only to admins and editors. This is a product rule: a Business User sees no setup block, also where the MCP tools accept a viewer (Destinations, Credentials, reports). The Context placements (`context_sheet`, `context_sheet_maintain`) show only to admins. `sidebar_connect`, `overview_card` and the five placements above show to every role.

How often an element sends `mcp_promo_shown`:

- Sheet lines (`storage_sheet*`, `destination_sheet*`, `credential_sheet`, `context_sheet*`, `report_sheet*`): once per open of the sheet. The Storage sheet keeps the placement it opened with, also when a save completes the config while the sheet closes.
- `data_setup_storage_hint`: once per mount, when the Storage card is expanded. A collapsed card sends it when it opens.
- Custom connector page (`connector_builder*`): once per visit of the page for each placement. A switch to Code mode and back sends no second event.
- `sidebar_connect`: once per open of the popover.
- `data_setup_toast`: once per shown toast.
- Other placements: once per mount of the element.

How each `prompt` placement looks, and its `action` values:

- Row (`data_setup_card*`, `overview_card`, `connector_builder*`): the Claude and ChatGPT icons, a title and a chevron. The row darkens on hover and on keyboard focus. A click opens a dialog (`details`) with the Claude and ChatGPT tabs, the prompt, the open and copy buttons, and the MCP setup guide link (`claude`, `chatgpt`, `copy`, `docs`). The dialog sends no second `mcp_promo_shown`. The row has no hide button.
- Line (sheet placements and `create_data_mart`): one line under the Save and Cancel buttons, "Or finish this in Claude · ChatGPT". A `*_maintain` placement says "Or change this in". The links open the chat with the prompt in a new tab (`claude`, `chatgpt`). No dialog and no copy button.
- Block (`empty_project`): a separate "Set it up with AI" card with Open in Claude, Open in ChatGPT and Copy prompt (`claude`, `chatgpt`, `copy`).
- Hint (`data_setup_storage_hint`): one sentence with the Claude and ChatGPT links (`claude`, `chatgpt`). A click on a link does not open the Storage sheet.
- Toast (`data_setup_toast`): the Claude and ChatGPT links, the copy button and the MCP setup guide link.

A change from a setup placement to its maintain placement while the element is visible mounts the element again and sends `mcp_promo_shown` for the new placement.

The Claude and ChatGPT links of a prompt put the project id and the object ids into the `?q=` parameter of claude.ai and chatgpt.com on purpose. An id gives no access by itself. Names and titles never go into a prompt.
