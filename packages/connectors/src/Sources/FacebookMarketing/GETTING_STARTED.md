# How to Import Data from the Facebook Ads Source

To begin importing data from Facebook Ads, start by making a copy of one of the following templates:

- [**Facebook Marketing → Google Sheets. Template**](https://docs.google.com/spreadsheets/d/1OgpGMnQqUpS23rmOyA2gTVO2FK48oPS7tJGBp9NYJy4/copy)
- [**Facebook Marketing → Google BigQuery. Template**](https://docs.google.com/spreadsheets/d/1XJPrB89Zn-tEnfxtgzM974Vnfj8P4T8kgwXQfPkn6vU/copy)

Fill in the required information:

- **Account IDs**
- **Fields**
- **Destination Dataset ID** (for **Google BigQuery** template)
- **Destination Location** (for **Google BigQuery** template)

You can find your **Account ID** on the **Account Overview** page in [Meta Ads Manager](https://adsmanager.facebook.com/adsmanager/manage/accounts).  

![Facebook Account ID](res/fb_accountid.png)

Copy and paste the ID into the spreadsheet:  

![Account ID](res/fb_pasteid.png)

Some fields are pre-filled by default.  
To include additional fields, go to the **Fields** tab and check the boxes next to the fields you want to include.

![Facebook Fields](res/fb_fields.png)

If you're using the **Google BigQuery** template, also provide:

- **Destination Dataset ID** in the format: `projectid.datasetid`
- **Destination Location**

> ℹ️ If the specified dataset doesn't exist, it will be created automatically.

![Facebook Dataset](res/facebook_dataset.png)

Open the menu: **OWOX → Manage Credentials**

![Facebook Credentials](res/fb_credentials.png)

Enter your credentials obtained by following this guide: [**How to obtain the access token for the Facebook connector**](CREDENTIALS.md)

![Facebook Token](res/fb_token.png)

Now you have **two options** for importing data from Facebook Ads:

Option 1: Import Current Day's Data

Choose **OWOX → Import New Data** to load data for the **current day**.

![Facebook Import New Data](res/facebook_newdata.png)

> ℹ️ If you click **Import New Data** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Facebook Reimport](res/facebook_reimport.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Manual Backfill** to load historical data for a custom time range.

![Facebook Backfill](res/facebook_backfill.png)

1. Select the **Start Date** and **End Date**  
2. Click the **Run Manual Backfill** button

![Facebook Run Backfill](res/facebook_runbackfill.png)

The process is complete when the **Log** field shows the message:  
**"Import is finished"**  

Access Your Data:

- In the **Google Sheets** template, the data will appear in new tabs labeled with the corresponding data types (e.g., *ad-account*, *ad-campaign*).  

![Facebook Import Success Sheets](res/facebook_importsheets.png)

- In the **Google BigQuery** template, the data will be written to the dataset specified earlier.

![Facebook Import Success](res/facebook_importgbq.png)

To import more data:

1. Select the additional fields you need in the **Fields** tab.
2. Go to **OWOX → Import New Data** or **OWOX → Run Manual Backfill** again.

If you encounter any issues:

1. Check the "Logs" sheet for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
