# How to Import Data from the Linkedin Pages Source

- You have already created a **refresh token**, as described in [GETTING_STARTED.md](GETTING_STARTED.md), and saved **Client ID** and **Client Secret**.
- You [have run **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.

![LinkedIn Pages Storage](res/linkedin_pages_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![LinkedIn Pages New Data Mart](res/linkedin_pages_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Click Set up connector and choose LinkedIn Pages.
3. Fill in the required fields:
    - **Client ID** – paste the ID you saved earlier.
    - **Client Secret** - paste the secret you saved earlier
    - **Refresh Token** - paste the token you created earlier through [GETTING_STARTED.md](GETTING_STARTED.md) tutorial.
    - **Organization URNs** - you can find it on the company page.
    - Leave the other fields as default and proceed to the next step.

![LinkedIn Pages Input Source](res/linkedin_pages_connector.png)

![LinkedIn Pages Fill Data](res/linkedin_pages_fill_data.png)

![LinkedIn Pages Organization URN](res/linkedin_pages_organizationurn.png)

## Configure Data Import

1. Choose one of the available endpoints.
2. Select the required **fields**.
3. Specify the **dataset** where the data will be stored, or leave it as default.
4. Click **Finish**, then **Save and Publish Data Mart**.

![LinkedIn Pages Publish Data Mart](res/linkedin_pages_publish.png)

## Run the Data Mart

Now you have **two options** for importing data from LinkedIn Pages:

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Linkedin Pages Import New Data](res/linkedin_pages_incremental.png)

![Linkedin Pages Incremental Load](res/linkedin_pages_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![LinkedIn Pages Reimport](res/linkedin_pages_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data for a custom time range.

1. Select the **Start Date** and **End Date**  
2. Click the **Run** button

![LinkedIn Pages Backfill](res/linkedin_pages_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![LinkedIn Pages Success](res/linkedin_pages_successrun.png)

## Access Your Data

The data will be written to the dataset specified earlier.

![LinkedIn Pages Import Success](res/linkedin_pages_bq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
