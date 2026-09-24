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
    - **App ID** – paste the App ID you saved earlier following the [CREDENTIALS](CREDENTIALS) tutorial.
    - **Secret** – paste the Secret you saved earlier following the [CREDENTIALS](CREDENTIALS) tutorial.
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
4. Click **Finish**, then **Publish Data Mart**.

![Reddit Ads Publish Data Mart](res/reddit_publish.png)

### Resolve Short Links

Ads often point to short links. OWOX can follow each short link and store the landing page next to it:

- **Ads**: `click_url` resolves into `click_url_parsed`.

Keep the source field and its parsed field selected and enable **Process Short Links** under **Advanced** settings. OWOX selects `click_url` and `click_url_parsed` by default. A parsed field holds the landing page for short links and the original value for other links.

OWOX resolves standard short links, such as `https://bit.ly/abc123`, on any domain. Links with several path parts resolve only on domains listed in the `CONNECTOR_SHORT_LINK_DOMAINS` environment variable. Your administrator sets this variable for the whole deployment. See [Environment Variables](https://docs.owox.com/docs/getting-started/deployment-guide/environment-variables/#connectors).

OWOX resolves each short link once per Data Mart and remembers the result for 30 days. Rows imported before you selected a parsed field keep their old values until you run a backfill.

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
