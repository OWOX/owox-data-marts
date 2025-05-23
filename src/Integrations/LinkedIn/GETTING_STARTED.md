To receive data from the LinkedIn Ads source, please make a copy of the file
["LinkedIn Ads → Google Sheets. Template"](https://docs.google.com/spreadsheets/d/1-eo1z9h5qKGfNDVmSoVYgyEkWfRWRy07NaU5hZnM4Vk/copy) or
["LinkedIn Ads → Google BigQuery. Template"](https://docs.google.com/spreadsheets/d/1hHrS8FejfACt1lbOQCfY72YldjjMRP8Ft1aOxqqXYsA/copy).

To receive data from the LinkedIn Pages source, please make a copy of the file
["LinkedIn Pages → Google Sheets. Template"](https://docs.google.com/spreadsheets/d/1KgLiUiPfswvl-ZGRJnu937mKgRiYPJlbNxpmkzXo4-Q/copy) or
["LinkedIn Pages → Google BigQuery. Template"](https://docs.google.com/spreadsheets/d/1lFqSkdHjO2jTlHoi8QtmJNMCZK1YSaMKaSYmDI7LMKQ/copy)

Fill in required information:
- **Start Date**
- **Account URNs**
- **Organization URNs**
- **Fields**

The import will begin from the selected **Start Date**.  
> ⚠️ Note: Choosing a long date range may cause the import to fail due to high data volume.

![LinkedIn Start Date](/src/Integrations/LinkedIn/res/linkedin_date.png)

You can find your **Account URN** on the homepage of your LinkedIn Ads account:

![LinkedIn Account URN](/src/Integrations/LinkedIn/res/linkedin_account.png)

Copy and paste the URN into the appropriate field in the spreadsheet:

![Account URN](/src/Integrations/LinkedIn/res/linkedin_pasteurn.png)

To obtain **Organization URN**, go to [LinkedIn Campaign Manager](https://www.linkedin.com/campaignmanager).

Select your ad account > Assets > Company Page.

The URL may show something like:

https://www.linkedin.com/company/123456/admin/

Here, `123456` is the Organization URN.

To include fields, go to the **Fields** tab and check the boxes next to the fields you want to include.

![LinkedIn Fields](/src/Integrations/LinkedIn/res/linkedin_fields.png)

Go to the menu: **OWOX → Manage Credentials**

![LinkedIn Credentials](/src/Integrations/LinkedIn/res/linkedin_credentials.png)

Enter your Access Token obtained by following this tutorial: [**How to obtain the Access Token for the LinkedIn Ads / LinkedIn Pages connector**](https://github.com/OWOX/js-data-connectors/blob/main/src/Integrations/LinkedIn/CREDENTIALS.md).

![LinkedIn Token](/src/Integrations/LinkedIn/res/linkedin_token.png)

Click **OK**. Once your credentials are saved, click: **OWOX → Import New Data**

![LinkedIn Import Data](/src/Integrations/LinkedIn/res/linkedin_import.png)

The process is complete when the **Log** sheet shows the message:  
**"Import is finished"**  
Your data will appear in new tabs, named after the corresponding data types (e.g., *adAccount*, *adCampaignGroups*).

![LinkedIn Finished](/src/Integrations/LinkedIn/res/linkedin_success.png)