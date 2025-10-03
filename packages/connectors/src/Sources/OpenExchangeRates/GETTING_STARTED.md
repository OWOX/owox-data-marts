# How to Import Data from the Open Exchange Rates Source

Before you begin, please ensure that:

- You have already create App ID, as described in [CREDENTIALS](CREDENTIALS.md).  
- You have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![Open Exchange Rates Storage](res/openrates_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Open Exchange Rates New Data Mart](res/openrates_newdatamart.png)

1. Select **Connector** as the input source type.  
2. Click **Set up connector** and choose **Open Exchange Rates**.  
3. Fill in App ID you obtained in the [CREDENTIALS](CREDENTIALS.md) guide.  
   - Leave the other fields as default.  
   - Proceed to the next step.

![Open Exchange Rates Input Source](res/openrates_inputsource.png)

![Open Exchange Rates Setup Connector](res/openrates_setupconnector.png)

## Configure Data Import

- Choose one of the available **endpoints**.
- Select the required **fields**.  

> The default base currency is **US Dollars (USD)**.  
You can find the list of supported currency symbols [Open Exchange Rates documentation](https://docs.openexchangerates.org/reference/supported-currencies).

- Specify the **dataset** where the data will be stored (or leave the default).  
- Click **Finish**, then **Save** and **Publish Data Mart**.  

![Open Exchange Rates Publish Data Mart](res/openrates_publishdatamart.png)

## Run the Data Mart

You now have two options for importing data from Open Exchange Rates:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Open Exchange Rates Manual Run](res/openrates_manualrun.png)

![Open Exchange Rates Incremental Load](res/openrates_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Open Exchange Rates Reimport](res/openrates_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

- Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.  
2. Click **Run**.  

![Open Exchange Rates Backfill](res/openrates_daterange.png)

The process is complete when the **Run history** tab shows the message: **"Success"**  

![Open Exchange Rates Success](res/openrates_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.  

![Open Exchange Rates Import Success](res/openrates_importgbq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
