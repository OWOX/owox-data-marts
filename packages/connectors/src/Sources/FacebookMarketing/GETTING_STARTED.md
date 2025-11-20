# How to Import Data from the Facebook Ads Source

Before proceeding, please make sure that:

- You have already created an **access token**, as described in [CREDENTIALS](CREDENTIALS.md).  
- You [have run **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![Facebook Storage](res/facebook_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Facebook New Data Mart](res/facebook_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Click Set up connector and choose Facebook Ads.
3. Fill in the required fields:
    - **Access token** – paste the token you generated earlier.
    - **Account ID** – you can find it in **[Meta Ads Manager](https://adsmanager.facebook.com/adsmanager/manage/accounts) → Account Overview**.
    - Leave the other fields as default and proceed to the next step.

![Facebook Input Source](res/facebook_inputsource.png)

![Facebook Account ID](res/fb_accountid.png)

![Facebook Setup Connector](res/facebook_setupconnector.png)

## Configure Data Import

1. Choose one of the available endpoints.
2. Select the required **fields**. If you want to import spend, clicks and impressions from ad account, please, choose [`ad-account/insights`](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/) endpoint.
3. Specify the **dataset** where the data will be stored, or leave it as default.
4. Click **Finish**, then **Publish Data Mart**.

![Facebook Endpoint](res/facebook_endpoint.png)

![Facebook Publish Data Mart](res/facebook_publish.png)

## Run the Data Mart

Now you have **two options** for importing data from Facebook Ads:

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Facebook Import New Data](res/facebook_incremental.png)

![Facebook Incremental Load](res/facebook_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Facebook Reimport](res/facebook_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data for a custom time range.

1. Select the **Start Date** and **End Date**  
2. Click the **Run** button

![Facebook Backfill](res/facebook_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![Facebook Success](res/facebook_successrun.png)

## Access Your Data

The data will be written to the dataset specified earlier.

![Facebook Import Success](res/facebook_importgbq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
