# View-Based Data Mart

Use this option when you want to define a Data Mart that directly references a view that already exists in your data warehouse.
This is useful when your logic is already encapsulated in a warehouse view and doesn’t require rewriting or copy-pasting SQL inside the Data Mart.

Note: You’ll need a data storage available for the data mart setup. Here is [how to add a data storage](../../storages/manage-storages.md)

## Step 1: Create a New Data Mart

- Click **+ New Data Mart**
- Give it a clear title, e.g., `Visitors`
- Select your **Data Storage** (BigQuery or Athena)
- Click **Create Data Mart**

![View Based Data Mart - 1](../../res/screens/Connector-Based-DataMart-1.png)

## Step 2: Enter View Details

In the **Input Source** panel:

- Set **Definition Type** to `View`
- Add the **View Name** in the format:  
  `projectId.datasetId.viewName` (for BigQuery)
  `catalog.schema.viewName` (for AWS Athena)

Click **Save**

![View Based Data Mart - 2](../../res/screens/table-data-mart-output-schema.png)

Once saved, the **Output Schema** will be generated automatically with:

- Field names
- Data types

You can then:

- Add **aliases** (business-friendly names)
- Write **descriptions** for each field
- Add a **description** to the Data Mart itself
- Specify **join keys**

Click **Publish Data Mart**

![View Based Data Mart - 3](../../res/screens/table-data-mart-publish.png)

## Step 3: Add a Destination

You can export the results to:

- **Google Sheets** → Set up destination, choose refresh schedule, and filters
- **Looker Studio** (coming soon)
- **OData** for Excel, Power BI, Tableau (coming soon)

Each destination will reuse the same Data Mart — no need to duplicate logic. You can share the same logic across multiple tools.

To do this:

1. Under the **Destinations** section, click **+ Add report**
2. Give your report a name, e.g. `Website Visitors`
3. Select a destination
4. Create a new Google Sheets document (or use an existing one) and share it (Edit permissions) with your **Google Sheets Service Account**
5. Add a link to your document (and specify the tab) and click **Create new report**

![View Based Data Mart - 4](../../res/screens/SQL-Based-DataMart-Report.png)

You can now:

- Run report  
- Edit report  
- Open document  
- Delete report

![View Based Data Mart - 5](../../res/screens/SQL-Based-DataMart-Run-Report.png)

## Step 4: Set Triggers

You can automate updates by setting a [Trigger](report-triggers.md) to refresh the data on a schedule.

Go to the **Triggers** tab → Click **+ Add Trigger**

- Choose **Trigger Type**: `Report Run`
- Set schedule:
  - **Daily** → Choose time and timezone
  - **Weekly** → Select days of the week, time, and timezone
  - **Monthly** → Select dates, time, and timezone
  - **Interval** → e.g., every 15 minutes
- Click **Create trigger**

![View Based Data Mart - 6](../../res/screens/SQL-Based-DataMart-Trigger.png)

You can also open the **Run History** tab to view execution logs, status, and timestamps.

## Related Pages

- [Scheduling Reports Updates →](report-triggers.md)
- [Adding More Report Destinations →](../../destinations/manage-destinations.md)
- [Create Connector-Based Data Mart →](onnector-data-mart.md)
- [Create SQL-Based Data Mart →](sql-data-mart.md)
- [Create Table-Based Data Mart →](table-data-mart.md)
- [Create Pattern-Based Data Mart →](pattern-data-mart.md)
