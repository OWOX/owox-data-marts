# How to Import Data from the Criteo Ads Source

Before proceeding, please make sure that:

- You securely saved your **Client ID** and **Client Secret** as described in [CREDENTIALS](CREDENTIALS).
- You have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.

![Criteo Ads Storage](res/criteo_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Criteo Ads New Data Mart](res/criteo_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Click **Set up connector** and choose **Criteo Ads**.  
3. Fill in the required fields:
    - **Advertiser ID** – you can find it on the homepage of your [Criteo Ads account](https://marketing.criteo.com/)
    - **Client ID** – paste the ID you saved earlier.
    - **Client Secret** – paste the secret you saved earlier.
    - Leave the other fields as default and proceed to the next step.

![Criteo Ads Input Source](res/criteo_connector.png)

![Criteo Ads Fill Data](res/criteo_fill_data.png)

![Criteo Ads Account ID](res/criteo_accountid.png)

## Configure Data Import

1. Choose one of the available **endpoints**.  
2. Select the required **fields**.  
3. Specify the **dataset** where the data will be stored (or leave the default).  
4. Click **Finish**, then **Save** and **Publish Data Mart**.

![Criteo Ads Publish Data Mart](res/criteo_publish.png)

## Run the Data Mart

You now have two options for importing data from Criteo Ads:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Criteo Ads Import New Data](res/criteo_incremental.png)

![Criteo Ads Incremental Load](res/criteo_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Criteo Ads Reimport](res/criteo_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.
2. Click the **Run** button.

![Criteo Ads Backfill](res/criteo_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![Criteo Ads Success](res/criteo_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.

![Criteo Ads Import Success](res/criteo_bq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
