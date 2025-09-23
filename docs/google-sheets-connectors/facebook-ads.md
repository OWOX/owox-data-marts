# Facebook Ads

This guide is all about how to import data from Facebook & Instagram Ads to Google Sheets

To begin importing data from Facebook Ads into Google Sheets, start by making a copy of the **[following template](https://docs.google.com/spreadsheets/d/1OgpGMnQqUpS23rmOyA2gTVO2FK48oPS7tJGBp9NYJy4/copy)**

## Step 1: Configure the connector

1. Ads Account ID(s)

You can find your **Account ID** on the **Account Overview** page in [Meta Ads Manager](https://adsmanager.facebook.com/adsmanager/manage/accounts).  

![Facebook Account ID](./res/fb_accountid.png)

Copy and paste the ID into the spreadsheet:  

![Account ID](./res/fb_pasteid.png)

Next, **Select** the fields you want to collect

Some fields are pre-filled by default.  
To include additional fields, go to the **Fields** tab and check the boxes next to the fields you want to include.

![Facebook Fields](,/res/fb_fields.png)

## Step 2: Manage Credentials

Open the menu: **OWOX → Manage Credentials**

![Facebook Credentials](./res/fb_credentials.png)

Enter your credentials obtained by following this guide: [**How to obtain the access token for the Facebook connector**](../../packages/connectors/src/Sources/FacebookMarketing/CREDENTIALS.md)

![Facebook Token](./res/fb_token.png)

## Step 3: Run connector

Now you have **two options** for importing data from Facebook Ads:

### Option 1: Import Current Day's Data

Choose **OWOX → Import New Data** to load data for the **current day**.

![Facebook Import New Data](./res/facebook_newdata.png)

> ℹ️ If you click **Import New Data** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Facebook Reimport](./res/facebook_reimport.png)

### Option 2: Manual Backfill for Specific Date Range

Choose **Manual Backfill** to load historical data for a custom time range.

![Facebook Backfill](./res/facebook_backfill.png)

1. Select the **Start Date** and **End Date**  
2. Click the **Run Manual Backfill** button

![Facebook Run Backfill](./res/facebook_runbackfill.png)

The process is complete when the **Log** field shows the message:  
**"Import is finished"**  

Finally, your data will appear in new tabs labeled with the corresponding data types (e.g., *ad-account*, *ad-campaign*).  

![Facebook Import Success Sheets](./res/facebook_importsheets.png)

To import more data:

1. Select the additional fields you need in the **Fields** tab.
2. Go to **OWOX → Import New Data** or **OWOX → Run Manual Backfill** again.

## Support & Feedback

1. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
2. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
3. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements

## License

This source is part of the OWOX Data Marts project and is distributed under the [MIT license](../../licenses/MIT.md).
