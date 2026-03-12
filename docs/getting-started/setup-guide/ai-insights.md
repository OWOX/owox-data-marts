# Insights

The **Insights** tab lets you create reusable, narrative reports tied to a Data Mart. Each Insight is a Markdown document with embedded data placeholders. When you run an Insight, OWOX executes the underlying SQL queries against your data warehouse and renders the results inline — producing a ready-to-read analysis document you can share or deliver on a schedule.

> Use Insights to turn raw data mart output into recurring, narrative-style reports for stakeholders — without writing new queries every time.

---

## Prerequisites

Before creating an Insight, make sure the following conditions are met:

- **The Data Mart is Published.** Insights can only run against a published Data Mart. Draft data marts will block execution.
- **The Data Mart has an Output Schema.** The schema is required for the AI Assistant to understand the available fields and generate accurate queries. Schema is populated automatically once the Data Mart is saved and its source is valid.
- **Your role is Editor or higher.** Viewers can read and preview Insights, but creating, editing, running, and deleting Insights requires the **Editor** role.

---

## How Insights Work

An Insight is composed of two parts: a **template** (the Markdown document) and one or more **Data Artifacts** (named SQL queries that supply data to the template).

### Template Syntax

The template is a Markdown document. You control how data is embedded using the `{{table}}` tag.

| Tag | Description |
|---|---|
| `{{table}}` | Renders the full output of the Data Mart's default query as a Markdown table |
| `{{table source="key"}}` | Renders the result of a specific Data Artifact identified by `key` |

Example template:

```markdown
## Weekly Campaign Performance

{{table source="campaigns"}}

## Top Channels by Revenue

{{table source="channels"}}
```

When the Insight is run, each `{{table}}` tag is replaced with a live Markdown table containing up to 100 rows from the corresponding query result.

### Data Artifacts

A **Data Artifact** is a named SQL query attached to an Insight. Artifacts are the data sources that feed `{{table source="key"}}` tags in the template.

- Each artifact has a unique **key** (alphanumeric and underscores only, e.g. `campaigns`, `top_channels`).
- A single Insight can have up to **5 Data Artifacts**.
- SQL is validated as you type and you can preview results before saving.
- Artifact SQL is executed against the Data Mart's connected storage (e.g., BigQuery, Athena) when the Insight runs.

### Execution Flow

When you click **Run Insight**:

1. OWOX validates that the Data Mart is published and the Insight is not already running.
2. For each Data Artifact bound to the template, the SQL query is executed against the data warehouse. Results are capped at **100 rows** per artifact.
3. The template is rendered: each `{{table}}` tag is replaced with the corresponding Markdown table.
4. The rendered document is saved as the Insight's latest output, visible in the **Preview** panel.

Runs are asynchronous. The UI polls for status every 2.5 seconds and updates automatically when the run completes or fails.

---

## Creating an Insight

### Option A: Create Manually

1. Open a Data Mart and click the **Insights** tab.
2. Click **+ New Insight**.
3. Give the Insight a title.
4. Write or paste your Markdown template in the editor. Use `{{table}}` to embed data.
5. Optionally add Data Artifacts (see [Managing Data Artifacts](#managing-data-artifacts) below).
6. Click **Run** to generate the first output.

### Option B: Use the AI Assistant

The **AI Assistant** panel (within the Insight editor) is a chat interface for iteratively building and refining an Insight. You can ask it to:

- Write or revise the Markdown template
- Create or edit a Data Artifact's SQL
- Explain what an existing query does
- Attach a new data source to the template

The assistant proposes changes as **suggested actions**. Click **Apply** to write the suggestion to the editor. Nothing is committed until you explicitly apply it.

---

## Managing Data Artifacts

Data Artifacts are managed from the **Sources** panel within the Insight editor.

### Add an Artifact

1. In the Insight editor, open the **Sources** panel.
2. Click **+ Add Data Source**.
3. Enter a **title** and a unique **key** (used in `{{table source="key"}}`).
4. Write the SQL query. The editor validates syntax in real time.
5. Click **Preview** to execute a test run and inspect the output columns and rows.
6. Click **Save** to attach the artifact to the Insight.

### Edit an Artifact

1. In the **Sources** panel, click on the artifact's title.
2. Edit the SQL or title as needed.
3. Click **Save**.

> The artifact **key** cannot be changed after creation. If you need a different key, delete the artifact and create a new one.

### Delete an Artifact

1. In the **Sources** panel, click the delete icon next to the artifact.
2. Confirm deletion.

Deleting an artifact removes its binding from the Insight. Any `{{table source="key"}}` tags referencing it will fail to render on the next run.

---

## Running and Cancelling an Insight

| Action | How |
|---|---|
| Run | Click **Run** in the Insight editor toolbar |
| Cancel a running Insight | Click **Cancel** while the run is in progress |
| View run history | Open the **Run History** tab on the Data Mart |

Only one run can be active per Insight at a time. Starting a new run while one is in progress is not permitted.

---

## Delivering Insights via Reports

Once an Insight is working, you can deliver its rendered output to stakeholders automatically via **Reports**.

Supported delivery channels:

- **Email**
- **Slack**
- **Microsoft Teams**
- **Google Chat**

To set up a Report:

1. In the Insight editor, click **Create Report** (or open the **Reports** tab).
2. Select the delivery channel and configure the destination.
3. Set a **schedule** (daily, weekly, monthly, or interval-based).
4. Save the report.

On each scheduled run, OWOX will execute the Insight and send the rendered Markdown output to the configured channel.

> Reports use the same Insight template and Data Artifacts. Keeping the template up to date automatically updates all scheduled reports that reference it.

---

## Roles and Permissions

| Action | Required Role |
|---|---|
| View Insights and preview output | Viewer |
| Create, edit, delete Insights | Editor |
| Add or remove Data Artifacts | Editor |
| Run or cancel an Insight | Editor |
| Create or manage Reports | Editor |

---

## Limits

| Limit | Value |
|---|---|
| Data Artifacts per Insight | 5 |
| Rows returned per Data Artifact on run | 100 |
| Artifact key format | Alphanumeric and underscores (`[a-zA-Z0-9_]`), max 64 characters |

---

## Related Pages

- [Publishing a Data Mart →](sql-data-mart.md)
- [Report Triggers →](report-triggers.md)
- [Manage Destinations →](../../destinations/manage-destinations.md)
- [Environment Variables →](../deployment-guide/environment-variables.md)
