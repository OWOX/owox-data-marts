# How to Import Data from the Linkedin Ads Source

Before proceeding, please make sure that:

- You have created a **refresh token** (as described in [CREDENTIALS](CREDENTIALS)) and securely saved your **Client ID** and **Primary Client Secret**.  
- You have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![LinkedIn Ads Storage](res/linkedin_ads_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![LinkedIn Ads New Data Mart](res/linkedin_ads_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Click **Set up connector** and choose **LinkedIn Ads**.  
3. Fill in the required fields:
    - **Client ID** – paste the ID you saved earlier.
    - **Primary Client Secret** – paste the secret you saved earlier.
    - **Refresh Token** – paste the token you created following the [CREDENTIALS](CREDENTIALS) tutorial.
    - **Account URNs** – you can find this value on your [LinkedIn Campaign Manager](https://www.linkedin.com/campaignmanager/).
    - Leave the other fields as default and proceed to the next step.

![LinkedIn Ads Input Source](res/linkedin_ads_connector.png)

![LinkedIn Ads Fill Data](res/linkedin_ads_fill_data.png)

![LinkedIn Account URN](res/linkedin_account.png)

## Configure Data Import

1. Choose one of the available **endpoints**.  
2. Select the required **fields**.  
3. Specify the **dataset** where the data will be stored (or leave the default).  
4. Click **Finish**, then **Save** and **Publish Data Mart**.

![LinkedIn Ads Publish Data Mart](res/linkedin_ads_publish.png)

## Run the Data Mart

You now have two options for importing data from LinkedIn Pages:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Linkedin Ads Import New Data](res/linkedin_ads_incremental.png)

![Linkedin Ads Incremental Load](res/linkedin_ads_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![LinkedIn Ads Reimport](res/linkedin_ads_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.
2. Click the **Run** button.

![LinkedIn Ads Backfill](res/linkedin_ads_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![LinkedIn Ads Success](res/linkedin_ads_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.

![LinkedIn Ads Import Success](res/linkedin_ads_bq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
