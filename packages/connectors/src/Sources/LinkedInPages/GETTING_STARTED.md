# How to Import Data from the Linkedin Pages Source

To receive data from the LinkedIn Pages source, please make a copy of the file
["LinkedIn Pages → Google Sheets. Template"](https://docs.google.com/spreadsheets/d/1KgLiUiPfswvl-ZGRJnu937mKgRiYPJlbNxpmkzXo4-Q/copy) or
["LinkedIn Pages → Google BigQuery. Template"](https://docs.google.com/spreadsheets/d/1lFqSkdHjO2jTlHoi8QtmJNMCZK1YSaMKaSYmDI7LMKQ/copy)

Fill in required information:

- **Organization URNs**
- **Fields**
- **Destination Dataset ID** (for **Google BigQuery** template)
- **Destination Location** (for **Google BigQuery** template)

To obtain **Organization URN**, go to [LinkedIn Campaign Manager](https://www.linkedin.com/campaignmanager).

Select your ad account > Assets > Company Page.

The URL may show something like:

<https://www.linkedin.com/company/123456/admin/>

Here, `123456` is the Company ID and will be used as the Organization URN.

To include fields, go to the **Fields** tab and check the boxes next to the fields you want to include.

![LinkedIn Fields](res/linkedin_fields.png)

If you're using the **Google BigQuery** template, also provide:

- **Destination Dataset ID** in the format: `projectid.datasetid`
- **Destination Location**

> ℹ️ If the specified dataset doesn't exist, it will be created automatically.

![LinkedIn Dataset](res/linkedin_dataset.png)

Go to the menu: **OWOX → Manage Credentials**

![LinkedIn Credentials](res/linkedin_credentials.png)

Enter your Access Token obtained by following this tutorial: [**How to obtain the credentials for the LinkedIn Pages connector**](CREDENTIALS.md).

![LinkedIn Token](res/linkedin_token.png)

Click **OK**.

Now you have **two options** for importing data from LinkedIn Pages:

Option 1: Import Current Day's Data

Choose **OWOX → Import New Data** to load data for the **current day**.

![LinkedIn Import New Data](res/linkedin_newdata.png)

> ℹ️ If you click **Import New Data** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![LinkedIn Reimport](res/linkedin_reimport.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Manual Backfill** to load historical data for a custom time range.

![LinkedIn Backfill](res/linkedin_backfill.png)

1. Select the **Start Date** and **End Date**  
2. Click the **Run Manual Backfill** button

![LinkedIn Run Backfill](res/linkedin_runbackfill.png)

The process is complete when the **Log** field shows the message:  
**"Import is finished"**  

Access Your Data:

- In the **Google Sheets** template, the data will appear in new tabs labeled with the corresponding data types (e.g., *follower_statistics*, *follower_statistics_time_bound*).  

![LinkedIn Finished](res/linkedin_importsheets.png)

- In the **Google BigQuery** template, the data will be written to the dataset specified earlier.

![LinkedIn Finished](res/linkedin_pages_bq.png)

To import more data:

1. Select the additional fields you need in the **Fields** tab.
2. Go to **OWOX → Import New Data** or **OWOX → Run Manual Backfill** again.

If you encounter any issues:

1. Check the "Logs" sheet for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
