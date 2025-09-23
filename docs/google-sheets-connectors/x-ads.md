# X Ads

How to Import Data from X Ads to Google Sheets

This guide will walk you through the process of collecting the X / Twitter Ads data directly into Google Sheets.

## Step 1: Configure the connector

To initiate the data import process from Twitter Ads, begin by creating a copy of a [**X Ads → Google Sheets Template**](https://docs.google.com/spreadsheets/d/1LM5RTill31OF_n3XPtvoSW4LquD3JbzK3lgQbzTSPlE/copy)

In your newly copied spreadsheet, navigate to the "Config" sheet.

Start by filling out the **Account IDs** field.

To find your **Account ID**, go to [https://ads.x.com](https://ads.x.com/) and look at the URL of your account.  
For example, in this link:  
`https://ads.x.com/campaign_form/18ce55in6wt/campaign/new`  
The **Account ID** is: `18ce55in6wt`

To include more fields, go to the **Fields** tab and check the boxes next to the fields you want to include.

![X Ads Fields](./res/xads_fields.png)

## Step 2: Select Fields to Import

Several common data fields are pre-selected by default. To include additional fields in your import, go to the "Fields" tab and check the boxes next to the desired fields.

## Step 3: Fill in Access Credentials

Next, access the custom menu: **OWOX → Manage Credentials**.

Enter your credentials obtained by following this guide: [**How to obtain the credentials for the X Ads connector**](../../packages/connectors/src/Sources/XAds/CREDENTIALS.md).

Click the **Save** button.

![X Ads Credentials](./res/xads_credentials.png)

## Step 3: Run connector

Once your credentials are saved, click: **OWOX → Import New Data**

The process is complete when the **Log** sheet shows the message:  
**"Import is finished"**  

In the **Google Sheets** template, the data will appear in new tabs labeled with the corresponding data types (e.g., *accounts*).  

![X Ads Finished](./res/xads_finished.png)

## Getting Help

Should you encounter any issues or questions not addressed in this guide:

1. **Check Logs:** Review the "Logs" sheet in your spreadsheet for specific error messages, which can often provide clues to the problem.
2. **Visit Q&A:** Before opening a new issue, please check the existing discussions and answers in our [Q&A section](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
3. **Report a Bug:** If you identify a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues) on our GitHub repository.
4. **Join the Discussion:** Feel free to join our [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions, share insights, or propose improvements to the source.

## License

This connector is part of the OWOX Data Marts project and is distributed under the [MIT license](../../licenses/MIT.md).
