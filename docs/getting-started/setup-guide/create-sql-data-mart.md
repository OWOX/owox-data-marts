# Creating a Data Mart from a SQL Query

Use this option when you want to define a Data Mart based on a SQL query written manually — using your existing data warehouse tables, joins, and logic.

You’ll need a data storage available for the data mart setup. Here is [how to add a data storage](create-data-storage.md)

## Step 1: Create a New Data Mart

- Click **+ New Data Mart**
- Give it a descriptive title (e.g., `Visitors`)
- Select your **Data Storage** (Google BigQuery or AWS Athena)
- Click **Create Data Mart**

![Create Data Mart-1](../res/screens/SQL-Based-DataMart-1.png)

## Step 2: Choose Definition Type – SQL

In the **Input Source** section, set the **Definition Type** to `SQL Query`.

You’ll now see a SQL editor where you can write or paste your query.

Write a new query or paste an existing one.  
Wait until it’s validated, then click **Save** (and **Publish Data Mart**).

> ✅ **Tip:** Keep your query focused on one specific business question. This helps with reusability and semantic clarity.

![Create Data Mart-2](../res/screens/SQL-Based-DataMart-SQL.png)

You can reference any **table or view** available in your storage.

## Step 3: Define Output Schema

Once the query is saved, the **Output Schema** will be generated automatically.  OWOX will attempt to auto-detect:

- Column names
- Data types

![Create Data Mart-3](../res/screens/SQL-Based-DataMart-Output-Schema.png)

You can:

- Mark **primary keys**
- Add **aliases** (business-friendly column names)
- Add **descriptions** for each field

> 💡 These descriptions improve usability when the data is reused in BI tools or shared with business users.

## Step 4: Add a Description (Optional but Recommended)

Use the **Overview** tab to describe:
- What the Data Mart is about
- What business question it answers
- Any context that might help other users

![Create Data Mart-4](../res/screens/SQL-Based-DataMart-Description.png)

## Step 5: Add Reports

Under the **Destinations** section, click **+ Add report**.

1. Give your report a name, e.g. `Website Visitors`
2. Select a destination
3. Create a new Google Sheets document (or use an existing one)
4. Share the document (with **Edit permissions**) with your **Google Sheets Service Account**
5. Add the link to your document (to a tab in the doc)
6. Click **Create new report**

![Create Data Mart-5](../res/screens/SQL-Based-DataMart-Report.png)

You can now:

- Run the report  
- Edit the report  
- Open the document  
- Delete the report

![Create Data Mart-6](../res/screens/SQL-Based-DataMart-Run-Report.png)

## Step 6: Set Triggers

You can automate the query by setting a **Trigger** to refresh the data on a schedule.

- Go to the **Triggers** tab → Click **+ Add Trigger**
- Choose **Trigger Type**: `Report Run`
- Set schedule:
  - **Daily** → choose time & timezone
  - **Weekly** → select days of the week, time & timezone
  - **Monthly** → select dates, time & timezone
  - **Interval** → e.g., every 15 minutes
- Click **Create trigger**

## Related Links

- [Scheduling reports updates →](/report-triggers.md)
- [Adding more report destinations →](/create-a-destination.md)
