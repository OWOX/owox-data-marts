# How to Import Data from X Ads Source

Before you start, verify:

- You have [X Ads API credentials](CREDENTIALS.md): Consumer Key, Consumer Secret, Access Token, and Access Token Secret.
- You have your **Account ID** — find it in your [ads.x.com](https://ads.x.com/) URL (covered in [Set Up the Connector](#set-up-the-connector) below).
- You have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/). You also need [at least one storage](https://docs.owox.com/docs/storages/manage-storages/) in **Storages** — you can configure it later if needed.

## Create the Data Mart

- Click **New Data Mart** (available from any page in OWOX Data Marts).
- Enter a title and select the Storage. If you haven't configured a storage yet, click **New Storage** to create one now and configure it later.
- Click **Create Data Mart**.

![Create Data Mart dialog with Title set to "X Ads Data Mart", Storage selected, and the Create Data Mart button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/7985e452-5a2b-40e3-dd63-1c59c4a8a400/public)

## Set Up the Connector

1. Select **Connector** as the definition type.
2. Click **Set up connector** and choose **X Ads**.
3. Fill in the required fields:
   - **Consumer Key** and **Consumer Secret** – from the **Keys & Tokens** section of your X developer app.
   - **Access Token** and **Access Token Secret** – final user tokens from the [Credentials Guide](CREDENTIALS.md).
   - **Account ID** – find it in your [ads.x.com](https://ads.x.com/) URL. For example, in `https://ads.x.com/campaign_form/18ce55in6wt/campaign/new`, the **Account ID** is `18ce55in6wt`. To add multiple accounts, separate them with commas.
4. Leave all other fields as default.

![Data Setup page showing the Definition Type dropdown with Connector option highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ddc42653-e722-407a-6c7f-78c19a15ac00/public)

![Set Up Connector panel for X Ads showing fields for Consumer Key, Consumer Secret, Access Token, Access Token Secret, and Account ID](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/fdeac601-0146-4821-1357-2708adbfdc00/public)

![X Ads Manager page showing the Account ID highlighted in the URL bar and in the account sidebar](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/301d5eb5-3594-4e47-ccb0-59dffe376900/public)

## Configure Data Import

1. Choose one of the available **endpoints**. Start with **Ad Performance** for daily metrics (impressions, clicks, spend).
2. Select the required **fields** or leave defaults.
3. Specify the **dataset** name in your storage (for example, a BigQuery dataset). OWOX creates it automatically if it doesn't exist. The table name is auto-generated from the endpoint name (for example, `x_ads_stats`). Leave the default if you're unsure.
4. Click **Finish**, then **Publish & Run Data Mart**.

![X Ads Data Mart Data Setup page with the Publish & Run Data Mart button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/27e79500-99e8-447a-9b7e-d8d58e619600/public)

## Run the Data Mart

The first run imports data from the **1st of the previous month** through today.

The connector does not run again automatically. Set up a trigger to schedule recurring imports.

### Schedule Automatic Runs

1. Open the **Triggers** tab of your Data Mart.
2. Click **+ Add Trigger**.
3. Set **Trigger Type** to `Connector Run`.
4. Choose a schedule: **Daily**, **Weekly**, **Monthly**, or **Interval**.
5. Click **Save**.

For one-off imports, choose one of the following options. Use **Incremental** to refresh recent data. Use **Backfill** to reload a specific historical period — for example, after adding new fields or fixing a data error.

### Option 1: Incremental Load

Choose **Manual Run → Incremental load**.

It imports today's data, plus the number of previous days set in **Reimport Lookback Window** (default: 2 days). Change this value in the connector's **Advanced Settings** tab.

![Published X Ads Data Mart showing the three-dot menu open with the Manual Run option circled](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d532a3db-df6b-4f19-646a-cc20c2b45e00/public)

![Manual Run dialog with Incremental load selected, showing the description of adding only new or updated records](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/17cb8336-c759-4d38-aa90-a3c80c2dab00/public)

![Connector Advanced Settings showing the Reimport Lookback Window field set to 2](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1d89ad0a-9f77-4d8d-d9ac-2f816f729800/public)

### Option 2: Backfill for a Specific Date Range

Choose **Manual Run → Backfill (custom period)** to load historical data.

1. Select the **Start Date** and **End Date**.
2. Click **Run**.

![Manual Run dialog with Backfill (custom period) selected, showing Start Date and End Date fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b8a71ff2-60a1-4b8e-135b-4bf8b30d4600/public)

The run is complete when the **Run History** tab shows **Success**. A first run typically takes a few minutes for small accounts and longer for accounts with large data volumes.

![Run History tab showing a completed run with a Success status](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/88eeb790-e354-4dcb-df12-efcf00f8fb00/public)

## Access Your Data

Once the run completes, OWOX writes data to the dataset you specified. Open your storage console (for example, BigQuery or Snowflake) and navigate to that dataset. Each endpoint creates a separate table named after it — for example, `x_ads_stats` for Ad Performance data.

## Troubleshooting

Check the **Run History** tab for error messages. To update credentials or connector settings, open the **Data Setup** tab of your Data Mart, edit the fields, and click **Save**. Common errors and fixes:

**`[UNKNOWN] HttpRequestException: The client application making this request does not have access to Twitter Ads API`**

X hasn't approved your Ads API access yet. Return to [Step 2: Request Ads API Access](CREDENTIALS.md#step-2-request-ads-api-access) in the Credentials Guide and submit the request.

![Run History tab showing a failed run with the HttpRequestException error about missing Twitter Ads API access](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d8dee7a1-615b-46df-4631-9851d265f900/public)

**`[UNKNOWN] HttpRequestException: Could not authenticate you.`**

The Consumer Key or Consumer Secret is wrong. Re-enter them from [Step 1](CREDENTIALS.md#step-1-create-a-developer-app) or [Step 3](CREDENTIALS.md#step-3-get-your-consumer-key-and-secret) of the Credentials Guide.

**`[UNKNOWN] HttpRequestException: Invalid or expired token.`**

The Access Token or Access Token Secret is wrong or was regenerated after setup. Return to [Step 4](CREDENTIALS.md#step-4-generate-access-token-and-token-secret) of the Credentials Guide to get fresh tokens, then update them in the **Data Setup** tab.

**`[UNKNOWN] HttpRequestException: Account was not found`**

Your X account doesn't have an active Premium or Premium+ subscription required for X Ads Manager. If your subscription is active, double-check the Account ID in your ads.x.com URL and update it in the **Data Setup** tab.

![Run History detail page showing the Raw tab with the JSON error output for the Account was not found error](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/19e04929-020a-450e-8b78-6df1d0073a00/public)

**`[UNKNOWN] HttpRequestException: You are not permitted to perform this action`**

Your X account lacks permission for this endpoint. Re-check your account's access level and try again.

For anything else:

- Join the [Slack Community](https://join.slack.com/t/owox-data-marts/shared_invite/zt-3tnigd08g-f2uU_7oNNwzCyTB2tITnqA) to ask questions and get help from other users.
- Browse the [Q&A section](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) — your question might already be answered.
- Found a bug? [Open an issue](https://github.com/OWOX/owox-data-marts/issues).
- Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements.
