# Reddit Ads

How to Import Data from Reddit Ads to Google Sheets?

This guide will walk you through the process of collecting the Reddit Ads data directly into Google Sheets.

## Step 1: Configure the connector

To initiate the data import process from Reddit Ads, begin by creating a copy of a [**Reddit Ads → Google Sheets Template**](https://docs.google.com/spreadsheets/d/1lLhr5LEzQeSt6cwv07B0CKR8WgN5-_8MuL3ChkJej5w/copy)

In your newly copied spreadsheet, navigate to the "Config" sheet.

Start by filling out the **Account IDs** field. You can find your **Account ID** on the homepage of your [Reddit Ads account](https://ads.reddit.com/):

![Reddit Account ID](./res/reddit_accountid.png)

Copy and paste the ID into the appropriate field in the spreadsheet:

![Account ID](./res/reddit_pasteid.png)

## Step 2: Select Fields to Import

Several common data fields are pre-selected by default. To include additional fields in your import, go to the "Fields" tab and check the boxes next to the desired fields.

![Reddit Fields](./res/reddit_fields.png)

## Step 3: Fill in Access Credentials

Next, access the custom menu: **OWOX → Manage Credentials**.

![Reddit Credentials](./res/reddit_credentials.png)

Enter your credentials as described in this guide:  
[**How to obtain the credentials for the Reddit Ads connector**](../../packages/connectors/src/Sources/RedditAds/CREDENTIALS.md)

![Reddit Token](./res/reddit_tokens.png)

Click **Check and Save**. Once credentials are saved, go to menu.

## Step 3: Run connector

Now you have **two options** for importing data from Reddit Ads API:

### Option 1: Import Current Day's Data

Choose **OWOX → Import New Data** to load data for the **current day**.

![Reddit Import New Data](./res/reddit_importcurrentday.png)

> ℹ️ If you click **Import New Data** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Reddit Reimport](./res/reddit_reimport.png)

### Option 2: Manual Backfill for Specific Date Range

Choose **Manual Backfill** to load historical data for a custom time range.

![Reddit Backfill](./res/reddit_backfill.png)

1. Select the **Start Date** and **End Date**  
2. Click the **Run Manual Backfill** button

![Reddit Run Backfill](./res/reddit_runbackfill.png)

The process is complete when the **Log** field shows the message:  
**"Import is finished"**  

## Step 4: Access Your Data

- In the **Google Sheets** template, the data will appear in new tabs labeled with the corresponding data types (e.g., *accounts*).  

![Reddit Finished](./res/reddit_success.png)

Finally, your data will appear in new tabs labeled with the corresponding API endpoint types.  

To import more data:

1. Select the additional fields you need in the **Fields** tab.
2. Go to **OWOX → Import New Data** or **OWOX → Run Manual Backfill** again.

## Getting Help

Should you encounter any issues or questions not addressed in this guide:

1. **Check Logs:** Review the "Logs" sheet in your spreadsheet for specific error messages, which can often provide clues to the problem.
2. **Visit Q&A:** Before opening a new issue, please check the existing discussions and answers in our [Q&A section](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
3. **Report a Bug:** If you identify a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues) on our GitHub repository.
4. **Join the Discussion:** Feel free to join our [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions, share insights, or propose improvements to the source.

## License

This connector is part of the OWOX Data Marts project and is distributed under the [MIT license](../../licenses/MIT.md).
