To receive data from the OpenExchangeRates source, please make a copy of the file ["Open Exchange Rates. Template"](https://docs.google.com/spreadsheets/d/1rvjCh_aGAcYgZRPzrePhkginVH6pJ5GoyN51z5HJD_I/copy). 

Fill in the required information:

- Start date
- Symbols

Data import begins on the selected start date. 

![Open Exchange Rates Start Date](res/openrates_date.png)

The base currency is US Dollars (USD) by default. A list of supported currency symbols and names can be found [via the provided link](https://docs.openexchangerates.org/reference/supported-currencies).

![Open Exchange Rates Currency](res/openrates_currency.png)

Then, press *OWOX -> Manage credentials*. 

![Open Exchange Rates Credentials](res/openrates_credentials.png)

Add your **App ID** received by this tutorial: [How to obtain the App ID for the Open Exchange Rates connector](CREDENTIALS.md)

![Open Exchange Rates App ID](res/openrates_appid.png)

Press OK and then, press *OWOX -> Import New Data*.

![Open Exchange Rates Import](res/openrates_import.png)

When the Log data shows "**Import is finished**", the import process is complete, and your data will be available in the **Data** tab.

![Open Exchange Rates Finished](res/openrates_finished.png)