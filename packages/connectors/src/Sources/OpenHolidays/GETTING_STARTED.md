# How to Import Data from the Open Holidays Source

To receive data from the Open Holidays source, please make a copy of the file ["OpenHolidays. Template"](https://docs.google.com/spreadsheets/d/1epcNKJtnakYgkYDTJ_0KBtYvs1Kzy_gk7zZsl_oK9C4/copy).

Fill in the required information:

- Start Date
- End Date
- countryIsoCode
- languageIsoCode

You'll receive the data for the selected *Start* and *End* Dates.

![Open Holidays Start Date](res/holidays_date.png)

You can find country codes in the [ISO country codes](https://www.iso.org/obp/ui/#search) list. Please, use the **Alpha-2 code** for the source.
[List of supported countries](https://www.openholidaysapi.org/en/). The data will be empty if you choose a country not on the list.  

**languageIsoCode** is English (EN) by default. You can find language codes in the [ISO 639-2 language codes](https://www.loc.gov/standards/iso639-2/php/code_list.php) list. Please, use the **Alpha-2 code** for the source.

Press *OWOX -> Import New Data*.

![Open Holidays Import](res/holidays_import.png)

When the Log data shows "**Import is finished**", the import process is complete, and your data will be available in the **Data** tab.

![Open Holidays Import Finished](res/holidays_finished.png)
