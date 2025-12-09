# How to Import Data from the Google Ads Source

Before proceeding, please make sure that:

- You have already created a credentials, as described in [CREDENTIALS](CREDENTIALS.md).  
- You [have run **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.

![Google Ads Storage](res/googleads_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Google Ads New Data Mart](res/googleads_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.  
2. Choose **Google Ads**.  

3. Enter your **Customer ID** in the format `12345678` (without dashes).  
   > ⚠️ Use the **ad account** Customer ID, not the MCC (manager) account ID.  
   This is the ID of the account from which you want to retrieve data.

4. Fill in the required fields depending on your chosen authentication type:

For **OAuth2 Authentication** (without service account)

- **Refresh Token** – paste the refresh token you obtained in the [CREDENTIALS](CREDENTIALS.md) guide.  
- **Client ID** – enter the Client ID from your Google Ads app.  
- **Client Secret** – enter the corresponding Client Secret.  
- **Developer Token** – paste the Developer Token from the [CREDENTIALS](CREDENTIALS.md) guide.  

For **Service Account Authentication**

- **Service Account Key** – paste the contents of the JSON key you generated in the [CREDENTIALS](CREDENTIALS.md) guide.  
- **Developer Token** – paste the Developer Token from the [CREDENTIALS](CREDENTIALS.md) guide.  
- **Login Customer ID** – enter your **MCC (manager)** account ID in the format `12345678` (without dashes).  

Leave all other fields as default, then click **Next** to continue.  

![Google Ads Input Source Connector](res/googleads_connector.png)

![Google Ads Create Connector](res/googleads_createconnector.png)

![Google Ads Create Connector ](res/googleads_createconnector_oauth2.png)

## Configure Data Import

1. Choose one of the available endpoints.
2. Select the required **fields**.
3. Specify the **dataset** where the data will be stored, or leave it as default.
4. Click **Finish**, then **Publish Data Mart**.

![Google Ads Publish Data Mart](res/googleads_publish.png)

## Run the Data Mart

Now you have **two options** for importing data from Google Ads:

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Google Ads Manual Run](res/googleads_manualrun.png)

![Google Ads Current Day](res/googleads_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Google Ads Reimport Window](res/googleads_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data for a custom time range.

1. Select the **Start Date** and **End Date**  
2. Click the **Run** button

![Google Ads Date Range](res/googleads_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![Google Ads Success](res/googleads_success.png)

## Access Your Data

The data will be written to the dataset specified earlier.

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
