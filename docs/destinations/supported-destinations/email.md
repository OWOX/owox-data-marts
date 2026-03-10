# Email

Configure **Email** as a Destination in OWOX Data Marts to allow business users to receive messages based on the results of each Data Mart run.  

For example, you may want to notify a stakeholder every time a scheduled run produces updated data (such as new results from the Facebook Ads connector). You can also choose to receive an email only when the run result is empty.

![Email example](../../res/screens/destinations-email-example.png)

> ☝️ Make sure that the `insights@e.owox.com` address is not in your block list, and that emails do not end up in your spam folder.

---

## Configuration Steps

Follow the steps below to configure your **Email** destination.

### Step 1. Create a Destination

#### 1.1. Open the Destinations page

In the OWOX Data Marts web application, open **Destinations** in the main menu and click **+ New Destination**.

![OWOX Data Marts interface showing the Destinations navigation item highlighted in the left sidebar with a red border, and the main panel displaying a Destinations page with a search bar and a red arrow pointing to the New Destination button in the top right corner. Below is a table with columns for Title, Type, and Created at, showing two Google Sheets destinations listed](res/email_newdestination.png)

#### 1.2. Select the Destination type

Choose **Email** from the **Destination Type** dropdown.

![OWOX Data Marts Configure destination dialog showing a Title field with Email Destination entered, and a Destination Type dropdown expanded with Email selected from options including Google Sheets, Looker Studio, Email, Slack, Microsoft Teams, Google Chat, and OData Coming soon. A red border highlights the Destination Type label and a red arrow points to the Email option](res/email_destinationtype.png)

#### 1.3. Configure Destination details

- **Title**: Enter a unique name for the Destination (for example, “Marketing Team”).
- **User emails list**: Add recipient email addresses separated by commas, semicolons, or new lines  
  (for example: `joe.doe@company.com`, `ceo@company.com`, `marketing.team@company.com`).

#### 1.4. Save the Destination

Review the details and click **Save** to create the Destination.

![OWOX Data Marts Configure destination dialog showing a Title field containing Marketing Team outlined in red, Destination Type set to Email with a dropdown arrow, and an Enter user emails list field containing joe.doe@company.com, ceo@company.com, marketing.team@company.com outlined in red. At the bottom is a blue Save button with a red arrow pointing to it, and a Cancel button below](res/email_configuredestination.png)

---

### Step 2. Create a Report for this Destination

For each Destination, you can create as many reports as needed and configure different schedules for them.

#### 2.1. Open the Data Mart page

Go to your **Data Mart** and open the **Destinations** tab.

#### 2.2. Add a new report

In the block labeled with the name of your Destination, click **+ Add report**.

![OWOX Data Marts interface displaying the Destinations tab of a Data Mart with a Marketing Team destination section that shows a table with columns for Title, Last Run Date, and Last Run Status. The table displays the message No reports for this destination. A red arrow points to the Add Report button with a plus icon in the upper right of the destination section](res/email_addreport.png)

#### 2.3. Configure general settings

Enter a report title and make sure the report is assigned to the correct Destination.  
You can also view and copy the list of report recipients.

![OWOX Data Marts dialog titled Marketing Team with subtitle Fill in the details to create a new report. The GENERAL section shows a Title field containing Notification for Marketing Team outlined in red. Below is a Destination dropdown showing Marketing Team with an email icon. The Recipients of this report section displays three email addresses: joe.doe@company.com, ceo@company.com, marketing.team@company.com with a Click to copy tooltip and copy icon](res/email_titleofthereport.png)

#### 2.4. Configure the template

Add a **Subject** and write the **Message** using Markdown.  
Switch to **Preview** to check how the email will appear to recipients.

