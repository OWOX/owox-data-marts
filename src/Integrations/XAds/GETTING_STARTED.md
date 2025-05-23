## How to Import Data from X Ads

To begin importing data from X Ads, start by making a copy of one of the following templates:

- [**X Ads → Google Sheets. Template**](https://docs.google.com/spreadsheets/d/1LM5RTill31OF_n3XPtvoSW4LquD3JbzK3lgQbzTSPlE/copy)
- [**X Ads → Google BigQuery. Template**](https://docs.google.com/spreadsheets/d/1l-zRdOkuWsD-0xEmh0BIEb8aF4k0fksk4G3xGU5W6bM/copy)

Fill in required information:
- **Start Date**
- **Account IDs**
- **Fields**

The import will begin from the selected **Start Date**.  
> ⚠️ Note: Choosing a long date range may cause the import to fail due to high data volume.

To find your **Account ID**, go to [https://ads.x.com](https://ads.x.com/) and look at the URL of your account.  
For example, in this link:  
`https://ads.x.com/campaign_form/18ce55in6wt/campaign/new`  
The **Account ID** is: `18ce55in6wt`

To include more fields, go to the **Fields** tab and check the boxes next to the fields you want to include.

If you’re using the **Google BigQuery** template, also fill in:
- **Destination Dataset ID** in the format: `projectid.datasetid`
- **Destination Location**

![X Ads Start Settings](/src/Integrations/XAds/res/xads_start.png)

Open the menu: **OWOX → Manage Credentials**

Enter your credentials obtained by following this guide: [**How to obtain the credentials for the X Ads connector**](https://github.com/OWOX/js-data-connectors/blob/main/src/Integrations/XAds/CREDENTIALS.md).

Click the **Save** button.

![X Ads Credentials](/src/Integrations/XAds/res/xads_credentials.png)

Once your credentials are saved, click: **OWOX → Import New Data**

The process is complete when the **Log** sheet shows the message:  
**"Import is finished"**  

If you encounter any issues:

1. Check the "Logs" sheet for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/js-data-connectors/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/js-data-connectors/issues)
4. Join the [discussion forum](https://github.com/OWOX/js-data-connectors/discussions) to ask questions or propose improvements 

