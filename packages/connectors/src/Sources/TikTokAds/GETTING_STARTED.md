# How to Import Data from the TikTok Ads Source

Before proceeding, please make sure that:

- You have already created an **access token**, as described in [GETTING_STARTED.md](GETTING_STARTED.md).  
- You [have run **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![TikTok Storage](res/tiktok_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![TikTok New Data Mart](res/tiktok_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.  
2. Click **Set up connector** and choose **TikTok Ads**.  
3. Fill in the required fields:  
   - **Access Token** – paste the token you generated earlier.  
   - **App ID** and **App Secret** – available in the **Basic Information** section of your TikTok app.  
   - **Advertiser ID** – paste the ID you received together with the access token, or retrieve it directly from [TikTok Ads Manager](https://ads.tiktok.com/).  
4. Leave all other fields as default and proceed to the next step.  

![TikTok Input Source](res/tiktok_ads_connector.png)

![TikTok Fill Data](res/tiktok_filldata.png)

![TikTok ID Secret](res/tiktok_idandsecret.png)

![TikTok Adv ID](res/tiktok_advid.png)

## Configure Data Import

1. Choose one of the available **endpoints**.  
2. Select the required **fields**.  
3. Specify the **dataset** where the data will be stored (or leave the default).  
4. Click **Finish**, then **Save** and **Publish Data Mart**.

![TikTok Ads Publish Data Mart](res/tiktok_ads_publish.png)

## Run the Data Mart

You now have two options for importing data from TikTok Ads:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![TikTok Ads Import New Data](res/tiktok_ads_incremental.png)

![TikTok Ads Incremental Load](res/tiktok_ads_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![TikTok Ads Reimport](res/tiktok_ads_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.
2. Click the **Run** button.

![TikTok Ads Backfill](res/tiktok_ads_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![TikTok Ads Success](res/tiktok_ads_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.

![TikTok Ads Import Success](res/tiktok_ads_bq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
