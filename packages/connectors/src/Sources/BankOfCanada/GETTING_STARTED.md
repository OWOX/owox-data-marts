# How to Import Data from the Bank of Canada Source

Before proceeding, please make sure that you have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![Bank of Canada Storage](res/bank_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Bank of Canada New Data Mart](res/bank_newdatamart.png)

## Set Up the Connector

1. Select **Connector** as the input source type.
2. Choose **Bank of Canada**.  
3. Leave the fields as default and proceed to the next step.

![Bank of Canada Input Source](res/bank_connector.png)

![Bank of Canada Fill Data](res/bank_fill_data.png)

## Configure Data Import

1. Choose available **endpoint**.  
2. Select the required **fields**.  
3. Specify the **dataset** where the data will be stored (or leave the default).  
4. Click **Finish**, then **Publish Data Mart**.

![Bank of Canada Publish Data Mart](res/bank_publish.png)

## Run the Data Mart

You now have two options for importing data from Bank of Canada source:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Bank of Canada Import New Data](res/bank_incremental.png)

![Bank of Canada Incremental Load](res/bank_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Bank of Canada Reimport](res/bank_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.
2. Click the **Run** button.

![Bank of Canada Backfill](res/bank_daterange.png)

The process is complete when the **Run history** tab shows the message:  
**"Success"**  

![Bank of Canada Success](res/bank_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.

![Bank of Canada Import Success](res/bank_bq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
