# Import Data from TikTok Ads

Use this guide to create a TikTok Ads Data Mart.

## Before You Start

Check these items before you create the Data Mart:

- You have set up [OWOX Data Marts](https://docs.owox.com/docs/getting-started/quick-start/).
- You have at least one [OWOX storage](https://docs.owox.com/docs/storages/manage-storages/#adding-a-new-storage).
- You can access the target advertiser account in [TikTok Ads Manager](https://ads.tiktok.com/).
- You know your numeric [Advertiser IDs](#set-up-the-connector).
- You chose an authentication method in [Credentials](CREDENTIALS.md).

For a general connector walkthrough, see [Connector-based Data Mart](https://docs.owox.com/docs/getting-started/setup-guide/connector-data-mart/).

## Create the Data Mart

1. Click **New Data Mart**.
2. Enter a title.
3. Select a storage.
4. Click **Create Data Mart**.

If you have no storage yet, click **New Storage**. You can create the storage now and configure it later.

![Create Data Mart dialog with the title, storage, and Create Data Mart button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/fcadd80a-5adf-4396-0036-3ff423186100/w=800)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Click **Set up connector** and choose **TikTok Ads**.
3. Choose your authentication method.

![Definition Type dropdown with the Connector option selected](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/740574ba-3e2e-49f7-9ee9-41c1d7075700/w=800)

For OAuth, click **Continue with TikTok**, then sign in with a TikTok user who can access the
advertiser account. If the button does not appear, use the **Access Token** method.

![Set Up Connector panel comparing the Continue with TikTok button and the manual Access Token fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/6f78606d-2ba8-49c2-a70f-21c21c64eb00/w=800)

For manual authentication, fill in these fields:

- **Access Token**: paste the token from [Credentials](CREDENTIALS.md).
- **App ID**: enter your TikTok App ID.
- **App Secret**: enter your TikTok App Secret.

Find the App ID and App Secret in **My Apps → App Detail → Basic Information**.

Then fill in **Advertiser IDs**. Use numeric IDs only. To import from several advertisers, separate the IDs with commas. You receive these IDs with the access token. You can also find
them in [TikTok Ads Manager](https://ads.tiktok.com/). The authorized TikTok user must access every listed advertiser.

![TikTok Ads connector fields for access token, App ID, App Secret, and Advertiser IDs](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1e0af015-839d-4600-fceb-c94095e58f00/w=800)

### Choose Data Level Before Fields

**Data Level** sets the reporting grain for `ad_insights` and `ad_insights_by_country`. Choose
it before you select fields. The field selector pins the matching unique-key fields, so rows
merge correctly.

| Data Level | Use it for | Pinned fields |
| --- | --- | --- |
| `AUCTION_AD` (default) | Daily metrics per ad. | `ad_id`, `stat_time_day`, `advertiser_id` |
| `AUCTION_ADGROUP` | Daily metrics per ad group. | `adgroup_id`, `stat_time_day`, `advertiser_id` |
| `AUCTION_CAMPAIGN` | Daily metrics per campaign. | `campaign_id`, `stat_time_day`, `advertiser_id` |
| `AUCTION_ADVERTISER` | Advertiser-level daily totals. | `stat_time_day`, `advertiser_id` |

`ad_insights_by_country` uses the same grain and adds `country_code` to the pinned fields.

`advertiser_id` is always pinned. **Advertiser IDs** can list several advertisers that write
into one destination table. At `AUCTION_ADVERTISER` no other field tells their rows apart.

Add any metrics you need. The field selector locks the pinned fields, so you cannot clear them.

> ⚠️ Do not change **Data Level** after a run has loaded data into a table. New rows would
> merge on a different key structure. Use a new Data Mart or a new destination table instead.

## Configure Data Import

1. Choose an endpoint.
2. Select fields, or keep the defaults.
3. Enter the target dataset, or keep the default.
4. Click **Finish**.
5. Click **Publish & Run Data Mart**.

The connector writes its tables into your storage. The field label depends on your storage, such
as **Dataset** for BigQuery or **Database** for Amazon Redshift. For your storage, see
[Supported Storages](https://docs.owox.com/docs/storages/supported-storages/).

For spend, impressions, clicks, and conversions, choose **Ad Performance** (`ad_insights`). Use
**Ad Performance by Country** (`ad_insights_by_country`) when you also need a country breakdown.

For endpoint details, see [Endpoints and Fields](ENDPOINTS_AND_FIELDS.md).

**Publish & Run Data Mart** stays inactive until your storage has valid settings. Open the
storage, check its settings, then come back to this step. See [Storage Management](https://docs.owox.com/docs/storages/manage-storages/#adding-a-new-storage).

![TikTok Ads Data Mart with the Publish & Run Data Mart button highlighted](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e0a5b161-c80b-434b-ae8f-e2304e6be400/w=800)

## Advanced Settings

Open **Advanced settings** to reach these options. The defaults suit most imports.

| Setting | Default | What it does |
| --- | --- | --- |
| **Reimport Lookback Window** | `2` | Days to re-request before the last imported date. Refreshes metrics that TikTok updated later. |
| **Include Deleted** | Off | Imports deleted campaigns, ad groups, and ads. It does not affect the advertiser, performance, or audience endpoints. |
| **Sandbox Mode** | Off | Sends requests to TikTok's test environment. Use it only to test an integration. |
| **Create Empty Tables** | On | Creates the destination table with every selected column, even when TikTok returns no rows. |

> Keep **Create Empty Tables** on. When you turn it off and TikTok returns no rows, the connector
> creates no table. Later runs then fail with `Not found: Table`. See [Troubleshooting](TROUBLESHOOTING.md#destination-table-errors).

**Sandbox Mode** restricts what you can import. TikTok supplies mock reporting data for
2020-12-08 through 2020-12-19 only. It does not support `AUCTION_ADVERTISER`, the `advertiser`
endpoint, or the `audiences` endpoint. See [Troubleshooting](TROUBLESHOOTING.md#sandbox-mode-limits).

## Run the Data Mart

You can run the Data Mart manually after setup. You can also [schedule connector runs](https://docs.owox.com/docs/getting-started/setup-guide/connector-triggers/).

### Incremental Load

Choose **Manual run → Incremental load**.

The first incremental run imports data from the first day of the previous month through today.
Each successful run saves the last requested date. Later runs start from that date minus
**Reimport Lookback Window**. The default window is two days. This lookback refreshes TikTok
metrics that changed after the first import.

![Manual run menu showing the Incremental load option](res/tiktok_ads_incremental.png)

![Reimport Lookback Window setting for additional days in incremental loads](res/tiktok_ads_reimportwindow.png)

### Backfill

Choose **Backfill (custom period)** to import a specific date range.

1. Select **Start Date**.
2. Select **End Date**.
3. Click **Run**.

The import includes both the start date and the end date. Leave **End Date** empty to import
through today. You cannot pick a **Start Date** in the future, or an **End Date** earlier than
the **Start Date**. A future **End Date** imports through today and logs a warning.

![Backfill dialog with Start Date, End Date, and Run button](res/tiktok_ads_daterange.png)

## Check the Result

Open **Run history**. The run has finished when the status shows **Success**.

A run can finish with warnings. It skips advertisers it cannot reach and keeps every row it
fetched. See [Warnings and Errors](TROUBLESHOOTING.md#warnings-and-errors).

![Run history tab showing a successful TikTok Ads import](res/tiktok_ads_successrun.png)

You can query the imported tables in the dataset you selected. You can also send the data to a
destination. See [Destination Management](https://docs.owox.com/docs/destinations/manage-destinations/) and [Google Sheets](https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/).

![Imported TikTok Ads tables in the destination dataset](res/tiktok_ads_bq.png)

## Troubleshooting

If a run fails, open **Run history**. Then match the error with [Troubleshooting](TROUBLESHOOTING.md).

For credential setup errors, see [Credentials](CREDENTIALS.md#troubleshooting-credential-setup).

## Support

1. Check **Run history** for the exact error.
2. Search [Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
3. Open an [issue](https://github.com/OWOX/owox-data-marts/issues) to report a bug.
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions).
