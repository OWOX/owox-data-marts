# How to Import Data from the Open Holidays Source

Before proceeding, please make sure that you have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![Open Holidays Storage](res/holidays_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Open Holidays New Data Mart](res/holidays_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Click **Set up connector** and choose **Open Holidays**.  
3. Fill in the required fields:
    - **Country ISO Code** – ISO country code for which to fetch holidays (e.g., CH, US, GB).
    - **Language ISO Code** – ISO language code for holiday names (e.g., EN, DE, FR).
    - Leave the other fields as default and proceed to the next step.

![Open Holidays Input Source](res/holidays_connector.png)

![Open Holidays Fill Data](res/holidays_fill_data.png)

## Configure Data Import

1. Choose available **endpoint**.  
2. Select the required **fields**.  
3. Specify the **dataset** where the data will be stored (or leave the default).  
4. Click **Finish**, then **Save** and **Publish Data Mart**.

![Open Holidays Publish Data Mart](res/holidays_publish.png)

## Run the Data Mart

You now have two options for importing data from Open Holidays:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Open Holidays Import New Data](res/holidays_incremental.png)

![Open Holidays Incremental Load](res/holidays_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Open Holidays Reimport](res/holidays_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.
2. Click the **Run** button.

![Open Holidays Backfill](res/holidays_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![Open Holidays Success](res/holidays_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.

![Open Holidays Import Success](res/holidays_bq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
