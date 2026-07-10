# Import Data from Facebook Ads

Use this guide to create a Facebook Ads Data Mart.

## Before You Start

Check these items before you create the Data Mart:

- You have set up OWOX Data Marts.
- You have at least one OWOX storage.
- You can access the target Facebook ad account.
- You know the numeric Facebook Account ID.
- You chose an authentication method in [Credentials](CREDENTIALS.md).

For storage setup, see [Storage Management](https://docs.owox.com/docs/storages/manage-storages/#adding-a-new-storage).

For a general connector walkthrough, see [Connector-based Data Mart](https://docs.owox.com/docs/getting-started/setup-guide/connector-data-mart/).

## Create the Data Mart

1. Click **New Data Mart**.
2. Enter a title.
3. Select a storage.
4. Click **Create Data Mart**.

If you have no storage yet, click **New Storage**. You can create the storage now and configure it later.

![OWOX Data Mart creation screen with title and storage fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2e1163df-bd1c-4825-4ce9-c6f66f11b500/public)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Choose **Facebook Ads**.
3. Choose your authentication method.

For OAuth, click **Continue with Facebook**, then sign in with a Facebook user who can access the ad account. If the button does not appear, use the **Access Token** method.

For manual authentication, fill in these fields:

- **Access Token**: paste the token from [Credentials](CREDENTIALS.md).
- **App ID**: enter your Meta App ID.
- **App Secret**: enter your Meta App Secret.

Then fill in **Account IDs**. Use numeric ad account IDs only, without the `act_` prefix. You can find the ID in [Meta Ads Manager](https://adsmanager.facebook.com/adsmanager/manage/accounts) under **Account Overview**. To import from multiple accounts, separate IDs with commas or semicolons. The authorized Facebook user must access every listed account.

![Facebook Ads connector setup screen with OAuth and manual authentication options](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9336bfac-506a-4590-f0fa-4a3ca7d16300/public)

![Facebook Ads connector fields for access token, App ID, App Secret, and Account ID](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/06f507fa-8000-461e-51e0-0063179d2e00/public)

![Facebook Ads connector configuration screen after entering account credentials](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/788a7c18-78ed-48b6-39ba-7e57998df300/public)

## Configure Data Import

1. Choose an endpoint.
2. Select fields, or keep the defaults.
3. Enter the target dataset.
4. Click **Finish**.
5. Click **Publish & Run Data Mart**.

OWOX writes the connector tables into this destination. Your storage sets the field label, such as **Dataset** for BigQuery or **Database** for Amazon Redshift. For your storage, see [Supported Storages](https://docs.owox.com/docs/storages/supported-storages/).

For spend, clicks, impressions, conversions, and ROAS, choose **Ad Account Insights**.

For endpoint details, see [Endpoints and Fields](ENDPOINTS_AND_FIELDS.md).

If OWOX disables **Publish & Run Data Mart**, check the storage. OWOX cannot publish a Data Mart until the selected storage has valid settings. See [Storage Management](https://docs.owox.com/docs/storages/manage-storages/#adding-a-new-storage).

![Configure Data Import screen with Facebook Ads endpoint, fields, and dataset settings](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/5975a655-aeea-4ec6-d5f6-f74cb5db4500/public)

## Run the Data Mart

You can run the Data Mart manually after setup. You can also [schedule connector runs](https://docs.owox.com/docs/getting-started/setup-guide/connector-triggers/).

### Incremental Load

Choose **Manual run → Incremental load**.

On the first incremental run, OWOX imports data from the first day of the previous month through today. After a successful incremental run, OWOX stores the last requested date. On later incremental runs, OWOX starts from that date minus **Reimport Lookback Window**. This lookback helps refresh recently changed Facebook Ads metrics.

![Manual run menu showing the Incremental load option](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e7e0db3e-5088-4372-515c-ae22e961a200/public)

![Incremental load confirmation dialog for importing the current day's data](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/17cb8336-c759-4d38-aa90-a3c80c2dab00/public)

![Reimport Lookback Window setting for additional days in incremental loads](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1e87e59d-19b7-48e9-2a22-e29147d8b500/public)

### Backfill

Choose **Backfill (custom period)** to import a specific date range.

1. Select **Start Date**.
2. Select **End Date**.
3. Click **Run**.

OWOX imports both the start date and the end date. If you leave **End Date** empty, OWOX uses today.

![Backfill dialog with Start Date, End Date, and Run button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b8a71ff2-60a1-4b8e-135b-4bf8b30d4600/public)

## Check the Result

Open **Run history**. The run has finished when the status shows **Success**.

![Run history tab showing a successful Facebook Ads import](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/da9ea591-9924-4465-091b-90a65c827800/public)

You can query the imported tables in the dataset you selected. You can also send the data to a destination. See [Destination Management](https://docs.owox.com/docs/destinations/manage-destinations/) and [Google Sheets](https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/).

## Troubleshooting

If a run fails, open **Run history**. Then match the Meta error with [Troubleshooting](TROUBLESHOOTING.md).

For credential setup errors, see [Credentials](CREDENTIALS.md#troubleshooting-credential-setup).

## Support

1. Check **Run history** for the exact error.
2. Search [Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
3. Open an [issue](https://github.com/OWOX/owox-data-marts/issues) to report a bug.
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions).
