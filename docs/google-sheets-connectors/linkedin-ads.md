# LinkedIn Ads

This guide will walk you through the process of collecting the LinkedIn Ads data directly into Google Sheets.
It provides access to advertiser information, campaigns, ad groups, ads, performance metrics, and custom audiences.

## Step 1: Configure the connector

To initiate the data import process from LinkedIn Ads, begin by creating a copy of a [**LinkedIn Ads → Google Sheets Template**](https://docs.google.com/spreadsheets/d/1-eo1z9h5qKGfNDVmSoVYgyEkWfRWRy07NaU5hZnM4Vk/copy)

Once you have copied the template, proceed with the configuration steps:

1. In your newly copied spreadsheet, navigate to the "Config" sheet and add the **Account URN**.

You can find your **Account URN** on the homepage of your LinkedIn Ads account:

![LinkedIn Account URN](./res/linkedin_account.png)

Copy and paste the URN into the appropriate field in the spreadsheet:

![Account URN](./res/linkedin_pasteurn.png)

## Step 2: Select Fields to Import

Several common data fields are pre-selected by default. To include additional fields in your import, go to the "Fields" tab and check the boxes next to the desired fields.

![LinkedIn Fields](./res/linkedin_fields.png)

## Step 3: Fill in Access Credentials

Next, access the custom menu: **OWOX → Manage Credentials**.

![LinkedIn Credentials](./res/linkedin_credentials.png)

Enter your Access Token obtained by following this tutorial: [**How to obtain the credentials for the LinkedIn Ads connector**](../../packages/connectors/src/Sources/LinkedInAds/CREDENTIALS.md).

![LinkedIn Token](./res/linkedin_token.png)

## Step 3: Run connector

Now you have **two options** for importing LinkedIn Ads data:

### Option 1: Import Current Day's Data

Choose **OWOX → Import New Data** to load data for the **current day**.

![Facebook Import New Data](./res/facebook_newdata.png)

> ℹ️ If you click **Import New Data** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

### Option 2: Manual Backfill for Specific Date Range

Choose **Manual Backfill** to load historical data for a custom time range.

1. Select the **Start Date** and **End Date**  
2. Click the **Run Manual Backfill** button

![Facebook Run Backfill](./res/facebook_runbackfill.png)

The process is complete when the **Log** field shows the message:  
**"Import is finished"**  

Finally, your data will appear in new tabs labeled with the corresponding API endpoint types.  

To import more data:

1. Select the additional fields you need in the **Fields** tab.
2. Go to **OWOX → Import New Data** or **OWOX → Run Manual Backfill** again.

## Step 4: Schedule Your Connector

- **Daily Schedule:** To set up an automatic daily import, select "OWOX" > "Schedule" > "Set Daily Schedule"
- **Hourly Schedule:** To configure an automatic hourly import, select "OWOX" > "Schedule" > "Set Hourly Schedule"
- **Remove Schedules:** To disable all existing scheduled runs, select "OWOX" > "Schedule" > "Delete All Schedules"

## Getting Help

Should you encounter any issues or questions not addressed in this guide:

1. **Check Logs:** Review the "Logs" sheet in your spreadsheet for specific error messages, which can often provide clues to the problem.
2. **Visit Q&A:** Before opening a new issue, please check the existing discussions and answers in our [Q&A section](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
3. **Report a Bug:** If you identify a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues) on our GitHub repository.
4. **Join the Discussion:** Feel free to join our [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions, share insights, or propose improvements to the source.

## License

This source is part of the OWOX Data Marts project and is distributed under the [MIT license](../../licenses/MIT.md).
