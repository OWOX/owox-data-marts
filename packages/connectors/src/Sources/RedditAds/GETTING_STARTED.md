# How to Import Data from the Reddit Ads Source

Before you begin, please ensure that:

- You have already obtained all required credentials, as described in [CREDENTIALS](CREDENTIALS.md).  
- You have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![Reddit Ads Storage](res/reddit_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Reddit Ads New Data Mart](res/reddit_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Click **Setup connector** and choose **Reddit Ads**.  
3. Fill in the required fields:
    - **Client ID** – paste the App ID you saved earlier.
    - **Client Secret** – paste the Secret you saved earlier.
    - **Redirect URI** – paste `https://www.reddit.com/prefs/apps`
    - **Refresh Token** – paste the token you created following the [CREDENTIALS](CREDENTIALS) tutorial.
    - **User Agent** – `googleapps:owox-data-marts.redditads:v1.0.0 (by /u/your_reddit_username)` (replace `your_reddit_username` with your actual Reddit username).
    - **Account ID** – you can find this value on your [Reddit Ads Manager](https://ads.reddit.com/).
    - Leave the other fields as default and proceed to the next step.

![Reddit Ads Input Source](res/reddit_connector.png)

![Reddit Ads Fill Data](res/reddit_fill_data.png)

![Reddit Ads Account ID](res/reddit_accountid.png)

## Configure Data Import

1. Choose one of the available **endpoints**.  
2. Select the required **fields**.  
3. Specify the **dataset** where the data will be stored (or leave the default).  
4. Click **Finish**, then **Save** and **Publish Data Mart**.

![Reddit Ads Publish Data Mart](res/reddit_publish.png)

## Run the Data Mart

You now have two options for importing data from Reddit Ads:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Reddit Ads Import New Data](res/reddit_incremental.png)

![Reddit Ads Incremental Load](res/reddit_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Reddit Ads Reimport](res/reddit_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.
2. Click the **Run** button.

![Reddit Ads Backfill](res/reddit_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![Reddit Ads Success](res/reddit_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.

![Reddit Ads Import Success](res/reddit_bq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
