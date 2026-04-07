# Insights

The **Insights** tab lets you create reusable, narrative reports tied to a Data Mart. Each Insight is a Markdown document with embedded data placeholders. When you run an Insight, OWOX executes the underlying SQL queries against your data warehouse and renders the results inline — producing a ready-to-read analysis document you can share or deliver on a schedule.

> Use Insights to turn raw Data Mart output into recurring, narrative-style reports for stakeholders — without writing new queries every time.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/ac0673d19f6eddc08b09a87dc012b8fa/iframe>

---

## Prerequisites

Before creating an Insight, make sure the following conditions are met:

- **The Data Mart is Published.** Insights can only run against a published Data Mart. Draft Data Marts will block execution.
- **The Data Mart has an Output Schema.** The schema is required for the AI Assistant to understand the available fields and generate accurate queries. The schema is populated automatically once the Data Mart is saved and its source is valid.
- **Your role is Technical User or higher.** Business Users can read and preview Insights, but creating, editing, running, and deleting Insights requires the **Technical User** role.

---

## How Insights Work

An Insight is composed of two parts: a **template** (the Markdown document) and one or more **Data Artifacts** (named SQL queries that supply data to the template).

![Insights editor with three panels: AI Assistant on the left, Markdown template editor in the center, and rendered output preview on the right](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4946158d-4ed0-46d5-9075-8fec0cf3c000/public)

### Template Syntax

The template is a Markdown document. You control how data is embedded using the tags.

- `{{table}}` — renders the full output of the Data Mart's Input Source as a Markdown table  
- `{{table source="data_artifact_id"}}` — renders the result of a specific Data Artifact identified by `data_artifact_id`  
- `{{value}}` — inserts a single scalar value from the default source (row 1, column 1)  
- `{{value source="data_artifact_id" path=".columnName[row]"}}` — inserts a single scalar value from a specific Data Artifact and cell  

When the Insight is run, each `{{table}}` tag is replaced with a live Markdown table containing up to 100 rows from the corresponding query result.

Use `{{value}}` when you need to pull one number or label out of a query result — ideal for KPIs and summary sentences.

There are three ways to address the cell.

**No parameters** — returns the value at row 1, column 1 of the default source:

```handlebars
{{value}}
```

**`path=".columnName"`** — returns row 1 of the named column; add `[n]` to target a specific row (1-based):

```handlebars
{{value source="kpis" path=".total_spend"}}
{{value source="kpis" path=".cost_per_click[2]"}}
```

**`column` + `row`** — same result as `path`, using separate parameters; `column` accepts a name or a 1-based index:

```handlebars
{{value source="kpis" column="cost_per_click" row="2"}}
```

`path` and `column`/`row` are mutually exclusive.

Example — a summary sentence using values from a `kpis` Data Artifact:

```markdown
## This Week at a Glance

Total spend: **{{value source="kpis" path=".total_spend"}}**
Top channel: **{{value source="kpis" column="top_channel"}}**
Cost per click: **{{value source="kpis" path=".cost_per_click[1]"}}**
```

![Insight template editor showing {{value}} tags rendered as inline scalar metrics inside a narrative Markdown document](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/71c2f97b-4a2f-4b26-019e-3e68df387000/public)

### Data Artifacts

A **Data Artifact** is a named SQL query attached to an Insight. Artifacts are the data sources that feed `{{table source="data_artifact_id"}}` tags in the template.

- Each artifact has a unique **data_artifact_id** (alphanumeric and underscores only, e.g., `campaigns`, `top_channels`).
- A single Insight can have up to **5 Data Artifacts**.
- SQL is validated as you type and you can preview results before saving.
- Artifact SQL is executed against the Data Mart's connected storage (e.g., BigQuery, Athena) when the Insight runs.

![Data Artifacts panel listing attached SQL queries with their keys, titles, and validation status indicators](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/7f29bea7-f90c-4b9a-633f-807cb2a09100/public)

---

## Creating an Insight

### Option A: Use the AI Assistant

The **AI Assistant** panel (within the Insight editor) is a chat interface for iteratively building and refining an Insight. You can ask it to:

- Write or revise the Markdown template
- Create or edit a Data Artifact's SQL
- Explain what an existing query does
- Attach a new data source to the template

The assistant proposes changes as **suggested actions**. Click **Apply** to write the suggestion to the editor. No changes are saved to the template until you explicitly apply them.

![AI Assistant chat panel with a user message, AI response, and an Apply button to write the suggested changes to the Insight template](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ee624356-13b6-4989-1337-c16850ca0d00/public)

### Option B: Create Manually

1. Open a Data Mart and click the **Insights** tab.
2. Click **+ New Insight**.
3. Give the Insight a title.
4. Write or paste your Markdown template in the editor. Use `{{table}}` to embed data.
5. Add Data Artifacts if needed (see [Managing Data Artifacts](#managing-data-artifacts) below).
6. Click **Run** to generate the first output.

![Insights list view for a Data Mart showing existing Insights with their titles, last modified dates, and a Run button for each](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d1fced7c-25ce-4bef-d4fa-db2fbc631d00/public)

---

## Managing Data Artifacts

Data Artifacts are managed within the Insight editor.

### Add an Artifact

1. In the Insight editor, click **+ Data Artifact**.
2. Enter a **title** and a unique **key** (used in `{{table source="data_artifact_id"}}`).
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

Deleting an artifact removes its binding from the Insight. Any `{{table source="data_artifact_id"}}` tags referencing it will fail to render on the next run.

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

![Send & Schedule panel showing delivery channel options — Email, Slack, Microsoft Teams, and Google Chat — with a schedule picker](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c2af6ef6-93e6-4b9a-39eb-0e74a7259200/public)

![Example of a delivered Insight report rendered as a formatted message in a connected channel](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b857e47e-32bf-4df3-c85b-a55b011a5400/public)

---

## Roles and Permissions

| Action | Required Role |
|---|---|
| View Insights and preview output | Business User |
| Create, edit, delete Insights | Technical User |
| Add or remove Data Artifacts | Technical User |
| Run or cancel an Insight | Technical User |
| Create and manage own Reports | Business User (owner) |
| Manage any Report (project-wide) | Technical User |

## Limits

| Limit | Value |
|---|---|
| Data Artifacts per Insight | 5 |
| Rows returned per Data Artifact on run | 100 |
| Artifact key format | Alphanumeric and underscores (`[a-zA-Z0-9_]`), max 64 characters |

## Related Pages

- [Publishing a Data Mart](sql-data-mart.md)
- [Report Triggers](report-triggers.md)
- [Manage Destinations](../../destinations/manage-destinations.md)
