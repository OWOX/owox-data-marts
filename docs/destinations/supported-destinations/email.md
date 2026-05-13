# Email

Configure **Email** as a Destination in OWOX Data Marts to allow business users to receive messages based on the results of each Data Mart run.  

For example, you may want to notify a stakeholder every time a scheduled run produces updated data (such as new results from the Facebook Ads connector). You can also choose to receive an email only when the run result is empty.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/0419a9dee38a7bc1bac5063dbf754efd/iframe>

> ☝️ Make sure that the `insights@e.owox.com` address is not in your block list, and that emails do not end up in your spam folder.

---

## Configuration Steps

Follow the steps below to configure your **Email** destination.

### Step 1. Create a Destination

#### 1.1. Open the Destinations page

In the OWOX Data Marts web application, open **Destinations** in the main menu and click **+ New Destination**.

![OWOX Data Marts Destinations page with Destinations selected in the left sidebar. The main panel shows a searchable list of existing destinations and a New Destination button in the top right corner](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6cbc0c35-2e5e-4513-9f4a-538ae9b11200/public)

#### 1.2. Select the Destination type

Choose **Email** from the **Destination Type** dropdown.

![New destination dialog with the Destination Type dropdown open. Email is selected among the available options: Google Sheets, Data Studio, Email, Slack, Microsoft Teams, Google Chat, and OData (Coming soon)](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/15f3cd1d-d4c3-47db-5c6d-dc2a85ebea00/public)

#### 1.3. Configure Destination details

- **Title**: Enter a unique name for the Destination (for example, “Marketing Team”).
- **User emails list**: Add recipient email addresses separated by commas, semicolons, or new lines  
  (for example: `joe.doe@company.com`, `ceo@company.com`, `marketing.team@company.com`).

#### 1.4. Save the Destination

Review the details and click **Save** to create the Destination.

![New destination dialog with the Title set to "Marketing Team", Destination Type set to Email, and the recipient email list filled with three addresses. The Save and Cancel buttons are at the bottom](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ef93a8a7-36d3-415f-b443-5b870d219700/public)

---

### Step 2. Create a Report for this Destination

For each Destination, you can create as many reports as needed and configure different schedules for them.

#### 2.1. Open the Data Mart page

Go to your **Data Mart** and open the **Destinations** tab.

#### 2.2. Add a new report

In the block labeled with the name of your Destination, click **Add Report**.

![Data Mart Destinations tab showing the Marketing Team destination block. The report table is empty with the message "No reports for this destination", and the Add Report button is in the top right of the block](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/708f8681-1820-473e-11e8-d99b2a914600/public)

#### 2.3. Configure general settings

Change a report title if needed and make sure the report is assigned to the correct Destination.  
You can also view and copy the list of report recipients.

![New report dialog showing the General section. The Title field is set to "Notification for Marketing Team", the Destination is set to Marketing Team, and the Recipients section lists the three addresses from the destination with a copy button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/619caedc-d81a-4db2-f59d-4c4079524f00/public)

#### 2.4. Configure the template

Add a **Subject** and write the **Message** using Markdown.  
Optionally, switch to the **Insight** tab to attach a pre-built Insight as the email content source instead of a plain message.

![Report creation dialog showing the Template section. The Subject field reads "The Awesome Data Mart report has been updated" and the Message editor is in Markdown mode with a sample email body — greeting, update notice, support instructions, and sign-off — addressed to the Marketing Team](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a8518f5a-20e8-472f-fe7e-08daaf847e00/public)

##### Tags and Variables

You can use the `{{table}}` tag to render your Data Mart results as a table in the email. Type `/` in the editor to insert a tag quickly, or paste it manually.

**Options available when you type `/` in the editor:**

**Table** — Inserts a data table for the specified source.
Default: `{{table}}`

> If you use the `{{table}}` tag without additional parameters, the row limit defaults to 100.

**Table with limit** — Inserts a data table with an explicit row limit.
Default: `{{table source="main" limit="100"}}`

> You can set `limit` to any value from 1 to 100.

**Value (Path)** — Inserts a single cell value using path syntax.
Default: `{{value source="main" path=".column_name[1]"}}`

> Replace `column_name` with the actual column name and `1` with the target row number.

**Value (Column/Row)** — Inserts a single cell value using column/row index syntax.
Default: `{{value source="main" column="1" row="1"}}`

> This syntax preserves report accuracy when the schema changes — no updates are needed if a column is renamed.

![Report editor with the Message field in Markdown mode. A forward slash typed on line 1 has triggered an autocomplete menu showing four tag options: Table (highlighted, described as "Insert a table tag with source binding"), Table with limit, Value (Path), and Value (Column/Row)](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4deb6f02-9018-46e9-ea7b-c7f790eb8200/public)

**Optional parameters for `{{table}}`:**

- `limit` — Maximum number of rows to display. Accepts 1 to 100. Default: `100` (this is also the hard maximum).
  Example: `limit=20`
- `columns` — Comma-separated list of columns to include.
  Example: `columns="id, revenue"`
- `source` — Source key to read from. Default: `main`.
  Example: `source="main"`

> 💡 To display 20 rows showing only `id` and `revenue`:  
> `{{table limit=20 columns="id, revenue"}}`

You can also use `{{dataHeadersCount}}` to display the total number of columns.

#### 2.5. Set sending conditions

Decide when the report should be sent based on the Data Mart run result:

- **Send always** – the report is sent after every run.  
- **Send only when result is empty** – the report is sent only if the Data Mart returns no data.  
- **Send only when result is not empty** – the report is sent only if the Data Mart returns data.

OWOX automatically runs the Data Mart before sending the report and checks the result. Your selected condition determines whether the report is sent.

![Report dialog showing the Sending Conditions section. The condition dropdown is expanded and displays three options: Send always (currently selected), Send only when result is empty, and Send only when result is not empty](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4836deeb-fc7e-4afd-32ea-d83593dba400/public)

#### 2.6. (Optional) Scheduling

To run this report automatically on a schedule (for example, every 5 minutes or every Monday and Wednesday at 3:00 PM), create a new trigger in the **Automate Report Runs** section.  

![Report creation dialog showing the Automate Report Runs section with one active trigger configured: Daily type, 09:00 AM, America/New_York timezone. An Add trigger button is available below to add more triggers](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3dff85d3-9e8b-4007-dd77-7c0b660e6600/public)

You can also add the trigger later in the **Triggers** tab of your Data Mart.

![Data Mart Triggers tab showing the Time triggers table with one entry: a Report Run for "Notification for Marketing Team" scheduled Daily at 09:00 America/New_York, with the next run in 22 hours and no previous runs. An Add Trigger button is in the top right of the section](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ee947a75-737a-496b-ae1c-4d321beeb700/public)

#### 2.7. Create the report

Click **Create & Run report** to save the report and trigger an immediate run. To save without running, open the dropdown next to the button and select **Create new report**.

![Bottom of the report creation dialog showing the Sending Conditions section and the action buttons: the primary Create & Run report button, a dropdown chevron for accessing Create new report, and a Cancel button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a315ba18-5e1d-42f5-37cd-bc23cc19cc00/public)

---

Have questions? Join the [OWOX Community](https://github.com/OWOX/owox-data-marts/discussions).
