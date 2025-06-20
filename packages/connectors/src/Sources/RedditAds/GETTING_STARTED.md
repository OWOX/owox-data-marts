## How to Import Data from the Reddit Ads Source

To start importing data from Reddit Ads, make a copy of one of the following templates:

- [**Reddit Ads → Google Sheets. Template**](https://docs.google.com/spreadsheets/d/1lLhr5LEzQeSt6cwv07B0CKR8WgN5-_8MuL3ChkJej5w/copy)
- [**Reddit Ads → Google BigQuery. Template**](https://docs.google.com/spreadsheets/d/1LC1PRlDtK--U03pWHt_soasiKxfMwfZcY0V2Pf7roDY/copy)

Fill in required parameters:
- **Start Date**
- **Account IDs**
- **Fields**

The import will begin from the selected **Start Date**.  
> ⚠️ **Note:** Choosing a long date range may result in import failure due to high data volume.

![Reddit Start Date](res/reddit_startdate.png)

You can find your **Account ID** on the homepage of your [Reddit Ads account](https://ads.reddit.com/):

![Reddit Account ID](res/reddit_accountid.png)

Copy and paste the ID into the appropriate field in the spreadsheet:

![Account ID](res/reddit_pasteid.png)

Some fields are pre-filled by default.  
To include additional fields, go to the **Fields** tab and check the boxes next to the ones you need.

![Reddit Fields](res/reddit_fields.png)

Open the menu: **OWOX → Manage Credentials**

![Reddit Credentials](res/reddit_credentials.png)

Enter your credentials as described in this guide:  
[**How to obtain the credentials for the Reddit Ads connector**](CREDENTIALS.md)

![Reddit Token](res/reddit_tokens.png)

Click **Check and Save**. Once credentials are saved, go to:  
**OWOX → Import New Data**

![Reddit Import Data](res/reddit_import.png)

The process is complete when the **Log** sheet shows the message:  
**"Import is finished"**  
Your data will appear in new tabs, named after the corresponding data types (e.g., *ad-account*, *ad-campaign*).

![Reddit Finished](res/reddit_success.png)

To include more fields later, check the appropriate boxes in the **Fields** tab and click:  
**OWOX → Import New Data**

> ⚠️ **Important:** To change the date range:
> 1. Clear existing data in the **Status** columns
> 2. Update the **Start Date** and/or **End Date**
> 3. Run **OWOX → Import New Data** again

![Reddit Clear](res/reddit_clear.png)

If you encounter any issues:

1. Check the "Logs" sheet for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements 