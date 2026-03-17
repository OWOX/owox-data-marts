# Insights

The **Insights** tab lets you create reusable, narrative reports tied to a Data Mart. Each Insight is a Markdown document with embedded data placeholders. When you run an Insight, OWOX executes the underlying SQL queries against your data warehouse and renders the results inline — producing a ready-to-read analysis document you can share or deliver on a schedule.

> Use Insights to turn raw Data Mart output into recurring, narrative-style reports for stakeholders — without writing new queries every time.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/ac0673d19f6eddc08b09a87dc012b8fa/iframe>

---

## Prerequisites

Before creating an Insight, make sure the following conditions are met:

- **The Data Mart is Published.** Insights can only run against a published Data Mart. Draft Data Marts will block execution.
- **The Data Mart has an Output Schema.** The schema is required for the AI Assistant to understand the available fields and generate accurate queries. The schema is populated automatically once the Data Mart is saved and its source is valid.
- **Your role is Editor or higher.** Viewers can read and preview Insights, but creating, editing, running, and deleting Insights requires the **Editor** role.

---

## How Insights Work

An Insight is composed of two parts: a **template** (the Markdown document) and one or more **Data Artifacts** (named SQL queries that supply data to the template).

### Template Syntax

The template is a Markdown document. You control how data is embedded using the tags.

| Tag | Description |
|---|---|
| `{{table}}` | Renders the full output of the Data Mart's Input Source as a Markdown table |
| `{{table source="data_artifact_id"}}` | Renders the result of a specific Data Artifact identified by `data_artifact_id` |
| `{{value}}` | Inserts a single scalar value from the default source (row 1, column 1) |
| `{{value source="data_artifact_id" path=".columnName[row]"}}` | Inserts a single scalar value from a specific Data Artifact and cell |

Use `{{table}}` when you want to render a complete result set as a Markdown table — for example, a ranked list of channels or a weekly breakdown by campaign.

```markdown
## Weekly Campaign Performance

{{table source="campaigns"}}

## Top Channels by Revenue

{{table source="channels"}}
```

When the Insight is run, each `{{table}}` tag is replaced with a live Markdown table containing up to 100 rows from the corresponding query result.

### `{{value}}` — embed a single metric

Use `{{value}}` when you need to pull one number or label out of a query result — ideal for KPIs and summary sentences.

There are three ways to address the cell:

| Parameter | Description |
|---|---|
| _(none)_ | Returns row 1, column 1 of the source |
| `path=".columnName"` or `path=".columnName[row]"` | Addresses a cell by column name and optional row index |
| `column="name"` and `row="number"` | Addresses a cell by column name (or 1-based index) and row number |

`path` and `column`/`row` are mutually exclusive. Row and column indexes are 1-based.

Example — a summary sentence using values from a `kpis` Data Artifact:

```markdown
## This Week at a Glance

Total spend: **{{value source="kpis" path=".total_spend"}}**
Top channel: **{{value source="kpis" column="top_channel"}}**
Cost per click: **{{value source="kpis" path=".cost_per_click[1]"}}**
```

![Insight template editor showing a Markdown document with {{table source}} placeholders and a live rendered preview panel](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2b520660-d627-4794-5184-7fd6b2033200/public)

### Data Artifacts

A **Data Artifact** is a named SQL query attached to an Insight. Artifacts are the data sources that feed `{{table source="key"}}` tags in the template.

- Each artifact has a unique **key** (alphanumeric and underscores only, e.g., `campaigns`, `top_channels`).
- A single Insight can have up to **5 Data Artifacts**.
- SQL is validated as you type and you can preview results before saving.
- Artifact SQL is executed against the Data Mart's connected storage (e.g., BigQuery, Athena) when the Insight runs.

![Insight editor showing a new, empty Insight with two annotated steps: creating a Data Artifact using the "+ Data Artifact" button, then referencing it in the template with the {{table}} tag](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c07dd5fd-880e-4d12-bb7a-7022446bc100/public)

---

## Creating an Insight

### Option A: Create Manually

1. Open a Data Mart and click the **Insights** tab.
2. Click **+ New Insight**.
3. Give the Insight a title.
4. Write or paste your Markdown template in the editor. Use `{{table}}` to embed data.
5. Add Data Artifacts if needed (see [Managing Data Artifacts](#managing-data-artifacts) below).
6. Click **Run** to generate the first output.

![Insights list view for a Data Mart showing existing Insights with their titles, last modified dates, and a Run button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6bbc5817-bcb5-4b6d-c3b8-f25872182800/public)

### Option B: Use the AI Assistant

The **AI Assistant** panel (within the Insight editor) is a chat interface for iteratively building and refining an Insight. You can ask it to:

- Write or revise the Markdown template
- Create or edit a Data Artifact's SQL
- Explain what an existing query does
- Attach a new data source to the template

The assistant proposes changes as **suggested actions**. Click **Apply** to write the suggestion to the editor. No changes are saved to the template until you explicitly apply them.

![AI Assistant chat panel showing a conversation thread with a suggested action card ready to apply to the Insight template](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c5e73fbe-ef52-4b6b-13aa-5137a4ae6700/public)

---

## Managing Data Artifacts

Data Artifacts are managed within the Insight editor.

### Add an Artifact

1. In the Insight editor, click **+ Data Artifact**.
2. Enter a **title** and a unique **key** (used in `{{table source="key"}}`).
3. Write the SQL query. The editor validates syntax in real time.
4. Click **Preview** to execute a test run and inspect the output columns and rows.
5. Click **Create Data Artifact** to attach the artifact to the Insight.

![Data Artifact editor with a SQL query input field, real-time syntax validation, and a row preview table below the editor](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a50f52ba-45f3-40ca-4f1d-ac445dd2af00/public)

### Edit an Artifact

1. In the Data Artifacts list, click the artifact's title.
2. Edit the SQL or title as needed.
3. Click **Save**.

> The artifact **key** cannot be changed after creation. If you need a different key, delete the artifact and create a new one.

### Delete an Artifact

1. In the Data Artifacts list, open the three-dot menu next to the artifact and click **Delete**.
2. Confirm deletion.

Deleting an artifact removes its binding from the Insight. Any `{{table source="key"}}` tags referencing it will fail to render on the next run.

---

## Delivering Insights via Reports

Once an Insight is working, you can deliver its rendered output to stakeholders automatically via **Reports**.

Supported delivery channels:

- **Email**
- **Slack**
- **Microsoft Teams**
- **Google Chat**

To set up a Report:

1. In the Insight editor, click **Send & Schedule** (or open the **Destinations** tab).
2. Select the delivery channel and configure the destination.
3. Set a **schedule** (daily, weekly, monthly, or interval-based).
4. Click **Create & Run report** to save and immediately deliver the report, or **Create new report** to save it for scheduled delivery only.

On each scheduled run, OWOX will execute the Insight and send the rendered Markdown output to the configured channel.

> Reports use the same Insight template and Data Artifacts. Keeping the template up to date automatically updates all scheduled reports that reference it.

![Send & Schedule panel showing delivery channel options — Email, Slack, Microsoft Teams, and Google Chat — with a schedule picker](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2ac5832b-5e02-48a2-79d8-55e7d63abd00/public)

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

- [Publishing a Data Mart](sql-data-mart.md)
- [Report Triggers](report-triggers.md)
- [Manage Destinations](../../destinations/manage-destinations.md)
