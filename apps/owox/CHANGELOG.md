# owox

## 0.33.0

### Minor Changes 0.33.0

![OWOX Data Marts – v0.33.0](https://github.com/user-attachments/assets/daf1137e-334f-44f8-abd2-3a4bfad4be68)

- b3d008d: **Calculated Fields in the Output Schema**

  An analyst can now define a Calculated Field directly in a Data Mart's Output Schema — a formula written in that Data Mart's own warehouse SQL, such as `SUM(clicks) * 1.0 / NULLIF(SUM(impressions), 0)` for a click-through rate. Unlike a ratio hard-coded into a Data Mart's SQL, it recomputes at whatever grain the request asks for, so a report broken down by day, a Google Sheet, a Looker Studio page, an MCP agent, an HTTP Data caller and a report's Totals row all get the true ratio of the sums rather than an average of per-row ratios.

  Whether the field is a metric or a dimension is read from the formula rather than chosen, and the formula is checked when the schema is saved — every problem names the field it belongs to, and the resulting query is test-run against the warehouse once per save, so a broken formula is caught before anyone builds a report on it. Available on Google BigQuery, AWS Athena, Snowflake, AWS Redshift and Databricks; see [Calculated Fields](https://docs.owox.com/docs/getting-started/setup-guide/calculated-fields/) for what each dialect supports and the limitations to know about.

  **Six changes to the Calculated Field editor** (ad7d572), from feedback on the released version:
  - **A row-level field keeps its "Σ available" control while its formula is edited.** Touching the formula of a calculated field that is a dimension took that control off the row until the schema was saved, which read as the setting having been lost.
  - **Unsaved edits survive a background refresh.** The Output Schema editor reset itself whenever the Data Mart was re-read — which happens on its own, without anyone asking — and a formula typed but not yet saved went with it, while a failed save's errors stayed on screen naming a field no longer in the table. It now resets only when the saved schema has actually changed.
  - **A rejected formula is named where the refusal appears.** Choosing "Save & leave" on the unsaved-changes prompt reported `Request failed with status code 400`, which names neither the field nor the fix. It now names the field the warehouse rejected.
  - **A calculated field no longer stretches its row.** A formula written over several lines made its row that many lines tall. The row now shows at most two lines — the most it can show without growing — and hovering it shows the whole formula with the author's own line breaks.
  - **The division warning is about the formula in front of you.** It quoted `NULLIF(SUM(impressions), 0)` whether or not `impressions` appeared anywhere in the formula, and read like a refusal although it blocks nothing. It now quotes the denominator this formula actually divides by, underlines it in the editor, and says plainly that it is advice. It quotes the whole denominator or nothing at all — never a piece of one, since guarding a piece leaves the division just as broken and silences the warning.
  - **`COALESCE` no longer counts as a guard against that division.** What fails a query is a zero denominator, not a null one — and `COALESCE(SUM(x), 0)` produces exactly the zero that fails it. The message and [the setup guide](https://docs.owox.com/docs/getting-started/setup-guide/calculated-fields/) now say zero rather than "zero or empty", and the guide explains why `COALESCE` does not count. The guide also gains a worked example for rates over a condition, such as an activation rate.

- a4dc4ff: **Send Reports to Microsoft Excel Destination**

  Open the OWOX add-in in a workbook, pick a published Data Mart, and the report's rows land in the worksheet. The report then appears in OWOX Data Marts with its title, its run history and its last-run status, and its columns, filters and sorting can be edited there afterwards.

  A workbook sits on your machine, so nothing can be pushed into it — the add-in reads the report itself. Four things follow from that:
  - You are not asked to name a document in advance. The worksheet you opened the add-in from is where the rows go.
  - Such a report is created in the add-in, which is what binds it to a worksheet. The web app offers neither the report nor the destination for creation: the add-in sets both up on first use, and a report made in the web app would be one no workbook points at.
  - It cannot be run or scheduled from the web app. The web app says so instead of offering a button that would fail; refresh it from the add-in.
  - Refreshing from the add-in _is_ the report running, so the status shown in Excel and in the web app is the same one.

  Runs from Excel are billed as **Excel Report Run**, a sub-consumption unit of Report Run.

- 47a3dc3: **Reuse project Credentials across plugins**

  Projects can now store and manage reusable Credentials with owners, sharing, Contexts, operational state, and dependency visibility. Plugins declare exact provider or logical AI requirements and members explicitly select eligible Credentials during installation, while raw secrets remain in the host. External Credential definitions can be added from public GitHub repositories or private repositories available through the deployment's configured GitHub access. Plugin authors use the same typed `exactCredential` helper for built-in and external definitions.

  See [Credentials](https://docs.owox.com/docs/project/credentials/) and [Credential definitions](https://docs.owox.com/docs/plugins/credential-definitions/) for setup and authoring details.

- cb22b51: **Report output column schema**

  `GET /reports/:id/output-schema` returns the columns a report's rows will carry — name, title, description and type — including aggregated columns (`revenue | SUM`), Unique Count and calculated fields, which do not exist on the Data Mart schema.

  Joined fields in Excel reports now use the same header form as Google Sheets: `Field name (Data Mart name)`, so the field name stays visible in a narrow spreadsheet cell.

- 23f0d09: **Plugin release rejections are now visible, and collection compatibility follows SemVer**

  When a plugin's GitHub release was rejected during sync, the reason was stored in the database and communicated nowhere: no log line, no audit detail, nothing in the UI. From the outside it looked like "Check now did nothing" — the plugin stayed on an old version with no explanation. Now every publisher-fixable rejection is visible in three places:
  - **Application logs** — both the daily check and manual "Check now" log a warning per rejected release, e.g. `owner/plugin: v0.1.2 rejected (COLLECTIONS_INCOMPATIBLE) — Collection "dashboards" cannot change entity binding`. Rejections that are permanent by design (drafts, prereleases, non-SemVer tags) stay out of the log so they cannot bury the one line that matters.
  - **Audit trail** — the `UPDATE_CHECK` audit record now carries the rejection summary, not only thrown transport errors.
  - **Plugin page** — publishers see a "Release issues" card listing each rejected release with its code, reason, and the time of the check, and "Check now" tells a publisher directly when the fresh check rejected a release instead of reporting "up to date".

  The collection-compatibility safeguard is also back, now gated on SemVer: within a compatibility line a release may add collections and change action mappings, but cannot remove a collection or change its name, scope, or entity binding — the previous version stays current and the reason says how to proceed. Opening a new line waives the check, so a breaking collection change ships by declaring itself as one: a major version bump, or a minor bump while the plugin is still below 1.0.0 (where SemVer promises no stability).

- 885b1ba: **Report filters: one "is blank" pair instead of four null/empty operators**

  A blank spreadsheet cell renders identically whether the warehouse holds `NULL`, an empty string, or whitespace — so offering "is empty" and "is null" side by side forced users to guess, and the wrong guess silently returned 0 rows. The filter picker now offers a single pair, **is blank** / **is not blank**, defined by what the cell shows rather than by warehouse state.

  The pair is type-aware on every supported storage (BigQuery, Athena, Redshift, Snowflake, Databricks): a string column is blank when it is `NULL`, `''`, or whitespace-only; a number, date, time, or boolean column is blank only when `NULL`. The MCP `query_data_mart` and report tools advertise the same single pair, and the Data API accepts `is_blank` / `is_not_blank` in filter rules.

  Nothing saved breaks: reports and API calls that use the previous `is_empty`, `is_not_empty`, `is_null`, or `is_not_null` operators keep working with their exact previous semantics, and saved rules still display under their original names. Only the menus stop offering them.

- dc3b2ad, 4bfd303: **Join descriptions: shown in the column pickers, and editable per join path**

  - **Shown in the pickers** (dc3b2ad) — report column pickers in the web app and the Google Sheets extension now show each joined Data Mart's description and full join path on hover, using the same user-facing titles as the picker.
  - **Editable per join path** (4bfd303) — a join description explains what pulling in another data mart actually means: business users read it in the report column picker, and AI assistants read it over MCP. It was written once on the relationship itself, so every data mart that reached that join showed the same sentence. "Orders placed by this customer" is right in a Customers data mart, but in a Companies data mart that reaches Orders through Customers it explains nothing.

    The Description tab of an inherited join is now editable. The inherited text stays visible as a placeholder, and whatever you type applies to that join path only — the relationship itself, and every other data mart that inherits it, keep their own wording. Clearing the field, or the new **Reset to inherited** button, falls back to the inherited description. Nothing changes until someone types: a join with no description of its own behaves exactly as before. Wherever a description is shown — the join-path tooltip in the report column picker, and `joins[]` in the MCP data mart details — it is the one that applies to that particular path.

- 19e9fb8: **Report links point at the report, not at the Data Mart**

  The provenance block in a Google Sheets imported column's note now ends with **Report page** and a link that opens the report itself — the Reports tab with that report's panel already expanded — instead of the Data Mart setup tab.

  That note is the only in-sheet trace of where the data came from, and it is usually opened when a sheet has stopped refreshing. It now lands on the report whose schedule and run history explain what happened, rather than leaving you to find it among all the reports of that Data Mart. The Data Mart name stays on its own line above the link.

  The **Open report in OWOX Data Marts** button on a Google Chat report card and the **Edit report** link in a report email footer now open the same deep link. Both previously landed on the Data Mart's report list, leaving the reader to pick the right report out of it.

- d13a90d: **Schedule Data Mart triggers in UTC**

  Scheduled triggers now offer UTC as an explicit fixed-offset timezone with no daylight saving time changes. Existing UTC aliases remain compatible, and legacy Europe/Kiev identifiers are shown as Europe/Kyiv without rewriting saved schedules.

- 67f5afa: **Cheaper incremental imports into Google BigQuery**

  Incremental connector runs into Google BigQuery now read only the days they update. Before, every incremental run scanned the whole destination table, including all of its history, so as a table grew each daily import cost more even when it brought the same amount of new data. Now the import touches only the partitions for the imported dates, so the cost stays flat over time. This applies to time-series tables partitioned by date, such as ad performance reports. Entity tables without a date column, such as campaign lists, keep their current behavior. Users see lower BigQuery query costs and fewer daily quota errors.

- 9375f07, de49dce: **Resumable incremental imports for Microsoft Ads, Google Ads, Reddit Ads, Criteo, and X Ads**

  Previously, an interrupted incremental run restarted the whole date range from the beginning, so long imports could retry endlessly without ever finishing. These connectors now save their progress as the import advances — Microsoft Ads after each imported day (9375f07), and Google Ads, Reddit Ads, Criteo and X Ads as the import advances (de49dce) — so an interrupted run resumes from the last completed date instead of starting over.

  Microsoft Ads also stops early with a clear message when the Account IDs field holds no usable ID, or when Fields references a report the source no longer provides.

- da26589: **Connector runs interrupted by a restart are reported as a warning**

  When a server restart stops a connector run, the run resumes by itself and continues from the last day it finished. Run history now shows this as a warning instead of an error, so a restart no longer looks like a failed import. Runs that stop for any other reason are still reported as errors.

- d013726: **Checkout and cart tokens for Shopify orders**

  The Shopify connector now offers `checkoutToken` and `cartToken` fields on the `orders` node. Select them under `orders` in the connector's field picker to import them. `checkoutToken` matches `checkout.token` in Shopify Web Pixel events, so you can join orders with `checkout_completed` events; `cartToken` identifies the cart that produced the order. Orders with no associated checkout or cart return NULL. Orders imported before you enable the fields stay NULL until you re-import them with a backfill run.

- a25b495: **Connect Google Sheets sources with Google OAuth**

  Users can authorize a Google account and choose a spreadsheet with Google Picker when configuring a Google Sheets source. Service account authentication remains available.

- 94c23bc: **Labeled retry settings in connector Advanced settings**

  Every connector's **Advanced settings** form now shows **Max Fetch Retries** and **Initial Retry Delay (ms)** instead of raw keys. The hints state that the delay is in milliseconds and that the retries value counts total attempts, including the first request. This prevents a delay of `5` being read as five seconds when it means five milliseconds.

  The Facebook Ads troubleshooting guide now explains Meta's Ads Insights rate limit (code 4, subcode 1504022), the ad-account score limit (code 17, subcode 2446079), and how to adjust these settings after a rate limit error.

- f7b099a, 7667281: **Joinable Data Marts diagram opens fitted to the whole graph, and its zoom controls keep working**

  - **Opens fitted** (f7b099a) — switching to the Graph view could land on a viewport zoomed in on the root card, as if the fit had never run, until "Fit to view" was pressed. The automatic first fit relied on `fitView`, which only accounts for nodes whose DOM dimensions are already measured — on first mount it ran against a half-measured subset. The initial viewport is now derived from the layout geometry itself, so the Graph view always opens showing the entire diagram, exactly as the "Fit to view" button leaves it.
  - **Zoom controls keep working** (7667281) — the +/- zoom buttons could stop responding until "Fit to view" was pressed, depending on how the page was opened. The allowed zoom range was captured once from a completed fit, so a fit that ran under transient conditions (a still-loading graph or a settling pane) froze the range in an unusable state. The range is now derived from the live graph and pane geometry, small graphs that fit at the maximum zoom keep a usable zoom-out floor, and a corrupted viewport recovers with a full fit instead of ignoring clicks.

- 3c16cd6: **Help videos now stream from Cloudflare instead of GitHub attachments**

  Three in-product help videos — "SQL to Google Sheets in Minutes", "Data Studio Setup", and "Getting Started with Data Marts" — used to load from GitHub issue-attachment storage. Those URLs redirect through short-lived signed links and fail entirely for clients whose networks block github.com, so the videos could show up broken.

  Now all six help videos use the same Cloudflare Stream player. The three migrated videos keep their previous behavior (autoplay, muted, loop) and their exact aspect ratios.

  The documentation site picks up the same fix: pages that embedded the GitHub-hosted files now render the Cloudflare player, while the repository markdown keeps the GitHub links so videos still play inline on github.com. The Google Sheets destination page also gains the setup walkthrough video.

- dcf9b52: **The OWOX BI link opens the current project**

  When you are in a Data Marts project and choose OWOX BI from the project menu, you land in that same project on bi.owox.com instead of the BI home page.

- 8aff351: **Remove obsolete Slack Community links**

  The Help menu no longer shows the obsolete Slack Community invitation, and project documentation now directs contributors to GitHub Discussions and Issues instead.

### Patch Changes 0.33.0

- @owox/internal-helpers@0.33.0
- @owox/idp-protocol@0.33.0
- @owox/idp-better-auth@0.33.0
- @owox/idp-owox-better-auth@0.33.0
- @owox/backend@0.33.0
- @owox/web@0.33.0

## 0.32.0

### Minor Changes 0.32.0

![OWOX Data Marts – v0.32.0](https://github.com/user-attachments/assets/2c8c767b-0740-48cb-9e62-5a5ea6bbd10a)

- 3674b59: **Count unique records from any joined Data Mart**

  Every joined Data Mart now offers a `Unique Count` field in the report column picker, counting distinct records by that Data Mart's primary key. It answers "how many orders per customer" without adding an order column to the report. Composite keys are supported. The field can be selected and sorted by, but not filtered or fed into another aggregation.

  In the picker it is simply `Unique Count`, listed under the joined Data Mart it belongs to, with a tooltip naming that Data Mart and the key columns being counted. In the produced file it is named like every other joined field: `Unique Count (Orders)` in Google Sheets, `Orders Unique Count` everywhere else.

  With no usable primary key the field is shown disabled, and its tooltip says which Data Mart and why — no key set, part of the key disconnected, a nested key, or both of the last two. The report's own Data Mart says instead that no primary key is available for reporting.

  A key column marked **Hidden for Report** still counts, on the report's own Data Mart as well as on a joined one. Hiding a column takes it off the list of fields a report can show; counting distinct values of it puts nothing in the output, so there is nothing to hide. On the report's own Data Mart this is new — such a key used to leave the row disabled.

  **Some existing reports will show different numbers, and the new ones are correct.** Rows whose declared primary key is empty used to be treated as one single record. That was wrong in three ways, and all three are fixed. A Data Mart with no declared key, or one whose key is always filled, is untouched.
  - **`Unique Count` on a composite key was too high** and now goes down. Every row with an empty key component counted as one extra record — while a single-column key had always ignored such rows, so the same declaration behaved differently depending only on how many columns it had. Applies to any Data Mart with a composite key, joined or not.
  - **`Sum` and `Average` on a joined Data Mart were too low** and now go up. All rows sharing an empty key collapsed into one, so the metric read a single row instead of all of them — verified on BigQuery, where twenty such rows summed to the value of one row before the fix and to all twenty after. `Min`, `Max`, the percentiles and `Combined` can shift for the same reason. The two metrics part ways on such a row on purpose: `Unique Count` does not count a record with no identity, while `Sum` still reads its value, so one report can legitimately say `0 orders, worth 2000`.
  - **A key unique only within what it is joined on is now counted per join key**, and the number rises sharply. A line number restarting at 1 in every order reported 12 — the largest order's line count — for a book of 4,300 line items. It now reports 4,300, which is what `Sum` and `Average` on that same key had always meant by it.

  Cached report data is cleared on upgrade, so an unedited report shows the corrected numbers on its next run rather than serving what it had cached.

  Two smaller corrections in the same direction: two different composite keys that ran together into the same text now count as two records rather than one, and on **Amazon Redshift** a composite key holding a text part longer than 256 characters is no longer cut short and merged.

  One correction goes the other way, and removes a column rather than changing a number. On the report's own Data Mart, a **composite** key one of whose columns had **disconnected** from the source was quietly counted by the columns that remained — which merges records the full key keeps apart, so the count read low with nothing to say so. Such a key now withholds the metric entirely, exactly as a joined Data Mart's already did. Reconnect the missing column, or drop it from the key, and the count comes back.

  **Primary-key declarations worth a second look.** Only where the **report's own** Data Mart is counted on a **composite** key, whose columns are joined into one value and read as text:
  - a **floating-point** part can make two records count as one, when their values differ only in digits beyond what the text form shows;
  - a **date-time** part can do the same — a warehouse writes it at whatever precision it is configured to show, thousandths of a second on **Snowflake** by default — so two records moments apart count as one;
  - a **binary** part can stop the report with the warehouse's own error message rather than an OWOX one.

  Prefer whole-number or text columns, or dates without a time part. A **joined** Data Mart's `Unique Count` reads every part of its key as it stands, so none of this applies there. A key declared on a structured column — JSON, geographic, variant — is not one a warehouse can group by, and stops the report either way.

- d9356e1: **Require an OWOX Data Marts Cloud license for Report Runs**

  Every Report Run — Google Sheets, Looker Studio, Email, Slack, Google Chat, MS Teams, HTTP Data, and MCP Query — is now authorized with OWOX Data Marts Cloud before it executes, and its consumption is billed to the project signed into the license key. Without a valid key the deployment runs as Community and Report Runs finish as Restricted with an actionable message; configuration is never hidden or deleted, and Process Runs are unaffected.

  Community deployments can now configure every destination type, including Email, Slack, Google Chat, and MS Teams — the license gates only Report Run execution, not configuration.

  Project administrators can create, rename, and revoke license keys in Project Settings → License keys. A key is bound to one deployment origin, is shown once on creation, and expires after 365 days. To rotate, create a new key, update the deployment, then revoke the old one.

  Legacy offline Enterprise license keys are no longer supported and fall back to Community.

- a30ab25: **Plugin collections: host-stored JSON documents for installed plugins**

  Plugins can declare project- or member-scoped collections in `plugin.json` and access them through `ctx.collections(name)`. The host persists JSON documents, applies the collection's entity authorization rules, and keeps credentials out of the plugin frame.

  The SDK collection facade supports paginated `list`, nullable `get`, `put`, and `delete` operations. Entity-bound writes include an immutable `parentId`, allowing the host to authorize every operation against the current member's access to the parent entity.

- 918026f: **Data Last Updated Date for AWS Redshift, AWS Athena, Snowflake, and Databricks**

  **Data Last Updated** now works for four more storages, on every surface where it already worked for BigQuery: the Data Mart page, the Data Marts list, the model canvas, and MCP `query_data_mart` responses. In each case OWOX asks the storage which tables the executed query reads — views and SQL Data Marts resolve through to their underlying base tables — and then reads each table's last data change. When a table that cannot be measured sits alongside measurable ones, the coverage becomes partial, so the reported value stays a lower bound: the real time can only be more recent.
  - **AWS Redshift** (918026f) — reads each table's last data modification time from Redshift's own metadata; materialized views report the time of their last refresh. No setup is needed. Expect the value to trail reality slightly: Redshift refreshes this metadata with a delay of up to about five minutes, so a load that just finished may take a moment to show. Spectrum external tables, whose data lives outside Redshift, and tables Redshift reports no modification time for show as unknown.
  - **AWS Athena** (53e2b84) — what can be reported depends on the table format. **Iceberg** tables answer exactly: the value is the time of the last commit to the data, visible right after a write. Classic **Hive** tables show **Unknown** instead — their catalog stores no record of when the data changed, and the timestamps it does keep also move when someone only edits the table definition, so reporting one could present stale data as freshly updated. Tables from federated catalogs are not measured either. No setup is needed.
  - **Snowflake** (b81cdb2) — reads each table's last **data** change from the account's DML history. The connection role needs access to the `SNOWFLAKE` database (account usage) — without it, Data Marts show Unknown. The value is the start of the hour in which the data last changed, and it can trail reality by several hours, because Snowflake publishes this history with a delay. Schema changes and Snowflake's own background maintenance do not move the value, so the reported time never overstates how fresh the data is. A table with no recorded data changes in the last year shows **Unknown** with a note, and a dropped-and-recreated table answers for its current generation only, never for its predecessor's history. Materialized views, Iceberg tables (whose data can change outside Snowflake), and other objects the history cannot answer for appear as unknown sources.
  - **Databricks** (15166aa) — reads each **Delta** table's history for the last commit that actually changed data; the answer is exact and immediate. Maintenance operations do not count: a table that was only compacted by OPTIMIZE or cleaned by VACUUM keeps the timestamp of its last real write. Delta table history is kept for a limited period (30 days by default), so a table whose data last changed earlier shows **Unknown** with a note. Non-Delta and external tables have no history and show Unknown too. No setup is needed.
  - **In MCP** (e387fee) — the AI assistant is now asked to present the `data_last_updated` timestamp in a business-friendly form (e.g. "August 4, 2026 at 09:46 UTC", converted to the user's time zone when known) instead of echoing the raw ISO-8601 value. The structured response still carries the ISO-8601 timestamp for machines.

- 7edd34f: **The "Row Count" column is removed from aggregated reports**

  Previously, every aggregated report automatically included a `Row Count` (`COUNT(*)`) column, even though it was never selected. The column has been removed: reports — and the MCP and HTTP data endpoints — now return only the columns you selected. If you need the number of underlying rows per group, apply the **Count** aggregation to a column that is always filled (an ID column works well); to count unique entities, use a Unique Count. A column of your own named "Row Count" is also no longer rejected in aggregated reports.

  What changes in existing reports:
  - **Google Sheets** — on its next run, an aggregated report removes the `Row Count` column from the sheet structurally, shifting everything to its right one column left. Formulas and pivots referencing that range move with it — repoint anything that read `Row Count` to an explicit **Count** column first.
  - **Data Studio** — `Row Count` was a schema field of the data source, and Looker Studio keeps requesting fields by their stored names. A chart built **only** on `Row Count` starts failing with an error naming the missing field; a chart that also uses other fields keeps working but silently drops the `Row Count` column. Open the data source and use **Refresh fields**, then rebuild the affected metric on an explicit **Count** field. Because report data is cached, individual reports switch to the new column set gradually as their cache entries expire (from minutes up to the cache lifetime configured on the report).

- 94e32a1: **Optional description for Data Mart relationships**

  Each join between Data Marts can now carry an optional free-text description explaining the business meaning of the relationship (e.g. "Visitors from the website sign up for the product and convert into users").
  - **Data Setup UI** — a joined Data Mart's card gets a new **Description** tab next to Join Settings, with an autosaving text area. Inherited (transitive) joins show where to edit the description instead.
  - **API** — `POST`/`PATCH /data-marts/:id/relationships` accept an optional `description`, and relationship responses return it. Sending `null` or an empty string clears it.
  - **MCP** — `get_data_mart_details_by_id` with `detail_level=with_joined_fields` now returns a `joins` array — one entry per join edge with the joined data marts, the join key fields, and the relationship description — so AI assistants understand not only which fields a join contributes but how and why the data marts relate.

- e387fee: **Joinable Data Marts diagram: filters on the toolbar and the same view settings as the Models canvas**

  The **Status** and **looped data marts** filters moved out of the diagram's gear popover onto the toolbar, right next to search — the same place the Models canvas keeps its filters. They are now dropdowns (`All statuses` / `Published only` / `Draft only`, and `Hide looped data marts` / `Show looped data marts`). More importantly, the filters now cover **both views**: previously they only trimmed the Graph, so switching to List silently showed a different set of relationships. The List now applies the same rules as the diagram — including subtree semantics, where hiding a data mart also hides everything joined through it. Saved filter preferences carry over unchanged.

  The gear is back, and now holds the same view settings as the Models canvas, shared component and all:
  - **View** — switch cards between **Compact** and **Detailed**; Detailed shows the joined mart's field rows (name + type, hidden-for-reporting fields dimmed), collapsed to 4 rows with an in-place "+N more" toggle.
  - **Layout algorithm** — **Horizontal** or **Vertical**; the diagram now uses the same dagre layout engine as the Models canvas.
  - **Show join fields** — join conditions (`source = target`) rendered as labels on the relationship lines.
  - **Object labels** — toggle the input-source badge and accent stripe, the field count, and the status dot per card, with "Check all" / "Uncheck all" shortcuts.

  All settings are remembered per browser, and the inline and fullscreen diagrams stay in sync.

- e387fee: **Include field descriptions in the Models canvas exports**

  The Models canvas export dropped the business descriptions of Output Schema fields: in the OKF bundle the schema table's Description column carried only the PK/FK notes, and the JSON model graph omitted the field descriptions entirely. Both formats now carry each field's description as stored in the Data Mart:
  - **OKF (Markdown)** — the Description cell reads `PK.` → description. Multi-line descriptions collapse to a single line so they cannot break the Markdown table. The `FK to [Target]` notes left the schema table entirely: relationships live only in the Joins section, which already lists every join with its condition.
  - **JSON** — every schema field gains a `description` property when one is set, staying compatible with the OWOX Model Canvas graph format.

- cf830e3: **Give MCP assistants the complete project context**

  MCP clients now receive the full project description through `get_project_context`, together with the current project metadata. Assistants are instructed to call the tool before their first project-specific operation, while the always-on MCP initialization instructions remain focused on OWOX workflows, security, and tool usage.

  Project descriptions continue to support up to 10,000 characters and are returned without truncation. After an admin updates the description, the new value is available on the next `get_project_context` call without reconnecting the MCP client.

- 08ebbda: **Run newly created push-destination reports immediately through MCP**

  Newly created push-destination reports now run immediately by default when created through MCP `add_report`, and the response returns the initial `run_id` for status polling. Use `run_immediately: false` for configuration-only creation; Looker Studio remains pull-based. If queueing fails after creation, the response preserves the report id and directs the assistant to retry with `run_report` instead of creating a duplicate report or Google Sheet.

- 0301c9e: **Google Chat: direct webhook delivery, clearer setup, and delivery logs**
  - **Direct delivery** (0301c9e) — Google Chat Destinations now offer Incoming Webhook and Channel Email delivery methods. Existing email-based destinations keep their current method, while new destinations default to direct delivery through a space-specific incoming webhook. Webhook messages are formatted cards containing the subject, Data Mart name, rendered report, and a link back to OWOX Data Marts.
  - **Setup guidance and logs** (953f107) — destination settings now provide contextual instructions for choosing a delivery method and obtaining an incoming webhook URL or space email address. Report run logs identify the delivery method and destination without exposing webhook credentials, with per-part entries shown only when a report is split across multiple Google Chat messages.

- 7ffb499: **Copy a link to a Report**

  Reports now have a permanent direct link. Opening a report on the Data Mart Destinations tab puts it into the page URL, and a **Copy link** button in the report panel header lets you share that link with a teammate — opening it shows the page with the same report already open.

- 2549692: **Creating a report no longer stops you at "publish the Data Mart first"**

  Before, if your Data Mart was still a draft, the **New Report** button was simply greyed out with a tooltip saying "publish the Data Mart first" — you had to leave the page, find the publish button, publish, and come back to try again. Now clicking **New Report** on a draft Data Mart takes you straight to the next step:
  - If the Data Mart is ready to publish, you'll see **"Publish and create report"** — one click publishes it and opens the new report form right away.
  - If something is still missing (like a Storage or an Input Source), you'll see exactly what's missing and a **"Review Data Setup"** button that takes you right there.

- 3f94296: **Reliable bulk publishing for Data Mart drafts**

  Previously, publishing Data Mart drafts in bulk from a Storage's menu could fail for every draft with a generic "please check them independently" message, even when some drafts were ready to publish. This is now fixed, so drafts you have access to publish succeed as expected. When a draft still cannot be published, the notification names the reason — that it has no definition yet, for example, or that its table name is not in the expected format — so you know what to correct before trying again.

- 6f2364e: **AI metadata generation for SQL data marts: no dataset-creation permission, and visible failures**
  - **No `bigquery.datasets.create` required** (6f2364e) — generating AI metadata (field aliases and descriptions, data mart title and description) for a SQL-based data mart previously materialized a technical view in the `owox_internal_<location>` dataset, and creating that dataset on first use required the project-level `bigquery.datasets.create` permission — so users with data-only access (e.g. `BigQuery Job User` plus `BigQuery Data Viewer`) could not use the AI helper at all. Sample rows are now fetched through an inline derived table built from the data mart's own SQL (`SELECT <columns> FROM (<data mart sql>) LIMIT <n>`), so the AI helper needs exactly the permissions a regular report run needs:
    - Plain `SELECT` definitions are inlined on every storage type except legacy Google BigQuery.
    - `WITH`/CTE definitions are additionally inlined on Google BigQuery storage, where the SQL dialect accepts a CTE inside a parenthesized derived table; other storages keep the previous behavior for CTEs.
    - Legacy Google BigQuery data marts, SQL that cannot be inlined, explicit table references, and non-SQL definitions (table, view, pattern, connector) continue to use the technical-view path, with the existing human-readable error if permissions are missing there.
  - **Failures are now visible and understandable** (24932f6) — a missing BigQuery permission used to fail the run before the AI step, and the error toast auto-dismissed in seconds, so users never learned why nothing was generated. Generation errors now show as persistent, dismissible notifications instead of an auto-dismissing toast; leaving the page mid-generation leaves a notice that the run was cancelled. BigQuery permission errors are rewritten into a human-readable message naming the project and the missing permission, with the raw error expandable for support. AI helper trigger logs now include `dataMartId` and `projectId`, and the AI insights facade logs the caught error for failed metadata generation, so production incidents can be found by filtering logs on the data mart id.

- 03172e5: **Fix: "Copy from…" no longer shares or deletes another Data Mart's credentials**

  Using "Copy from…" to reuse a connector configuration from another Data Mart made both Data Marts point at the same stored credentials instead of copying the values. Saving the new Data Mart could then delete those shared credentials, wiping them on both.

  Copying a configuration that holds manually entered credentials now always creates its own credentials record, and a Data Mart can no longer write to or delete credentials that belong to another one. Data Marts that already share a record are separated automatically the next time each of them is saved.

  A few details worth knowing:
  - Connections authorized through OAuth are still shared between Data Marts, as they were before — such a credential belongs to the project rather than to a single Data Mart.
  - Credentials already wiped by this bug are not restored; those Data Marts need their credentials entered again.
  - A copied Microsoft Ads configuration starts from the source's current (rotated) refresh token, so the copy keeps working even when the originally entered token has already expired. From there each Data Mart rotates its own token independently.
  - Deleting a Data Mart no longer removes credentials that another Data Mart still references: the record is handed over to the referencing Data Mart instead, so a not-yet-separated pair cannot lose data through deletion.
  - Copying a configuration with "Copy from…" now requires edit access to the source Data Mart for every connector: you must be its technical owner, or it must be shared with you for maintenance.

  The error shown without that access now explains how to get it (8b29435): ask an owner to add you as a Technical Owner or to turn on "Shared for maintenance", or enter the credentials manually. The connector setup guide now documents the "Copy from…" option — who can copy credentials, the exact error text, and how to resolve it.

- 76feef3: **Google Ads, LinkedIn Ads, LinkedIn Pages, and Shopify connectors use supported API versions**

  Previously, the Google Ads connector called API version v21, which Google sunset on 2026-08-05, causing every import to fail with an `UNSUPPORTED_VERSION` error. The LinkedIn Ads and LinkedIn Pages connectors were also close to hitting the same wall: they called a version only two months newer than one LinkedIn had already sunset. The Shopify connector was two releases behind, with its version nearing its own support cutoff.

  Now, Google Ads uses v25, LinkedIn Ads and LinkedIn Pages use the 2026-07 version, and Shopify uses the 2026-07 version — all current, supported releases. This means imports for these connectors keep running instead of failing once their old versions are sunset.

- 43a54e6: **Google Ads campaign and video metrics import**

  Google Ads renamed four fields in its v25 API — `video_views`, `video_view_rate`, `campaign_start_date`, and `campaign_end_date` — and the connector kept requesting the old names. Because Google Ads rejects a query entirely when it contains even one unrecognized field, any `campaigns` or `campaigns_stats` import selecting one of these failed outright, including new data marts, which select the campaign dates by default.

  The connector now requests Google Ads' current field names, so these imports run again. No action is needed: the fields keep the same names in OWOX, and existing data mart configurations and destination tables are unaffected.

- 6e6bac8: **Facebook imports survive an inaccessible ad account**

  Previously, the Facebook Marketing connector aborted the whole import as soon as a single ad account returned a permission error. Because accounts are fetched one after another, one account the access token could no longer reach — typically a client that stopped sharing it — discarded the accounts already fetched and every account still queued behind it. The failure repeated on each following run, since the import never got far enough to record its progress, so the data stayed frozen until someone removed that account from the configuration by hand.

  Now, an account that returns a permission error is skipped and the import carries on with the remaining ones, for catalog and time-series data alike. Each skip is raised as a warning on the run, so an account that is quietly missing from the destination is visible without reading the run log. Only permission failures are skipped: a storage write or an exhausted transient error still fails the run, which keeps the import from moving past a day whose data was never stored. If every account fails, the run stops with an error naming each one, because that points to a global cause such as an expired access token.

- 064557c: **Memory-safe Keywords import for Microsoft Ads**

  Previously, importing Keywords from a large Microsoft Ads account crashed the run with an out-of-memory error. The connector now streams records to storage in small chunks instead of loading the whole download at once. Imports of any account size now complete within normal memory limits.

- 8976dca: **OpenHolidays connector no longer fails when saving fetched data**

  Every OpenHolidays run failed with `TypeError: storage.saveData is not a function` right after the API returned holiday rows, so no data ever reached the storage table. The connector requested its storage instance without waiting for the async initialization to finish, then tried to save data into the still-pending result instead of the ready storage. It now waits for the storage to initialize before saving, and imports complete successfully.

- 04f822f: **Editing the table name no longer clears the other storage fields**

  On the connector setup step "Choose where to store your data", clearing the table name also wiped the dataset (or database) name. Typing a dataset name was impossible while the table field stayed empty — each keystroke disappeared.

  The step now stops re-reading its own emitted value once you edit any field. Defaults still fill in on first open, and an existing target still loads when you edit a saved connector. The fix applies to every storage type: Google BigQuery, AWS Athena, Snowflake, AWS Redshift, and Databricks.

- a4c8c35: **Google Sheets reports recover from deleted sheets with one click**

  A Google Sheets report breaks when someone deletes its destination sheet, and an import that replaces the spreadsheet's sheets breaks it the same way. The report then failed every run with a cryptic "Failed to find sheet 0" error.

  Now the error explains what happened and names the fix. A failed report offers a **Reconnect & run** action in its row menu. One click rebinds the report to a sheet named after it — reusing the sheet if it exists, creating it otherwise — and reruns the report. Renaming the sheet afterwards is safe: the report tracks the sheet by its ID, not its name.

- aa314fd: **Values starting with "+" no longer break in Google Sheets reports**

  Google Sheets treats a cell value that starts with `+` as the beginning of a formula, so exported values like session identifiers of the form `+Dri7…` used to show up as `#ERROR! Formula parse error` instead of the data.

  Now the Google Sheets destination prefixes such values with an apostrophe (`'`) — the standard Sheets escape symbol. The cell displays the original value exactly as stored; the apostrophe is not part of the cell content. Only values starting with `+` are escaped: everything else, including formulas inserted as data (values starting with `=`), is exported unchanged.

- e387fee: **Typing in the SQL editor now works reliably on saved Data Marts**

  On any saved Data Mart, the SQL Query editor could refuse to insert spaces: you would type `select * from`, press the spacebar, and nothing would appear. This happened whenever the Joinable Data Marts section was set to the diagram view — the diagram was silently capturing the spacebar for itself. The editor now always receives everything you type, regardless of how the Joinable Data Marts section is displayed.

  Two more editing annoyances are gone as well:
  - A query you were still writing no longer disappears when the page refreshes its data in the background (for example, right after saving, publishing, or updating the output schema).
  - After picking a different input source type, the Save button no longer stays greyed out while a valid query is on screen.

- 58d4891: **Connecting a Google account no longer fails intermittently**

  Authorizing Google BigQuery storage or a Google Sheets destination could fail at random — the popup would show a sign-in screen or an authorization error, and the connection would only succeed after several attempts.

  The cause: the OAuth popup used to boot the entire application and sign in on its own. That sign-in competed with the main tab for the same single-use session credentials, and whichever window lost the race failed. The popup could also end up in a different project context than the tab that started the connection, which made the authorization attempt be rejected.

  Now the popup only hands the authorization result back to the tab where you clicked "Connect with Google", and that tab completes the connection using its own session. One attempt is all it takes.

- e387fee: **api-client: expose `in`/`not_in` filters and the new relative-date presets in the traversal types**

  Release 0.31.0 taught the Data Mart traversal API the `in`/`not_in` operators and the `this_week`/`last_week`/`this_quarter`/`last_quarter`/`next_n_days` relative-date presets, but the public `@owox/api-client` types were not updated: a TypeScript caller writing `operator: 'in'` got a compile error even though the request itself works.
  - `TraverseDataFilterRule` gains the `in`/`not_in` branch: `value` is an **array** of 1..500 same-type values (all strings or all numbers) — never a comma-separated string, and never booleans (use `is_true`/`is_false`).
  - `TraverseDataRelativeDatePreset` gains `this_week`, `last_week`, `this_quarter`, `last_quarter`, and `next_n_days`.
  - The `@owox/api-client` guide now documents every filter operator's `value` shape (scalar / array / `{ from, to }` / preset), the `in`/`not_in` constraints, the full relative-date preset list, and the NULL-inclusive semantics of negative operators; the OpenAPI description of the `filter` query parameter shows an `in` example.

- ec28b5e: **API surface maintenance**
  - **Low-level API client transport methods** — OWOX API clients can now use `patchJson()` and `deleteJson()` alongside `getJson()`, `postJson()`, `putJson()`, and `getStream()` for `/api/...` endpoints that do not yet have typed resource abstractions. Authenticated low-level requests accept only root-relative `/api/...` paths up to 2,048 characters and refuse unsafe paths and redirects, preventing credentials from being sent to an unintended destination. Existing custom transports remain source-compatible and can add PATCH and DELETE support independently; calling an unsupported new method rejects with `OWOXConfigError`. The existing plugin protocol adds PATCH and DELETE through `ctx.owox` as an additive capability while preserving compatibility with existing plugins. Low-level JSON return values are caller-typed and are not runtime-validated; consumers should prefer typed resource abstractions when available.
  - **Manage Data Mart run lifecycles through the API client** — `@owox/api-client` now supports starting, listing, inspecting, and cancelling Data Mart runs through the Data-Mart-scoped `runs.forDataMart(id)` client and its `start()`, `list()`, `get()`, and `cancel()` methods. Starting and cancelling require Technical User access; listing and inspecting require Business User access. `start()` accepts typed incremental or manual-backfill options, including connector-specific fields; manual-backfill `data` is optional for connectors without backfill fields. The client requires an explicit `MANUAL_BACKFILL` run type whenever `data` is supplied and rejects `data` on implicit or explicit incremental runs before sending a request, while the backend HTTP endpoint separately accepts retained object-valued `data` on incremental requests so existing run forms remain compatible. The client also rejects empty, dot-segment, or separator-bearing Data Mart and run IDs before sending a request. Serialized manual-run options are limited to 1 MiB by both the client and HTTP API; requests above the HTTP transport ceiling return `413` instead of an internal-server error. Packaged authentication middleware now limits its body parsers to `/auth`, so it no longer overrides the backend API's 2 MiB transport ceiling.
  - **Scoped list pagination** — defaults to 100 items when omitted and preserves valid caller-provided limits and offsets without silently capping them. The scoped list method rejects unknown, zero or negative limits, negative offsets, non-integer values, non-finite values, and integers outside JavaScript's safe range before authentication or network access. Project-wide `runs.list()` pagination remains unchanged and relies on server normalization. Project-wide and Data-Mart-scoped run methods remain compatible with older self-hosted deployments that omit Data Quality fields, and Data Quality response validation tolerates additive server fields while still checking known values. Existing typed integrations need no migration.

### Patch Changes 0.32.0

- 715c6f7: # Plugin publishing no longer fails during a safe synchronization cooldown

  Repeated publishing now reuses the plugin's last validated version while a GitHub synchronization is cooling down. Authenticated GitHub App and server-token reads use a 30-second default cooldown; anonymous reads retain the safer 300-second default. A separate in-progress error is returned while another synchronization is still running.
  - @owox/internal-helpers@0.32.0
  - @owox/idp-protocol@0.32.0
  - @owox/idp-better-auth@0.32.0
  - @owox/idp-owox-better-auth@0.32.0
  - @owox/backend@0.32.0
  - @owox/web@0.32.0

## 0.31.0

### Minor Changes 0.31.0

![OWOX Data Marts – v0.30.0](https://github.com/user-attachments/assets/a994aa1a-554a-4475-aa53-94369f8429e7)

- 61fc1bc: **Add Data Quality checks**

  Configurable manual and scheduled Data Quality runs for BigQuery, Legacy BigQuery, Athena, Snowflake, Redshift, and Databricks Data Marts. The new Data Quality workspace supports 11 table, field, and relationship checks, stores reproducible SQL and examples, and surfaces compact results in Output Schema, Models, and Run History.

- e8ae62c: **Data Last Updated Date**

  You can now see when the source tables behind a Data Mart last changed in the warehouse — in the UI and through MCP.
  - **In the UI** — the Data Mart page shows a **Data Last Updated** tile with a **Check now** button, the Data Marts list gains a sortable **Data Last Updated** column, and the model canvas shows the value on every node with an **Actions → Check Data Last Updated** entry that measures everything currently visible in one go. Checking reads warehouse metadata only: it registers no consumption and records no run.
  - **In MCP** — `query_data_mart` returns a `data_last_updated` block alongside the rows and totals, reporting when the source tables behind the result last changed, which tables were checked, and how complete that picture is. It is measured live as part of the same call — never cached, never charged separately — and against the fully composed query, so a blended result covers every joined Data Mart's tables, not just the primary one. Each MCP query run also records the block in Run History.
  - **On every run** — every run that delivers data measures the value on the way out: report runs (manual and scheduled), HTTP Data requests, and MCP queries all record it in Run History. When a run reads only the Data Mart's own sources, the measurement also becomes the Data Mart's saved value, so the list, canvas, and Data Mart page stay current without anyone pressing a button. A run spanning several joined Data Marts records the measurement in its history entry only, because a blended reading would overstate any single Data Mart.

  Google BigQuery is supported first: `TABLE`, `VIEW`, `SQL`, `TABLE_PATTERN`, and connector-backed Data Marts all resolve through to their underlying base tables, including nested views and sharded/wildcard table sets. Other storages report `unavailable` until their support lands.

  Read the timestamp precisely: it says when the source tables were last **written to**, not which period the data covers — which is why the field is called _data last updated_ rather than _freshness_, and the tool instructs the assistant to phrase it that way. A `null` timestamp means unknown, neither fresh nor stale; `coverage: "partial"` means some sources could not be read, so the real time can only be more recent than reported. Views are excluded from the per-table detail, because a view's modification time reflects a change to its definition rather than to any data.

- db60962: **Google Sheets source connector**

  A new Google Sheets source connector imports one sheet into a table in the user's Storage and makes it available as a Data Mart. It supports Service Account authentication, dynamic header-based field inference, and full refreshes across supported storages, so the materialized table reflects the current sheet contents, including schema changes.

- c6c0d7b: **Models canvas redesigned as an ERD, Joinable Data Marts diagram to match**

  The Data Marts **Models** canvas now renders ERD cards instead of plain title boxes. Each card shows a definition-type badge and accent color (`SQL` / `View` / `Table` / `Pattern` / `Connector`), a published/draft status dot, and — in the new **Detailed** view — typed field rows with a primary-key indicator, primary keys first, and hidden-for-reporting fields dimmed. Long field lists collapse to 4 rows with an in-place "+N more fields" toggle. Switch between **Compact** (default) and **Detailed** in the canvas settings; the choice is remembered per browser.

  Cards are draggable and their positions persist per storage in your browser across reloads (picking a layout algorithm re-flows from scratch). A new **Object labels** setting toggles what every card shows — input-source badge, field count, status dot — with "Check all" / "Uncheck all" shortcuts. Relationship lines are smooth bezier curves, neutral gray at rest and brand-blue when selected: click a single line, or click a card to light up all of its connections. The minimap colors nodes by definition type. The canvas renders immediately from the list data and enriches cards with fields as details load, so large models appear without delay.

  The **Joinable Data Marts** diagram on the Data Mart page uses the same ERD card design, and its gear popover gains two filters: **Show looped Data Marts** (off by default — self-referencing loop stubs no longer blow up the graph) and a **Status** filter (All / Published / Draft).

  Thanks to @ikrasovytskyi for contributing the redesign!

- be313d1: **Export the Models canvas as SVG, PNG, JSON, or an OKF bundle**

  The Models canvas now exports the data model through **Actions → Export**, in four formats:
  - **Image (SVG)** — a vector snapshot of the whole visible model, crisp at any zoom.
  - **Image (PNG)** — the same snapshot rasterized at 2× scale, for chats and tools that do not render SVG.
  - **JSON** — the model graph (Data Marts, schemas, joins, canvas positions) in the OWOX Model Canvas format, sanitized of project identifiers.
  - **OKF (Markdown)** — a zip with one cross-linked Markdown document per Data Mart plus an index: an overview, the schema table, and the join list per mart. Works well as context for AI assistants.

  The export covers exactly what the canvas shows — the same filtered set the other Actions target — and captures the whole model regardless of the current pan and zoom. Image backgrounds follow the active theme, so dark-theme exports stay readable outside the app.

  The canvas also got leaner: the **Actions** menu moved from a canvas overlay into the toolbar above the canvas, so it no longer covers content; the field count now shares a row with the Data Quality and Data Last Updated indicators, making every card one row shorter; and the Object labels settings list dropped its decorative glyphs.

- 398e908: **Plugin Gallery: publish, install and run plugins described by GitHub releases**

  Plugins are web apps hosted elsewhere, described by a GitHub repository's releases, listed in a per-member Gallery and opened inside OWOX Data Marts in a sandboxed cross-origin iframe. A plugin holds no credential of its own: it can only ask the host page to make calls the host has already decided are allowed, acting with the authority of the member who installed it.
  - **Publishing and installing are separate.** A publication controls what a member sees in the Gallery, at three independent levels — deployment, project and member — combined into one deduplicated list with no precedence between them. Installing is each member's own decision, uninstalling is soft, and a previous installer can restore from history even after the plugin stops being published to them. Unpublishing removes a listing without uninstalling anyone.
  - **Updates are managed by the deployment, daily.** Every published or installed plugin is checked once a day for a newer valid release, each at its own time of day. When a check finds a valid higher version it becomes current for everyone using that plugin — versions cannot be pinned, chosen or rolled back, and the plugin page says so along with when the next check happens. **Check now** brings that check forward for anyone who can reach the page; it never decides whether an update happens. A failed check leaves the working version active until the next daily slot.
  - **Plugin identity is the GitHub repository**, held by its stable numeric id, so renaming or transferring a repository resolves to the same plugin. Versions are immutable and anchored to an exact commit: moving, deleting or recreating a tag cannot rewrite an existing version, and an invalid release never displaces a working one.
  - **Emergency control.** An allowlisted publisher key can suspend a plugin across the deployment. Suspension blocks opening, installing and restoring while leaving uninstalling and update checking available, so a corrective version can still become current before the plugin is resumed. It changes no publication or installation record.

  Plugin authors build against the new `@owox/plugin-sdk`, which owns the host handshake and hands the plugin a working OWOX Data Marts API client. `owox-ctl` gains `plugins publish`, `unpublish`, `publications list`, `update`, `suspend` and `resume`.

  New deployment variables: `OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS`, `GITHUB_TOKEN`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_API_BASE_URL`, `PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC`, `PLUGIN_HOST_REMOTE_PROBE_TIMEOUT_MS`. The origin a vendor may name in `frame-ancestors` is the existing `PUBLIC_ORIGIN`, not a plugin-specific setting.

  **Behaviour change in `@owox/api-client`.** The package no longer depends on `undici`, so it can build for a browser and back a plugin's `ctx.owox`. As a result it no longer supplies a no-timeout dispatcher for streaming reads by default — pass one via the new `streamDispatcher` option if you call `traverseData` and need reads to run unbounded:

  ```ts
  new OWOXApiClient({ apiKey, streamDispatcher: new Agent({ bodyTimeout: 0, headersTimeout: 0 }) });
  ```

  `owox-ctl` does this already. `OWOXApiClient` additionally accepts `{ transport }` instead of `{ apiKey }`, which is how a plugin receives a working client while holding no credential of its own. Errors now carry the backend's stable machine-readable code, so a caller can branch on the failure instead of matching message text, and `error.details` carries the payload directly rather than the whole response body.

- 071b429: **Change the Input Source of an existing Data Mart**

  The Input Source type of a Data Mart can now be changed after setup — a table can become a SQL query, a view can be repointed at a real table, and so on, within the same storage. Previously the type was frozen once saved, so the only way to switch was to rebuild the Data Mart from scratch and recreate everything attached to it.

  The Data Mart keeps its identity through the change: relationships in both directions, reports and their column configuration, and field-level metadata such as aliases, descriptions and aggregation roles all stay in place. Fields missing from the new source are marked as disconnected and fields whose type changed are flagged, the same way they already are when a source of the same type is edited.

  Because a change can disconnect fields that reports and relationships rely on, it is confirmed in a dialog stating what is preserved, what may break, and how many relationships and reports depend on this Data Mart. A published Data Mart stays published. The new source is checked against the storage before the change is saved, so an unreachable table or an invalid query is refused instead of replacing a working definition and failing later. The schema is refreshed automatically right after the change, and refreshing the output schema now reports what it found — how many fields are connected, and how many came back disconnected or with a type mismatch — instead of only confirming that it ran.

  Data Marts based on a connector are not affected: their Input Source type stays fixed, and no other type can be switched to a connector.

- 66ac952: **HTTP Data on report level**

  Adds `GET /api/external/http-data/reports/{reportId}.ndjson` — stream an existing report's data as NDJSON, applying the report's saved filters, aggregations, date buckets, unique count, and sort, without reconstructing query parameters by hand. An optional `limit` query parameter overrides the report's saved limit. The [`@owox/api-client`](../../docs/api/api-client.md) `reports.traverseData()` method exposes the same endpoint.

  The response carries an `x-owox-run-id` header (consistent with the Data Mart HTTP Data endpoint); on a successful stream the referenced run is a `HTTP_DATA` run tagged with the reportId. When the report applies a filter, aggregation, sort, date bucket, row limit, or unique count — or blends fields across Data Marts — the run also records the exact executed SQL via `additionalParams.httpData.executionSqlQuery`, discoverable through the run history endpoint. (A plain column selection with none of those controls streams the Data Mart's own query and records no separate executed SQL.) Grand totals — one per selected metric, aggregated over the full result — are recorded in the run history whenever the report selects an eligible metric, computed as a separate best-effort query.

  Failed MCP `query_data_mart` calls create no run-history entry; both HTTP Data endpoints (Data Mart and report level) record a `FAILED` run for any failure encountered during query execution.

- ace4697: **Guide AI queries with a field type → operators/aggregations matrix**

  The MCP tools now tell an AI assistant up front which filter operators and aggregation functions each field supports, instead of letting it find out through failed queries:
  - `get_data_mart_details_by_id` enriches every native and joined field with its type `category` and the effective `allowedAggregations` a query may apply to it, and returns an `operators_by_category` matrix for the filter/slice operators each field-type category accepts.
  - The `query_data_mart` tool description embeds a field-type matrix generated from the same constants the validator enforces.
  - Operator/type mismatches (for example `contains` on a number) now return a targeted `invalid_operator_for_type` error listing the operators the field does accept, instead of a generic failure that sent assistants re-fetching the schema in a loop; `date_buckets` misuse gets equally specific `invalid_date_bucket` errors.
  - Boolean fields are now filterable: `eq`/`neq` with a boolean `true`/`false` value translate to the internal `is_true`/`is_false` operators.
  - New `in`/`not_in` filter operators (match any of / none of a value list, up to 500 values) are supported natively across BigQuery, Athena, Redshift, Snowflake, and Databricks. They are available in the report filter/slice UI as "is any of" / "is none of" (comma-separated values) for string, number, date, and time columns, and in `query_data_mart` filters/slices; `is_empty`/`is_not_empty` are now also accepted by `query_data_mart` for string fields.
  - Malformed operands for supported operators (empty `in` list, bad `between` shape) now return a precise `invalid_filter_value` error instead of a generic failure.
  - New relative-date presets on every storage, in the report UI, and in `query_data_mart`: **This week / Last week** (ISO weeks, Monday-based on all storages — BigQuery uses `ISOWEEK`, Snowflake computes the Monday independently of the session `WEEK_START`), **This quarter / Last quarter**, and **Next N days** (includes today, mirroring Last N days). With these, every operator advertised by `query_data_mart` is now executable — nothing maps to `unsupported_operator` anymore.

- edb1a40: **List draft Data Marts through MCP**

  MCP clients can now explicitly list draft Data Marts with `list_data_marts`, while published Data Marts remain the default catalog state.

- be2e29f: **Combined and Sample are now on by default for text fields**

  Text columns now offer `Combined` (`STRING_AGG`) and `Sample` (`ANY_VALUE`) out of the box, alongside `Count` and `Count Unique`. Previously both were supported but switched off, so you had to enable them field by field before a report could use them.

  Existing Data Marts pick this up automatically — a field only keeps a narrower list if you explicitly chose one for it. Numeric, date, time, boolean, and complex-type fields are unchanged, and neither function is ever included in Totals.

- 5e9b076: **Sort by Unique Count**

  Reports can now sort by the Unique Count metric. Previously, enabling Unique Count added the column to a report but the Sort section had no way to reference it. Once Unique Count is enabled, it now shows up as a sort option like any other column, ascending or descending.

- 04bf74d: **Joined field names read better in Google Sheets**

  Columns from a joined Data Mart used to lead with the Data Mart name — `RFM_SEGMENT Recency Score` — pushing the part you actually look for out of view in every header cell. Google Sheets now writes the Data Mart name after the field name, in parentheses: `Recency Score (RFM_SEGMENT)`. For a chain of joins the name is the Data Mart the field actually comes from, not the whole path. Fields from the report's own Data Mart are unchanged, and a blank Output Alias still produces a bare field name.

  Existing sheets pick the new headers up on their next refresh. Row 1 is rewritten in place — no column is added, removed or reordered, and nothing shifts under your own content to the right of the imported range.

  Data Studio, email-based destinations, the HTTP data endpoint and MCP field metadata keep the Data Mart name as a prefix — the position follows the surface that renders the label, not the report, so reading a Google Sheets report through the HTTP data endpoint still returns the prefixed form. Match columns on the technical field name, which is identical everywhere.

  Labels are also no longer padded: an Output Alias or field alias typed with a leading or trailing space used to leak that space into the column name, and a whitespace-only alias produced a column that looked unnamed. And a Google Sheets report that would write two columns under the same header now fails with a clear message naming the header, instead of writing the duplicate silently — previously the refresh after it blanked one column, inserted a spare, and pushed your own content further right. Rename one of the two columns, or the Output Alias of the joined Data Mart one of them comes from.

- ce982a5: **New Data Marts are shared for maintenance by default**

  A newly created Data Mart now starts with both sharing toggles on: **Shared for reporting** and **Shared for maintenance**. Other Technical Users can join it to their own Data Marts straight away, instead of first having to find the owner and ask them to share it.

  Data Marts that already exist are not changed. The owner can still turn **Shared for maintenance** off on any Data Mart in one click — non-owners then keep reporting access and lose the ability to edit or join it. Storages and Destinations keep their current defaults: shared for use, not shared for maintenance.

- 9e0434a: **Cleaner connector run logs: warnings for issues you can fix yourself**

  Failures now split into warnings and errors, so you can tell at a glance what needs you to act. Warnings mark issues you can fix yourself — like expired credentials or a canceled run. Errors mark issues our support team can help you resolve. Logs are also easier to scan: each crash appears as a single entry instead of several, and duplicate entries are gone.

- 562bbe2: **Clearer Data Warehouse selection during onboarding**

  The Data Warehouse step in onboarding now shows an interactive preview for the selected supported warehouse, illustrating how OWOX takes data from input sources, processes it in the chosen warehouse, and delivers it to destinations such as Google Sheets, Excel, email, Slack, and Looker Studio. The step also gains a responsive two-column layout, updated selection states, and a short animation. The preview is hidden when you select **Other** or **I don't know**.

- 5452659: **Copy a link to a Destination or Storage**

  Destinations and Storages now have a **Copy link** button in their configuration panel, so you can grab a direct link and share it with a teammate instead of explaining which item to click through the list to find.

- c97264b: **Easier access to service account details**

  When viewing Google service account credentials, you can now copy the service account email with one click or open its details in Google Cloud Console. The email remains visible and can still be selected manually when you only need part of it.

- 970bcee: **Correct COUNT DISTINCT, SUM, AVG, percentiles, and Combined across joined Data Marts (fan-out fix)**

  `COUNT DISTINCT`, `SUM`, `AVG`, the percentile metrics (`P25`, `Median`, `P75`, `P95`), and `Combined` on a joined Data Mart are now computed correctly at the report grain, including across multi-hop bridges (a joined Data Mart reached through another joined Data Mart). Previously each was pre-aggregated on the join key and then re-aggregated, which over- or under-counted (`COUNT DISTINCT`), over-summed (`SUM`), produced an unweighted average-of-averages (`AVG`), weighted a percentile by how many times the join repeated each value, or repeated the same text in `Combined` once per matching row, whenever the same entity was reachable through more than one path. Each metric now uses a dedicated "sleeve" pass that carries the raw identity to the report grain. These are symmetric (non-additive) aggregates: an entity reachable under two dimension values is counted once in each group but once overall, so a column's per-group values need not sum to its Totals value — that is correct, not a discrepancy. Applies to BigQuery, Athena, Redshift, Snowflake, and Databricks. **Numbers will change for any saved report using one of these metrics on a joined Data Mart whose join fans out.**
  - **Deduplication key.** For `SUM`, `AVG`, and the percentiles, the value is de-duplicated by the joined field's pre-join group key, or — when the field is a raw passthrough (pre-join `ANY_VALUE`) — by the joined Data Mart's own declared primary key. Two rows agreeing on that key and on the value are the same row the join returned twice and are counted once; two rows agreeing on the key but not on the value stay separate, so contradictory data is never silently resolved to one version. A joined Data Mart with no declared primary key falls back to a per-row surrogate, which cannot tell a genuine duplicate from two distinct rows. A declared key is trusted: a key that is not in fact unique will merge rows — and so will one whose column is empty on more than one row. Declare a key only on a column that is genuinely unique and always filled.
  - **`MIN` and `MAX`** on a joined Data Mart are computed the same way, over the same rows. They used to read the value the pre-join roll-up had already collapsed, which measured a different set from `AVG` on the very same column and could leave `MIN` above the average. **`COUNT` is deliberately unchanged**: it counts the rows that survive the join, which is a different question rather than a distorted one. The main-side Unique Count (by primary key) is unchanged.
  - **`COUNT` and `COUNT DISTINCT` are no longer shown side by side on a JOINED field.** They are computed at different grains, so together they can invert `COUNT DISTINCT <= COUNT`. **A report that selects both on a joined field now shows only `COUNT DISTINCT`** — the report is not rejected, and `COUNT` on its own keeps working exactly as before. Totals stop offering the pair for the same reason. A non-joined field is unaffected.
  - **Deterministic "any value" roll-up.** A joined field whose pre-join roll-up is "any value" is now rolled up deterministically. That roll-up is read twice — once for the report's grouping and again inside the fan-out correction — and an engine free to evaluate the two separately could return different values, which made the correction silently produce empty results. Applies to text, number, date and time fields; other types are unchanged.
  - **Joined `COUNT DISTINCT` on a pre-rolled-up field** (e.g. a text field pre-aggregated with `STRING_AGG` before the join) now counts distinct raw values at the report grain, not distinct rolled-up values. This is more correct — the previous behavior could conflate different raw values that rolled up into the same combined result — but the number can change for a saved report using such a field.
  - **Known limitation:** a metric (`HAVING`) filter on any of these joined metrics — `COUNT DISTINCT`, `SUM`, `AVG`, `MIN`, `MAX`, `Combined`, or a percentile — is not yet supported and is rejected with a clear error; filter on a main-side column or a different metric instead. **A previously-saved report carrying such a filter will be rejected on its next run.**
  - **Totals now honour metric (`HAVING`) filters.** A Totals row has no grouping, so a per-group constraint used to be dropped, and Totals then summarised rows the report itself hides. Totals are now computed over the rows of the groups that pass the filter, and stay symmetric while doing so. **Totals will change for any saved report that carries a metric filter.**
  - **Totals that cannot be computed are now reported instead of silently omitted.** They are still best-effort — a failure never costs the query its rows — but an empty Totals block used to be indistinguishable from a report with no totals at all, which invites summing the returned rows instead (wrong for any non-additive metric). The reason travels with the response and is recorded in Run History; AI callers are told only that totals failed, since a warehouse message quotes the query and its table and column names.
  - **Incomplete or unusable relationships are rejected with an explanation** instead of failing at the warehouse. That covers a relationship saved with no join conditions (a supported draft state — it is refused when a report tries to use it, not when you save it), and one joining on a nested field such as `address.city`, which the query engine cannot express and which was previously accepted and then failed with a raw database error. Editing a relationship no longer requires filling in the join conditions, matching what creating one already allowed.
  - **Redshift identifier collisions are caught at save time.** Redshift lower-cases and truncates long identifiers, so two report columns differing only in case, or only past 127 bytes, arrive as one. Such a pair is now rejected when the report is saved, on every warehouse. **An already-saved report carrying such a pair is rejected on its next run** — on Redshift it was returning data from the wrong column.
  - **Reserved internal names.** A joined Data Mart with a source column named `__owox_rid`, or a report that groups by a field (or output alias) named `_oid`/`_oid_<n>`, `_oid_key_<n>`, `_val`/`_val_<n>`, or `_dedup` alongside a joined `SUM`/`AVG`/percentile metric, is now rejected with an error naming the column instead of silently returning a corrupted value — rename the field or its alias.
  - **Rejected requests now say what was actually wrong.** Every failed validation rule — across the whole API, not only reports — reached the caller as the single word "Bad Request Exception", with each per-field reason dropped before the response left the server. Each reason now travels with the response and is shown in the interface. A server error also shows a message identifying the request instead of failing silently.

- 2680781: **Keep NULL rows for "is not" / "is none of" / "does not contain" report filters**

  Negative filter operators (`is not`, `is none of`, `does not contain`, `does not match regex`) no longer drop rows where the filtered column is NULL. SQL three-valued logic previously excluded those rows; filters and slices now keep them so missing values behave like "not equal to X". Add `is not null` or `is not empty` when you want to exclude NULLs. Applies to BigQuery, Athena, Redshift, Snowflake, and Databricks.

  In blended reports this also changes post-join negative filters on `LEFT JOIN`ed columns: a filter like `crm.status is not Churned` now keeps source rows with no join match at all, where it previously acted as an implicit inner join. Add an `is not null` filter on the joined column to drop unmatched rows. Metric (`HAVING`) filters share the same logic, so a negative metric filter such as `SUM(amount) ≠ 0` now also keeps groups whose aggregate is NULL (e.g. all-NULL input).

- 122ce35: **More reliable connector runs during cancellation and long backfills**

  Previously, cancelling a connector run could fail to stick: the run reappeared as running minutes later, and its logs were lost. Long BigQuery backfills on OAuth also stopped after about an hour with an "Invalid Credentials" error. Now cancelled runs stay cancelled and keep their logs, and BigQuery refreshes its access token mid-run so long backfills continue.

  A run can still fail with "Invalid Credentials" if its saved token expired before the run started. Reconnect the BigQuery destination, or use a service account, until token saving arrives.

- 8724c41: **Fix dropped characters and lost focus in connector settings**

  Previously, typing into a field on the "Configure Settings" step dropped characters, so text seemed to appear only on the second try, and pasted values could revert. Credential fields also lost focus after the first character, forcing users to click back into the field. Both problems are fixed — fields now keep focus and accept every character, whether typed quickly or pasted.

  Nested credential fields now also show their readable labels everywhere. Some tabs previously showed the raw field name, such as "ServiceAccountKey" instead of "Service Account Key (JSON)".

- e02ff15: **Preview SQL no longer requires edit access**

  Opening **Preview SQL** on a report used to fail with "edit access to the source data mart is required" for anyone without maintenance access — including Business Users on a Data Mart shared for reporting, and Technical Users who are not owners of it. Reading the query a report runs is now tied to seeing the report: if a Data Mart is visible to you, you can open the generated SQL of any report on it and copy it to the clipboard.

  The two actions in that dialog that genuinely need maintenance access — the SQL validator (dry run) and **Copy as Data Mart** — are now hidden for users without it instead of failing on click. Reports that join a Data Mart the viewer cannot access still refuse to render SQL, naming the inaccessible Data Mart.

- e5d26a0: **No more leftover columns when switching Data Marts in Google Sheets**

  When creating a report in the Google Sheets extension, switching to another Data Mart now resets the column selection. Previously, columns picked for the first Data Mart stuck around and showed up as "Disconnected columns" under the new one — and could even reach the created report and make it fail.

- a54bf5d: **API surface maintenance**
  - **Project search API** — `GET /api/search` now publishes the integer range and comma-separated serialization of its optional filters in OpenAPI. `@owox/api-client` adds `search.query(query, options)` and exports `OWOXSearchResult`, `OWOXSearchEntityType`, and `OWOXSearchOptions` for discovering visible Data Marts, data storages, and data destinations. Existing viewer access and search behavior are unchanged.
  - **Project run history contract reconciled** — `GET /api/data-marts/runs` now publishes the complete project-wide run-history contract, including viewer visibility, pagination normalization, enums, field presence and nullability, and the backend's RFC3339 timestamp profile. `createdByUser` is the nullable run-author field; when present it includes `userId` and may include nullable `fullName`, `email`, and `avatar`. `definitionRun` remains present but can be `null` when a historical definition snapshot is unavailable. `@owox/api-client` validates this contract and exposes it as `runs.list({ limit, offset })` — **consumers using the previously released `runs.getHistory(...)` must rename those calls to `runs.list(...)`**; the response and option type exports remain available.
  - **HTTP Data streaming contracts strengthened** — `GET /api/external/http-data/data-marts/{dataMartId}.ndjson` now publishes its exact-column projection, bounded base64url controls, positive-integer limit, NDJSON response, run identifier, and failure contract in OpenAPI. `@owox/api-client` provides typed filter, sort, aggregation, and date-bucket controls for `dataMarts.traverseData(...)` and validates the NDJSON response media type before traversal. Consumers passing controls through `unknown[]` or widened variables must adopt the exported rule types or annotate their options with `TraverseDataOptions`; valid inline calls remain unchanged.
  - **Data Mart list contract actualized** — `GET /api/data-marts` now publishes viewer visibility, non-negative integer offset validation, owner-presence filtering, 1,000-item pages, and the complete nested list-item response contract, including nullable draft definition types and optional nullable user metadata strings. `@owox/api-client` validates every returned page and exposes the full `OWOXDataMart` shape; `dataMarts.list({ offset, ownerFilter })` can start from an offset, filter by `has_owners` or `no_owners`, and follows subsequent pages automatically. The package exports `OWOXDataMartListOptions`, `OWOXDataMartOwnerFilter`, and the nested Data Mart enum and object types, and rejects invalid list options before sending a request. Existing `dataMarts.list()` calls remain compatible.

### Patch Changes 0.31.0

- @owox/internal-helpers@0.31.0
- @owox/idp-protocol@0.31.0
- @owox/idp-better-auth@0.31.0
- @owox/idp-owox-better-auth@0.31.0
- @owox/backend@0.31.0
- @owox/web@0.31.0

## 0.30.1

### Patch Changes 0.30.1

- 86425d3: # More reliable MCP reporting answers

  MCP reporting tools now expose only published Data Marts and use clearer, business-friendly field labels in query results. Each result identifies its source Data Mart and includes OWOX links for the related Data Marts, reports, destinations, and schedules.

  When a query result is incomplete because of the row limit or response-size cap, the assistant receives an explicit truncation reason and instructions to make that limitation clear. It also receives guidance to use OWOX aggregations for count questions and to distinguish OWOX-calculated values from calculations made in the assistant response.

## 0.30.0

### Minor Changes 0.30.0

![OWOX Data Marts – v0.30.0](https://github.com/user-attachments/assets/0f7e1b3a-3824-4067-8f8d-988edf91783d)

- cb6bc43: **Model canvas**

  New project-level, read-only visualization of the data marts visible to the user in a storage and their relationships, available from the new "Models" sidebar item under Data Marts. Includes filters by storage, status, and relationships; search with highlighting; join-field labels on edges; node-avoiding edge routing; selectable layout directions; and directional (including bidirectional) join edges. Both this canvas and the existing Joinable Data Marts graph are now rendered with React Flow (replacing Rete.js), preserving their established styling and interactions.

- f3a83b3: **Add project-based MCP server URLs**

  OWOX MCP now supports project-specific server URLs in the form `https://{projectId}.mcp.owox.com/mcp` alongside the existing shared `https://mcp.owox.com/mcp` server. Shared connections keep the existing project-selection flow. Project-specific connections derive the project from the MCP host, skip project selection, and still verify that the authenticated user has access to that project before issuing MCP tokens. Project settings show the project-specific MCP URL with copy support.

- 480e8bc: **Add project-aware MCP instructions**

  OWOX MCP servers now provide clients with built-in instructions for discovering and querying Data Marts with the current tool workflow. Project admins can add project-specific business context in Project settings; the project description is stored per project and appended to the MCP instructions when a client connects.

- 3a5abb3: **Create and update reports for every destination type through MCP**

  The `add_report` tool now supports all destination types, not just Google Sheets. Data Studio reports are created with default settings (a 5-minute data cache lifetime), and the response includes a setup-guide link — now also part of the `add_destination` response for `looker_studio`. Email, Slack, Microsoft Teams, and Google Chat reports take a new `message` parameter with the subject (defaults to the report name) and body template (supports the `{{table}}` placeholder); recipients stay on the destination and the send condition defaults to "Send always". `update_report` accepts the same `message` parameter to change the subject and/or body of an existing email-family report, preserving everything else including the send condition. Every `add_report` response now reports the `destination_type` it created.

- ba53b3a: **Create and update reports with query-parity output controls through MCP**

  The `add_report` tool accepts new optional `filters`, `slices`, `aggregations`, `date_buckets`, `sort`, and `limit` parameters — the same shape and vocabulary as `query_data_mart` — applied to the report on every run, so a filtered or aggregated query can be exported to a report that matches exactly the numbers the user saw. `update_report` accepts the same parameters as replacements (`[]` removes a control, `null` removes the row limit, omitting a parameter keeps the current value; `filters` and `slices` each replace only their own kind of rule). All controls work for every destination type and are validated against the data mart schema before any side effect — for Google Sheets, before the sheet document is created.

- 52b3245: **Sort rows from the `query_data_mart` MCP tool**

  `query_data_mart` now accepts a `sort` parameter — an ordered list of `{ field, direction }` rules (`asc`/`desc`, first rule primary) — so an assistant can order results (e.g. "top 10 campaigns by spend, descending") without post-processing. Each sorted field must also be listed in `fields`, matching the existing `aggregations` and `date_buckets` rules. This brings the MCP tool in line with sorting already available in the Reports, HTTP Data streaming, and CLI query paths.

- 2740556: **Improve Output Schema AI actions**

  The **Refresh schema** and global **Generate field aliases & descriptions** actions moved to the table toolbar, keeping all primary actions in one place. The global AI action dropdown was removed — a single click now generates both field aliases and descriptions. AI action buttons were added to the **Alias** and **Description** column headers, so users can generate values for an entire column where the action applies.

- 091d502: **Data Level selection for TikTok Ads performance reports**

  TikTok Ads `ad_insights` and `ad_insights_by_country` now honor the selected **Data Level** (advertiser, campaign, ad group, or ad), a dropdown in the main connector settings. The field selector pins only the unique-key fields that level requires — advertiser-level reports no longer force `ad_id` and can group by date alone. Choose Data Level before selecting fields; when changing it on a connector that already has data, use a new Data Mart so rows merge correctly.

- 55fcba9: **Reports table UX — discoverable actions**
  - Moved **Open document** and **Preview SQL** next to the report title.
  - Kept the **More actions** menu in the actions column.
  - Added tooltips for truncated report titles.

- 5a4eb6d: **Improve Document Link field UX**

  Simplified the Document Link section in the Google Sheets Report form (previously it showed three actions at once — URL input, Open, and Create document):
  - Show **Open document** only when a valid Google Sheets URL is provided.
  - Replace the disabled external-link icon with a contextual action.
  - Present **New Sheet** as an alternative to pasting a URL, via an "or" separator.
  - Update the input placeholder to "Paste a Google Sheets URL".
  - Replace the custom icon button with a standard ghost button.

- b0f0247: **Shared Login Customer ID field for Google Ads**

  The **Login Customer ID** is now a single top-level field shared across all authentication types, instead of a separate field nested inside each auth type. Previously the value could be lost when switching between authentication methods and was not reachable from the OAuth button flow. Existing connectors keep working — the old stored value is still read as a fallback. The field is now optional for Service Account authentication and appears directly under Customer ID in the configuration form.

- 18c8d9d: **Selective refresh and clearer failed-report errors in Google Sheets**
  - On **Refresh all reports**, each report shows its title, sheet, and last-run status, including a clear error message when the last run failed.
  - Choose which reports to refresh with checkboxes, select all, or target only failed, successful, or never-run reports.
  - On the single-report refresh screen, failed runs show the actual error details and an **Open report** action.
  - The same last-run error details are available from the **All reports** list.

- 7d09e62: **HTTP Data streaming supports aggregations and date buckets**

  The HTTP Data streaming API, the [`@owox/api-client`](../../docs/api/api-client.md) `traverseData()` method, and the [`owox-ctl data-marts stream`](../../docs/api/owox-ctl.md) command now accept `aggregation` and `dateTrunc` parameters (`--aggregation` / `--date-bucket` on the CLI), matching the grouping already available for Reports. Any selected column without an aggregation rule becomes a grouping key, so you can stream pre-aggregated rows — for example monthly revenue totals — directly from a published Data Mart without building a Report. Grand totals and the applied aggregation are recorded in the HTTP_DATA run history.

- 0781310: **Clearer permission errors when managing Storages, Destinations, and Data Marts**

  Permission errors now name the exact role required — such as owner with the Technical User role, or Project Admin — and the "access forbidden" toast stays on screen until dismissed. Previously these actions failed with a vague message that did not explain who could perform them, and the error toast disappeared after a few seconds.

- 5595bbd: **Google Sheets A1 note shows import finish time**

  The A1 cell note for a Google Sheets export now records when the import **finished** (written in the finalize step after all data is on the sheet), not when the first data batch started writing. While rows are still streaming, only the short ODM marker is present; the full provenance block (`Imported at …`, data mart title, and link) is written at the end.

- 1fc1bd2: **Clearer report details, errors, and recovery in Google Sheets**

  The Data Mart section on a report card no longer shows "Details are unavailable" while loading — you now see a loading indicator, a clear message if details fail to load, or "No details available" when there's no description or owners. When a report cannot run because columns are missing from the Data Mart schema, the extension shows the same actionable error as OWOX Data Marts (including which columns to uncheck). If a report is created but its first run fails, the editor still opens so you can fix the setup and retry. Valid report slices stay in sync with OWOX Data Marts and no longer appear broken.

- 33cb1ec: **Fix BigQuery report runs when the table name matches a filter column**

  BigQuery report runs failed when a Table Data Mart's unaliased table short name matched a filtered column — BigQuery treats the short name as a row `STRUCT` alias, so the generated SQL compared a `STRUCT` to a string (for example on Google Sheets export for a table such as `…country` filtered on a `country` column). Output-controls and explicit-projection queries now alias the source as `src` and qualify filter/sort references (`` src.`country` ``) in `WHERE`, `ORDER BY`, and `HAVING`, while `SELECT` and `GROUP BY` stay unqualified so nested RECORD paths keep their shape. Existing reports need no reconfiguration.

- b1fc8ff: **Output schema edits no longer get silently reverted**

  Unchecking a column (Alias or Description) no longer becomes visible again after a few seconds or resets on tab switch, and toggling "Hidden from reports" on a field while an AI-generated alias or description was still loading is no longer undone once generation finishes. Column visibility now persists per data mart across tab switches and reloads, and edits made while AI generation is running are preserved. Generating metadata that fills in nothing new no longer marks the schema as unsaved.

- 97f0c0f: **Correct joined data mart aggregations and flag missing primary keys**

  When a joinable field is deduplicated with a count (COUNT / Count Unique), its value in the blended result is now a whole number, so reports can sum, average, or take min/max of it (arithmetic aggregations appear automatically, Sum active by default) instead of collapsing the joined events into a concatenated string and under-counting them — fixing funnel-style reports (sessions, add-to-carts, purchases across shared dimensions). Slices (pre-join filters) on such a field now offer the operators for its original type, since a slice runs on raw values before the join. Separately, a joined data mart with no primary key now shows a "No primary key" warning in both the relationship list and the graph, because without a key the join cannot deduplicate rows reliably and metrics can be double-counted (fan-out).

- 345d78e: **Report totals cover every selected metric, not just numeric fields**

  Report totals — returned by the `query_data_mart` MCP tool and retrievable for a Data Mart run via its `x-owox-run-id` — now cover every aggregated metric, including `Count` and `Count Unique` on text, date, or boolean columns across both native and joined Data Mart fields. Previously totals covered numeric fields only, so a scorecard aggregating a text column (for example the number of distinct countries) came back empty even though the run succeeded. `Sample` (`ANY_VALUE`) and `Combined` (`STRING_AGG`) are no longer included in totals, since neither reduces to a meaningful grand total.

- 873c74f: **Report column picker fixes**

  Adding a column in the Aggregations panel now opens the aggregation editor immediately (instead of an icon that required a second click), and its Apply button stays disabled until you pick a function or bucket, so a new column can no longer be discarded by an empty Apply. The auto-generated "Unique count" row now uses the same font as the other fields. The relative-date "Last N days/months" filter input can be cleared with Backspace instead of snapping back to 0. When editing a single filter or slice, a trash button in the editor header now lets you delete it directly.

- be8a495: **Cross-platform Windows support for dev scripts and git hooks**

  Two Unix-only assumptions broke first-time setup on Windows. Inline `VAR=value command` environment-variable assignments (e.g. `npm run dev -w owox` and the package `test` scripts) are now wrapped with `cross-env` so they run under cmd/PowerShell (no new dependency — `cross-env` is already a hoisted root devDependency — and no lockfile change). The husky setup no longer emits a Windows batch-style pre-commit hook (`@echo off …`) that failed with `@echo: command not found` under `sh` (which Git uses on every OS) and blocked commits; it now writes a POSIX shell hook in the husky v9 format, self-heals only the stale formats it previously generated (leaving hand-edited hooks untouched), and clears the `husky - DEPRECATED` warning that breaks under husky v10.

- 72f3d47: **API surface maintenance**
  - **Project settings API** — the endpoints now publish explicit OpenAPI request/response contracts; `@owox/api-client` adds `project.getSettings()` and `project.updateDescription()`.
  - **Models canvas API** — `@owox/api-client` exposes paginated Models canvas data marts via `models.getDataMarts()` and their visible relationship edges via `models.getEdges()`.
  - **Project setup progress API** — `GET /api/project-setup-progress` publishes an explicit OpenAPI response contract; `@owox/api-client` adds `project.getSetupProgress()` and exports `OWOXProjectSetupProgress`, `OWOXProjectSetupProgressSteps`, and `OWOXProjectSetupStepState`.
  - **Project run history API** — `@owox/api-client` adds `runs.getHistory({ limit, offset })` and exports `OWOXProjectDataMartRunsResponse`, `OWOXProjectDataMartRun`, `OWOXProjectDataMartRunRef`, `OWOXProjectDataMartRunUser`, `OWOXProjectDataMartRunStatus`, `OWOXProjectDataMartRunType`, `OWOXProjectDataMartRunTriggerType`, and `OWOXProjectRunHistoryOptions`.
  - **Project insight-template discovery API** — `@owox/api-client` adds `insights.getTemplates({ limit, offset })` and exports `OWOXProjectInsightTemplatesResponse`, `OWOXProjectInsightTemplate`, `OWOXProjectInsightTemplateDataMartRef`, `OWOXProjectInsightTemplateUser`, and `OWOXProjectInsightTemplateListOptions`; each result includes its Data Mart reference, creator metadata when available, and the current member's `canDelete` state.
  - **Markdown rendering API** — `POST /api/markdown/parse-to-html` publishes an explicit OpenAPI contract; `@owox/api-client` adds `markdown.parseToHtml({ markdown })` and exports `OWOXMarkdownParseRequest` and `OWOXMarkdownParseResponse`.
  - **Auth context introspection** — `GET /api/auth/context` publishes an explicit OpenAPI response contract; `@owox/api-client` exposes `auth.getContext()` and `OWOXAuthContext` for validating a configured API key and reading its project/member context without exposing the secret.
  - **Require interactive authentication for OAuth flows** — OAuth routes under `/api/connectors/{connectorName}/oauth`, `/api/data-destinations/oauth`, `/api/data-destinations/{id}/oauth`, `/api/data-storages/oauth`, and `/api/data-storages/{id}/oauth`, plus `POST /api/data-destinations/connect/google-sheets`, now reject API-key authentication and require an interactive user session. API-key access to non-OAuth resource operations is unchanged.
  - **Publish canonical API-key authentication headers** — protected operations now declare `X-OWOX-Authorization` and, only when API-key-derived tokens are accepted, the optional `X-OWOX-Api-Key-Id` header (must match the token's API key ID). Routes that reject API-key authentication omit that conditional header, while `POST /api/auth/api-keys/exchange` retains its required API key ID input. Runtime authentication behavior is unchanged.

### Patch Changes 0.30.0

- 52149e4: # Fix nested blended field name collisions in joinable data marts

  Nested (struct) fields in joined sources no longer share report column names with flat siblings after dots are replaced with underscores. For example, flat `campaign_id` and nested `campaign.id` under the same join alias now produce distinct unified names (`ads__campaign_id` vs `ads__campaign_id__a8702665`).
  - **Flat blended names** stay byte-for-byte unchanged; existing reports that only use flat joined columns need no config changes.
  - **Nested blended names** always include a stable 8-character hash of `(aliasPath, originalFieldName)`. New saves and reloads use the hashed form end-to-end.
  - **Legacy nested names** in already-saved `columnConfig` / filter / sort (pre-hash form such as `customers__campaign_id` for `campaign.id`) are intentionally not migrated in this release and will not resolve after deploy. That population was empty when this shipped; a follow-up migration can re-key them if needed. The pre-join filter migration (`MigratePreJoinFilterToUnifiedColumn`) still emits the pre-hash form for historical rules only.
  - **Rolling deploy:** during a mixed old/new backend fleet, nested-field reports saved or run mid-rollout can briefly orphan until every pod serves the hashed names. Self-heals once the fleet is fully on the new version; prefer rolling through before bulk-editing nested-column reports.
  - @owox/internal-helpers@0.30.0
  - @owox/idp-protocol@0.30.0
  - @owox/idp-better-auth@0.30.0
  - @owox/idp-owox-better-auth@0.30.0
  - @owox/backend@0.30.0
  - @owox/web@0.30.0

## 0.29.0

### Minor Changes 0.29.0

![OWOX Data Marts – v0.29.0](https://github.com/user-attachments/assets/01665ae0-4bda-45ac-a0af-6dc01f5a3214)

- 36fb4d3: **Data Mart report aggregations**

  Reports can now aggregate Data Mart data server-side across all supported storages (BigQuery, Athena, Snowflake, Redshift, Databricks).
  - **Group-by + metric functions** — `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`, and percentiles `P25`/`P50`/`P75`/`P95`. Every selected column without an aggregation rule becomes a grouping key.
  - **Date bucketing** (`dateTruncConfig`) — group a date/timestamp dimension by `DAY`/`WEEK`/`MONTH`/`QUARTER`/`YEAR`, with an optional per-rule IANA `timeZone` applied before truncation.
  - **Aggregated column naming** — outputs are named `<column> | <TOKEN>` (e.g. `revenue | SUM`, `customer_id | COUNTUNIQUE`) and carry the function's effective type. A column can carry several functions, each as its own output column.
  - **Auto Row Count** — aggregated reports automatically include a `Row Count` (`COUNT(*)`) column.
  - **Unique Count** (`uniqueCountConfig`) — opt-in `COUNT(DISTINCT <primary key>)`, with composite primary key support; rejected at save time if the Data Mart has no primary key.
  - **Post-aggregation filtering (`HAVING`)** — a filter on an aggregated output column is auto-routed to `HAVING` instead of row-level `WHERE`; the `(column, function)` pair must match a configured aggregation.
  - **Joined Data Marts** — post-join aggregation over the joined result, in addition to the existing pre-join join-rollup.
  - **Totals** — a per-column summary over the full filtered dataset (no grouping), computed as a separate query and surfaced through the HTTP Data API's run subtree. Push destinations (Google Sheets, Email/Slack/Teams/Chat) don't compute totals; Row Count and Unique Count are excluded from totals.
  - **Governance** — each schema field carries a dimension/metric role, a type-derived set of supported aggregations, and an on-by-default subset, with per-field override.
  - **UI** — a new **AGG** control next to output controls, plus a per-field AGG icon, configure grouping, multi-aggregation, date bucketing, and timezone.

  Backend adds three additive nullable report columns (`aggregationConfig`, `dateTruncConfig`, `uniqueCountConfig`) plus save-time validation. **Deployment ordering:** deploy the backend before shipping a Google Sheets Extension build that exposes new aggregation options, since the extension's function list has no compile-time guard against drift from the API.

- 627880f: **Auto-create Google Sheets documents for reports**

  A "Create document" action in the Google Sheets report form auto-creates a new spreadsheet for the selected destination and fills in its link. Works for both auth methods — OAuth (document created in the connected account's Drive and shared with the requesting user) and Service Account (created in a configured Shared Drive folder).
  - Destinations can target a Drive folder: paste a folder URL for Service Account destinations (validated on save — must be a Shared Drive folder the service account can write to), or pick one via the Google Drive Picker for OAuth destinations.
  - The Picker requires a new `GOOGLE_PICKER_API_KEY` environment variable.
  - The OAuth destination flow now also requests the `drive.file` scope — existing OAuth destinations must reconnect to grant it before folder placement and sharing work.

- e575e99: **Smart search for Data Marts, storages, and destinations**

  Added semantic search functionality for finding project Data Marts, Storages, and Destinations from the project search index.

- e8b87e3: # **MCP tools**
  - e8b87e3: Added **`summarize_data_catalog`** — high-level summary of the project's published Data Mart catalog: total count, top Data Marts ranked by relationship connectivity, report/trigger usage, and recent updates. Returns only Data Marts visible to the current member; does not query row data.
  - e8b87e3: Added **`get_data_mart_details_by_id`** — a Data Mart's id, name, description, and output schema fields, including `joined_fields` (blended fields with qualified names, source Data Mart, and allowed aggregations).
  - f680592: Added **`query_data_mart`** — query a Data Mart directly: pick fields, filter (pre-join slices and post-join filters), aggregate (`SUM`, `COUNT`, `COUNT_DISTINCT`, `AVG`, `MIN`, `MAX`, percentiles), bucket dates by day/week/month/quarter/year, and get server-side totals. Runs against the warehouse, recorded in Run History (query definition and SQL only, never row values), and costs credits per call.
  - 7e3ce65: Added **`get_data_mart_reports`** — list reports tied to a Data Mart, including destination, owner, all run schedules (cron, timezone, active flag), last run time, and last run status.
  - c1485c0: Added **`add_report`** — create a report exporting a Data Mart to a Google Sheets destination; a new sheet is created and linked automatically. Currently supports Google Sheets only.
  - 4fe2c6e: Added **`update_report`** — rename a report or change its exported fields; anything not mentioned (destination, filters, sorting, owners, schedules) stays unchanged.
  - 5ed5a23: Added **`run_report` and `get_report_run_status`** — start a report run by id (returns immediately with report id and run id; data delivers to the report's push destination), then poll status (running, success, failed, cancelled, interrupted, restricted) with `queued_at`, `started_at`, and `raw_status`. Status responses include `should_poll` and `stop_reason` guidance, recommending ~15-second polling intervals. Pull-based destinations (Data Studio, HTTP Data API) can't be run this way. Starting a run requires `mcp:write`; checking status only requires `mcp:read`.
  - b8732c5: Added **`delete_report`** — marked destructive so assistants confirm before calling. The underlying Data Mart, destination, and already-exported documents are unaffected.
  - e8499d4: Added **report run schedule management** — four tools to list, create, update, and delete recurring report run schedules by trigger id, respecting project and report permissions. Creating, updating, or deleting requires both `mcp:read` and `mcp:write`.
  - 5f7dbcf: Added **`list_destinations`** — list available destinations with name, type, owner, and shared-for-use status.
  - 9f2ca93: Added **`add_destination`** — create a new destination. Email-based destinations (email, Slack, Teams, Google Chat) and Looker Studio are created and ready immediately; Google Sheets destinations require the user to connect their Google account via a linked in-app page. Every destination created this way starts unshared until a human reviews and shares it.

- 964d886: **Protect unsaved Output Schema changes from being lost**

  When a Data Mart's Output Schema has unsaved changes, a prompt now appears before any action that would replace it, with three choices: **Save & continue**, **Discard & continue**, or **Cancel**. Triggered by generating field aliases or descriptions with AI, refreshing the schema, publishing the Data Mart, updating the input source, or leaving the page.

- 662871c: **API-key exchange and auth context**

  Project member API keys can now be exchanged for IDP access tokens in Better Auth and the development Null IDP. Exchanged tokens are bound to the API key ID and are rejected from API-key management, project-member administration, user provisioning, Intercom identity, and MCP OAuth authorization endpoints.
  - `@owox/api-client` now exposes `client.auth.getContext()`; `owox-ctl status` includes the project and member context resolved from the exchanged token, without exposing key secrets.
  - The auth-context endpoint uses IDP token introspection, and Better Auth refreshes API-key token context from current user and membership state during introspection.
  - Exchanged tokens include the project title used by auth-context responses, and now expire after 15 minutes, so clients re-exchange the underlying API key instead of holding indefinitely valid access tokens.
  - Magic links now carry the encrypted invite role through the callback path, so callback query normalization no longer drops the role before the user is added to the project.

- 2a71167: **Automatic retry and clearer error messages for Criteo Ads imports**

  Criteo Ads imports now automatically retry on server errors, rate limits, and network issues, so brief outages on Criteo's side no longer stop an import. When an import still fails, logs now include the HTTP status, the provider's own error message, and a note when the failure looks temporary. Previously a temporary server error failed the whole import immediately with only a raw stack trace in the logs.

- d80b20d: **Report Column Picker search and layout improvements**
  - Added a search bar that works across native and blended Data Mart columns.
  - Clear empty state when no matching columns are found.
  - Reorganized toolbar for easier access to selection controls and search.
  - Search works together with **Show selected only** and **Select all**.

- 19a666c: **Published OWOX Data Marts MCP in ChatGPT Apps**

  [OWOX Data Marts MCP in ChatGPT Apps catalog](https://chatgpt.com/apps/owox-data-marts/asdk_app_6a3e81be8f8481918e1e2cd1d7ea09c4)

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
