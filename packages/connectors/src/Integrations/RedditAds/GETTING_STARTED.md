To start importing data from Reddit Ads, please make a copy of the ["Reddit. Template"](https://docs.google.com/spreadsheets/d/1QCzmcLhcGcXQ8PxU-1rfJ2kQ9wiDh-_Hf8r6EWhVTCQ/copy).

Fill in required information:
- **Start Date**
- **Account IDs**
- **Fields**

The import will begin from the selected **Start Date**.  
> ⚠️ Note: Choosing a long date range may cause the import to fail due to high data volume.

![Reddit Start Date](res/reddit_startdate.png)

You can find your **Account ID** on the homepage of your Reddit Ads account:

![Reddit Account ID](res/reddit_accountid.png)

Copy and paste the ID into the appropriate field in the spreadsheet:

![Account ID](res/reddit_pasteid.png)

Some fields are pre-filled by default.  
To include more fields, go to the **Fields** tab and check the boxes next to the fields you want to include.

![Reddit Fields](res/reddit_fields.png)

Go to the menu: **OWOX → Manage Credentials**

![Reddit Credentials](res/reddit_credentials.png)

Enter your credentials obtained by following this tutorial: [**How to obtain the credentials for the Reddit Ads connector**](CREDENTIALS.md).

![Reddit Token](res/reddit_tokens.png)

Click **Check and Save**. Once your credentials are saved, click: **OWOX → Import New Data**

![Reddit Import Data](res/reddit_import.png)

The process is complete when the **Log** sheet shows the message:  
**"Import is finished"**  
Your data will appear in new tabs, named after the corresponding data types (e.g., *ad-account*, *ad-campaign*).

![Reddit Finished](res/reddit_success.png)

To add more fields, check the boxes in the **Fields** tab and click:  
**OWOX → Import New Data**

> ⚠️ **Important:** If you want to change the date range:
> 1. First, clear the existing data in the **Status** columns.
> 2. Update the **Start Date** and/or **End Date**.
> 3. Click **OWOX → Import New Data** again.

![Reddit Clear](res/reddit_clear.png)