# How to Import Data from X Ads Source

Before proceeding, please make sure that:

- You have created and validated your [X Ads API credentials](CREDENTIALS.md): Consumer Key, Consumer Secret, Access Token, Access Token Secret, and Account ID.
- You have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and [created at least one storage in the **Storages** section](https://docs.owox.com/docs/storages/manage-storages/). If you didn't create the storage, you can configure it later.

![OWOX Data Marts Storages page showing the New Storage dialog with storage options including Google BigQuery, AWS Athena, Snowflake, AWS Redshift, and Databricks](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c0ab3899-e671-4d0f-4be0-7869a4c31100/public)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Create Data Mart dialog with Title set to "X Ads Data Mart", Storage selected, and the Create Data Mart button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/7985e452-5a2b-40e3-dd63-1c59c4a8a400/public)

## Set Up the Connector

1. Select **Connector** as the definition type.
2. Click **Set up connector** and choose **X Ads**.
3. Fill in the required fields:
   - **Consumer Key (API Key)** and **Consumer Secret (API Secret)** – from the **Keys and Tokens** section of your X developer app.
   - **Access Token** and **Access Token Secret** – final user tokens from the [Credentials Guide](CREDENTIALS.md).
   - **Account ID** – the account ID from the [https://ads.x.com](https://ads.x.com/) URL. For example, in this link: `https://ads.x.com/campaign_form/18ce55in6wt/campaign/new` the **Account ID** is: `18ce55in6wt`
4. Leave all other fields as default and proceed to the next step.

![Data Setup page showing the Definition Type dropdown with Connector option highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ddc42653-e722-407a-6c7f-78c19a15ac00/public)

![Set Up Connector panel for X Ads showing fields for Consumer Key, Consumer Secret, Access Token, Access Token Secret, and Account ID](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/fdeac601-0146-4821-1357-2708adbfdc00/public)

![X Ads Manager page showing the Account ID highlighted in the URL bar and in the account sidebar](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/301d5eb5-3594-4e47-ccb0-59dffe376900/public)

## Configure Data Import

1. Choose one of the available **endpoints**.
2. Select the required **fields**.
3. Specify the **dataset** where the data will be stored (or leave the default).
4. Click **Finish**, then **Publish & Run Data Mart**.

> ℹ️ If you haven't configured a storage yet, click on the storage in the Data Mart setup to configure it first.

![X Ads Data Mart Data Setup page with the Publish & Run Data Mart button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/27e79500-99e8-447a-9b7e-d8d58e619600/public)

## Run the Data Mart

Clicking **Publish & Run Data Mart** starts the first run automatically. It imports data from the **1st of the previous month** through today.

For subsequent runs, choose one of the following options:

### Option 1: Incremental Load

Choose **Manual Run → Incremental load**.

- Imports the **current day's data**, plus additional days back based on the **Reimport Lookback Window** value.

![Published X Ads Data Mart showing the three-dot menu open with the Manual Run option circled](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d532a3db-df6b-4f19-646a-cc20c2b45e00/public)

![Manual Run dialog with Incremental load selected, showing the description of adding only new or updated records](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/17cb8336-c759-4d38-aa90-a3c80c2dab00/public)

![Connector Advanced Settings showing the Reimport Lookback Window field set to 2](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1d89ad0a-9f77-4d8d-d9ac-2f816f729800/public)

### Option 2: Backfill for a Specific Date Range

Choose **Manual Run → Backfill (custom period)** to load historical data.

1. Select the **Start Date** and **End Date**.
2. Click **Run**.

![Manual Run dialog with Backfill (custom period) selected, showing Start Date and End Date fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b8a71ff2-60a1-4b8e-135b-4bf8b30d4600/public)

The run is complete when the **Run History** tab shows **Success**.

![Run History tab showing a completed run with a Success status](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/faaa6a4c-95bf-4c07-b80f-2ac47696c000/public)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.

If you encounter any issues:

1. Check the **Run History** tab for specific error messages.
2. Browse the [Q&A section](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) — your question might already be answered.
3. Found a bug? [Open an issue](https://github.com/OWOX/owox-data-marts/issues).
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements.
