# How to Import Data from the Microsoft Ads Source

Before you begin, please ensure that:

- You have already obtained all required credentials, as described in [CREDENTIALS](CREDENTIALS.md).  
- You have [set up **OWOX Data Marts**](https://docs.owox.com/docs/getting-started/quick-start/) and created at least one storage in the **Storages** section.  

![Microsoft Ads Storage](res/microsoft_storage.png)

## Create the Data Mart

- Click **New Data Mart**.
- Enter a title and select the Storage.
- Click **Create Data Mart**.

![Microsoft New Data Mart](res/microsoft_newdatamart.png)

1. Select **Connector** as the input source type.  
2. Click **Set up connector** and choose **Microsoft Ads**.  
3. Fill in the required fields with the credentials you obtained in the [CREDENTIALS](CREDENTIALS.md) guide.  
   - Leave the other fields as default.  
   - Proceed to the next step.

![Microsoft Input Source](res/microsoft_inputsource.png)

![Microsoft Setup Connector](res/microsoft_setupconnector.png)

## Configure Data Import

1. Choose one of the available **endpoints**.  
   - To import spend, clicks, and impressions from an ad account, select the `Microsoft Ads Campaigns` endpoint.  
2. Select the required **fields**.  
3. Specify the **dataset** where the data will be stored (or leave the default).  
4. Click **Save**, then **Publish & Run Data Mart**. Publishing starts the first import automatically.  

![Microsoft Publish Data Mart](res/microsoft_publishdatamart.png)

### Resolve Short Links

Ads often point to short links. OWOX can follow each short link and store the landing page next to it:

- **Ad Performance Report**: `FinalUrl`, `FinalMobileUrl` and `DestinationUrl` resolve into `FinalUrlParsed`, `FinalMobileUrlParsed` and `DestinationUrlParsed`.
- **Campaigns**: `FinalUrl` and `MobileFinalUrl` resolve into `FinalUrlParsed` and `MobileFinalUrlParsed`.

Keep the source field and its parsed field selected and enable **Process Short Links** under **Advanced** settings. OWOX selects `FinalUrl` and `FinalUrlParsed` on the Ad Performance Report by default. A parsed field holds the address the short link service points to, and the original value for other links. OWOX does not request that address, so redirects on the landing site itself are not followed.

OWOX resolves links from known short link services, such as Bitly (`bit.ly`) and TinyURL (`tinyurl.com`). Links on other domains stay unchanged. Your administrator adds your own short link domains to the `CONNECTOR_SHORT_LINK_DOMAINS` environment variable. In OWOX Cloud, contact support to add a domain. See [Environment Variables](https://docs.owox.com/docs/getting-started/deployment-guide/environment-variables/#connectors).

OWOX sends one request per distinct link and remembers the answer for 30 days, including links that do not redirect. Later runs skip remembered links. If a Data Mart has more distinct links than the memory holds, OWOX requests the extra ones on each run.

**Campaigns** rows get the parsed field on the next run, because every run re-imports them. For **Ad Performance Report**, rows imported earlier keep their old values until you run a backfill.

## Run the Data Mart

**Publish & Run Data Mart** already started the first import. To import data again, you have two options:  

Option 1: Import Current Day's Data

Choose **Manual run → Incremental load** to load data for the **current day**.

![Microsoft Manual Run](res/microsoft_manualrun.png)

![Microsoft Incremental Load](res/microsoft_currentday.png)

> ℹ️ If you click **Incremental load** again after a successful initial load,  
> the connector will import: **Current day's data**, plus **Additional days**, based on the value in the **Reimport Lookback Window** field.

![Microsoft Reimport](res/microsoft_reimportwindow.png)

Option 2: Manual Backfill for Specific Date Range

- Choose **Backfill (custom period)** to load historical data.  

1. Select the **Start Date** and **End Date**.  
2. Click **Run**.  

![Microsoft Backfill](res/microsoft_daterange.png)

The process is complete when the **Run history** tab shows the message: **"Success"**  

![Microsoft Success](res/microsoft_successrun.png)

## Access Your Data

Once the run is complete, the data will be written to the dataset you specified earlier.  

![Microsoft Import Success](res/microsoft_importgbq.png)

If you encounter any issues:

1. Check the Run history for specific error messages
2. Please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first
3. If you want to report a bug, please [open an issue](https://github.com/OWOX/owox-data-marts/issues)
4. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements
