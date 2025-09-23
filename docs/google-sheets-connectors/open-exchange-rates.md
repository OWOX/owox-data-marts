# Open Exchange Rates

This guide will walk you through the process of collecting the Currency Exchange Rates (Open Exchange Rates) directly into Google Sheets.

## Step 1: Configure the connector

To initiate the data import process from Open Exchange Rates, begin by creating a copy of a [**Open Exchange Rates → Google Sheets Template**](https://docs.google.com/spreadsheets/d/1rvjCh_aGAcYgZRPzrePhkginVH6pJ5GoyN51z5HJD_I/copy)

In your newly copied spreadsheet, navigate to the "Config" sheet.

Select the **Symbols** — currency codes you want to retrieve

The default base currency is **US Dollars (USD)**.  
You can find the list of supported currency symbols [Open Exchange Rates documentation](https://docs.openexchangerates.org/reference/supported-currencies).

![Open Exchange Rates Currency](./res/openrates_currency.png)

## Step 2: Add Your App ID

Go to **OWOX → Manage credentials** from the menu.

![Open Exchange Rates Credentials](./res/openrates_credentials.png)

Enter your **App ID** obtained by following this tutorial:  [How to obtain the App ID for the Open Exchange Rates connector](/packages/connectors/src/Sources/OpenExchangeRates/CREDENTIALS.md)

![Open Exchange Rates App ID](./res/openrates_appid.png)

Click **Check and Save**. Once credentials are saved, go to menu.

## Step 3: Run connector

Now you have **two options** for importing data from the Open Exchange Rates API:

### Option 1: Import Current Day's Data

Choose **OWOX → Import New Data** to load data for the **current day**.

> ℹ️ If you click **Import New Data** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

### Option 2: Manual Backfill for Specific Date Range

Choose **Manual Backfill** to load historical data for a custom time range.

1. Select the **Start Date** and **End Date**  
2. Click the **Run Manual Backfill** button

The process is complete when the **Log** field shows the message:  
**"Import is finished"**  

## Step 4: Access Your Data

In the **Google Sheets** template:
The data will appear in a new tab called **Data**.  

![Open Exchange Rates Finished](./res/openrates_finished.png)

## Getting Help

Should you encounter any issues or questions not addressed in this guide:

1. **Check Logs:** Review the "Logs" sheet in your spreadsheet for specific error messages, which can often provide clues to the problem.
2. **Visit Q&A:** Before opening a new issue, please check the existing discussions and answers in our [Q&A section](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
3. **Report a Bug:** If you identify a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues) on our GitHub repository.
4. **Join the Discussion:** Feel free to join our [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions, share insights, or propose improvements to the source.

## License

This connector is part of the OWOX Data Marts project and is distributed under the [MIT license](/licenses/MIT.md).
