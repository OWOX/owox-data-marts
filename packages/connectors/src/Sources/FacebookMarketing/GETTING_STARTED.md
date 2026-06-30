# How to Import Data from the Facebook Ads Source

Before proceeding, please make sure that:

- You have already created an **access token** and get App ID, App Secret, as described in [CREDENTIALS](CREDENTIALS.md).  
- You have your Account ID.
- You have set up OWOX Data Marts. You also need at least one storage in Storages — you can configure it later if needed.

## Create the Data Mart

- Click **New Data Mart** (available from any page in OWOX Data Marts).
- Enter a title and select the Storage. If you haven’t configured a storage yet, click New Storage to create one now and configure it later.
- Click **Create Data Mart**.

![OWOX Data Mart creation screen with title and storage fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2e1163df-bd1c-4825-4ce9-c6f66f11b500/public)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Сhoose Facebook Ads.
3. If you use OAuth to authenticate, press Continue with Facebook button. After authentication, fill in Account ID.
4. If you use manual authentication, fill in the required fields:
    - **Access token** – paste the token you generated earlier.
    - App ID – enter your Facebook App ID.
    - App Secret – enter your Facebook App Secret.
5. **Account ID** – enter the numeric ad account ID only, without the `act_` prefix. You can find it in **[Meta Ads Manager](https://adsmanager.facebook.com/adsmanager/manage/accounts) → Account Overview**.
    - Leave the other fields as default and proceed to the next step.

> **Note:** You can enter multiple Account IDs in this field. Separate IDs with commas or semicolons, and make sure the authorized Facebook account has access to all of them.

![Facebook Ads connector setup screen with OAuth and manual authentication options](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9336bfac-506a-4590-f0fa-4a3ca7d16300/public)

![Facebook Ads connector fields for access token, App ID, App Secret, and Account ID](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/06f507fa-8000-461e-51e0-0063179d2e00/public)

![Facebook Ads connector configuration screen after entering account credentials](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/788a7c18-78ed-48b6-39ba-7e57998df300/public)

## Configure Data Import

1. Choose one of the available endpoints. If you want to import spend, clicks and impressions from ad account, please, choose [`Ad Insights`](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/) endpoint.
2. Select the required **fields** or leave defaults.
3. Specify the **dataset** where the data will be stored, or leave it as default.
4. Click **Finish**, then **Publish & Run Data Mart**.

![Configure Data Import screen with Facebook Ads endpoint, fields, and dataset settings](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/5975a655-aeea-4ec6-d5f6-f74cb5db4500/public)

## Run the Data Mart

After the first run next time you have two options for importing data from Facebook Ads:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Manual run menu showing the Incremental load option](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e7e0db3e-5088-4372-515c-ae22e961a200/public)

![Incremental load confirmation dialog for importing the current day's data](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/17cb8336-c759-4d38-aa90-a3c80c2dab00/public)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Reimport Lookback Window setting for additional days in incremental loads](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/1e87e59d-19b7-48e9-2a22-e29147d8b500/public)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.
2. Click the **Run** button.

![Backfill dialog with Start Date, End Date, and Run button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b8a71ff2-60a1-4b8e-135b-4bf8b30d4600/public)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![Run history tab showing a successful Facebook Ads import](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/da9ea591-9924-4465-091b-90a65c827800/public)

## Access Your Data

The data will be written to the dataset specified earlier.

## Troubleshooting

If an import fails, open the **Run history** tab and check the specific error message in [Troubleshooting Facebook Ads imports](TROUBLESHOOTING.md).

For credential setup errors, see [CREDENTIALS](CREDENTIALS.md#troubleshooting-credential-setup).

For anything else:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