![OWOX Data Marts interface showing a report creation dialog for Marketing Team with a TEMPLATE section containing two fields: Subject field displays The Awesome Data Mart report has been updated, and below is a Message field with Markdown and Preview tabs in the top right corner outlined in red. The message text reads: Dear Marketing Team, We're happy to let you know that the Awesome Data Mart report has been updated. If you have questions, contact the Analytics team or mention us in Slack using analytics-support. Best regards, The Analytics Team](res/email_message.png)

##### Tags and Variables

You can use the `{{table}}` tag to render your Data Mart results as a table in the email. Type `/` in the editor to insert a tag quickly, or paste it manually.

**Options available when you type `/` in the editor:**

**Table** — Inserts a data table for the specified source.
Default: `{{table}}`

> If you use the `{{table}}` tag without additional parameters, the row limit defaults to 10. Add an explicit `limit` parameter to display more rows.

**Table with limit** — Inserts a data table with an explicit row limit.
Default: `{{table source="main" limit="100"}}`

> You can set `limit` to any value from 1 to 100.

**Value (Path)** — Inserts a single cell value using path syntax.
Default: `{{value source="main" path=".column_name[1]"}}`

> Replace `column_name` with the actual column name and `1` with the target row number.

**Value (Column/Row)** — Inserts a single cell value using column/row index syntax.
Default: `{{value source="main" column="1" row="1"}}`

> This syntax preserves report accuracy when the schema changes — no updates are needed if a column is renamed.

![OWOX Data Marts dialog titled Main Destination with subtitle Update details of an existing report. The Template section shows a Subject field containing Last Marketing Data, and a Message field in Markdown mode with a forward slash typed on line 1. A dropdown autocomplete menu is open below the cursor showing four options: Table (highlighted in blue, with the description Insert a table tag with source binding), Table with limit, Value (Path), and Value (Column/Row). Each option has a blue tag icon. At the bottom of the dialog are a blue Save changes to report button and a Cancel button.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4deb6f02-9018-46e9-ea7b-c7f790eb8200/public)

**Optional parameters for `{{table}}`:**

- `limit` — Maximum number of rows to display. Accepts 1 to 100. Default: `10`.
  Example: `limit=20`
- `from` — Whether to read rows from the beginning or end of the table. Accepts `"start"` or `"end"`. Default: `start`.
  Example: `from="end"`
- `columns` — Comma-separated list of columns to include.
  Example: `columns="id, revenue"`
- `source` — Source key to read from. Default: `main`.
  Example: `source="main"`

> 💡 To display 20 rows from the end of the table, showing only `id` and `revenue`:  
> `{{table limit=20 from="end" columns="id, revenue"}}`

You can also use `{{dataHeadersCount}}` and `{{dataRowsCount}}` to display the total number of columns and rows.

#### 2.5. Set sending conditions

Decide when the report should be sent based on the Data Mart run result:

- **Send always** – the report is sent after every run.  
- **Send only when result is empty** – the report is sent only if the Data Mart returns no data.  
- **Send only when result is not empty** – the report is sent only if the Data Mart returns data.

OWOX automatically runs the Data Mart before sending the report and checks the result. Your selected condition determines whether the report is sent.

![OWOX Data Marts dialog showing the SENDING CONDITIONS section with Data Mart Run results displayed at the top in a red-bordered box. Below, a dropdown menu labeled Send always is expanded, revealing three options: Send always (selected with a checkmark), Send only when result is empty, and Send only when result is not empty. A red arrow points from the label to the dropdown](res/email_sendingconditions.png)

#### 2.6. (Optional) Scheduling

To run this report automatically on a schedule (for example, every 5 minutes or every Monday and Wednesday at 3:00 PM), create a new trigger in the **Automate Report Runs** section.  

![OWOX Data Marts dialog titled Marketing Team with subtitle Fill in the details to create a new report. The AUTOMATE REPORT RUNS section shows an Enabled toggle switch turned on in blue with a trash icon to the right. Below is a Type dropdown set to Daily, followed by Time field showing 09:00 AM and Timezone field displaying America/New_York (-05:00). At the bottom is a + Add trigger button with a red arrow pointing to it](res/email_trigger.png)

You can also add the trigger later in the **Triggers** tab of your Data Mart.

![OWOX Data Marts interface showing the Triggers tab selected with a red border at the top navigation. The page displays a Time triggers section with a calendar icon and a red arrow pointing to the Add Trigger button with a plus icon on the right. Below is a table with columns for Trigger Type, Run Target, Schedule, Next Run, and Last Run. One row shows Report Run type linked to Notification for Marketing Team, scheduled Daily at 09:00 America/New_York timezone, with Next Run in 22 hours and Last Run showing Never run. Navigation buttons Previous and Next appear at the bottom](res/email_triggers.png)

#### 2.7. Create the report

Click **Create New Report** to apply the report settings. If you want to run the report immediately, click **Create & Run report** instead.

![OWOX Data Marts dialog showing the Marketing Team report creation interface. Below are sending conditions with Data Mart Run results and a Send always dropdown. At the bottom, a blue Create new report button is outlined in red with an upward arrow icon, and to its right is a Create & Run report option with a red arrow pointing to it. A Cancel button appears at the bottom](res/email_createandrun.png)

---

Have questions? Join the [OWOX Community](https://github.com/OWOX/owox-data-marts/discussions).
