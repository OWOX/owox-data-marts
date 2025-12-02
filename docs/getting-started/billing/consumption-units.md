# Consumption Units

## OWOX Data Marts Terms of Use

[OWOX Data Marts](../../../README.md) is a self-service data analytics platform that allows organizations to create a data mart library and empower business users with spreadsheet reports and dashboards — in minutes.

> Consumption Units apply whenever you use the [Cloud edition](../../editions/owox-cloud-editions.md) or cloud-only capabilities
>
> Two types of consumption units cover all available features:
>
> - Report Run
> - Process Run

## Report Run

### **How Are Report Runs Calculated?**

A **Report Run** means pushing or pulling data (stored in **Storage**) to a **Destination**. Read more about [core concepts](../core-concepts.md).

- Each **successful** execution of a Data Mart counts as **1 Report Run**, regardless of the volume of processed data.
- The Data Mart is executed on behalf of the customer's [Storage](../core-concepts.md#storage) within the dedicated OWOX BI Project, and processing costs are charged to the customer's Storage billing account.
- Report Runs are counted equally, whether the Data Mart was executed manually or via a [trigger](../core-concepts.md#trigger).
- The type of SQL statement (`SELECT`, `UPDATE`, `DELETE`) or whether it outputs a table or view does not affect the calculation of consumption units.
- When calculating consumption units for the Extension part, all Google Sheets documents and their respective sheets where the Data Mart (Query) is executed are considered.

#### Report Run sub-consumption units

For better transparency and flexibility, Report Runs are broken down into following sub-consumption units:

| **Consumption Unit** | **Sub-consumption Unit** | **Description**                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Report Run           | Platform Report Run      | Represents Report Runs executed from the [OWOX BigQuery™️ Data Marts](https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832?utm_source=docs.owox.com&utm_medium=owox-data-marts&utm_campaign=consumption_units_article) Extension. Data was pushed from a Data Mart to Google Sheets. |
| Report Run           | Looker Studio Report Run | Represents Report Runs executed in the OWOX Data Marts Cloud edition on [app.owox.com](https://app.owox.com). Data was pulled from a Data Mart to the [Looker Studio Destination](../../destinations/supported-destinations/looker-studio.md).                                                                     |
| Report Run           | Google Sheets Report Run | Represents Report Runs executed in the Cloud edition on [app.owox.com](https://app.owox.com). Data was pushed from a Data Mart to the [Google Sheets Destination](../../destinations/supported-destinations/google-sheets.md).                                                                                     |
| Report Run           | Email Report Run         | Represents Report Runs executed in the Cloud edition on [app.owox.com](https://app.owox.com). A message was pushed to the [Email Destination](../../destinations/supported-destinations/email.md).                                                                                                                 |
| Report Run           | Google Chat Report Run   | Represents Report Runs executed in the Cloud edition on [app.owox.com](https://app.owox.com). A message was pushed to the [Google Chat Destination](../../destinations/supported-destinations/google-chat.md).                                                                                                     |
| Report Run           | MS Teams Report Run      | Represents Report Runs executed in the Cloud edition on [app.owox.com](https://app.owox.com). A message was pushed to the [MS Teams Destination](../../destinations/supported-destinations/microsoft-teams.md).                                                                                                    |
| Report Run           | Slack Report Run         | Represents Report Runs executed in the Cloud edition on [app.owox.com](https://app.owox.com). A message was pushed to the [Slack Destination](../../destinations/supported-destinations/slack.md).                                                                                                                 |

## Process Run

### **How Are Process Runs Calculated?**

A **Process Run** means importing data from a [Source](../core-concepts.md#source) into **Storage**. Read more in [core concepts](../core-concepts.md).

- Each **successful** execution (e.g., delivering data from Facebook Ads API to BigQuery Storage or processing a {{prompt}} in the AI Layer) counts as **1 Process Run**.
- It makes no difference whether the Process Run was triggered manually or automatically — both are counted equally.
- The type of SQL query (`SELECT`, `UPDATE`, `DELETE`) does not impact the calculation of Process Runs.

#### Process Run sub-consumption units

For better transparency and flexibility, Process Runs are broken down into following sub-consumption units:

| **Consumption Unit** | **Sub-consumption Unit** | **Description**                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process Run          | Connector Process Run    | Represents Process Runs executed in the Cloud edition on [app.owox.com](https://app.owox.com). Data was delivered from a Source (e.g., Facebook Ads) to Storage (e.g., Google BigQuery). See the [list of available connectors](../../../README.md/#data-sources).                    |
| Process Run          | AI Process Run           | Represents Process Runs executed in the Cloud edition on [app.owox.com](https://app.owox.com). A {{prompt}} from an insight/message template was processed in the AI Layer.                                                                                                           |
| Process Run          | Platform Process Run     | Represents Process Runs executed in [OWOX BI Transformation](https://support.owox.com/hc/en-us/articles/33759051895060#OWOXBITransformation:TermsofUsage) on [bi.owox.com](https://bi.owox.com). Counts each successful execution of an individual Operation within a Transformation. |

## **FAQ**

- Q: How can I monitor the number of Runs per month?\*\*
  - A: In the app.owox.com, open the **Credits consumption** page to see detailed usage.

- Q: Will my reports be updated if I exceed the limit on my subscription?\*\*
  - A: Yes! Reports will continue to be updated on schedule, and manual runs will work as usual — even if you exceed the limit. No interruptions.

- Q: How are monthly limits calculated if I pay for a year upfront?\*\*
  - A: Example: if you need up to 2,000 data refreshes per month, select _2000 Report Runs monthly_ on the payment page. This equals **100 credits per month** (1200 credits per year). Once your card is charged, you’ll get **100 credits every month** to run 2000 Report Runs. Simple and consistent.

- Q: What happens if I exceed the set limit?\*\*
  - A: Excess usage is billed on a Pay As You Go basis according to the rates on our [Pricing page](https://www.owox.com/pricing-details/). For example: if you receive 100 credits (2000 Report Runs) per month but use 3000 Report Runs (150 credits), then the extra 50 credits will be charged to your card the following month. If this happens regularly, consider adjusting your plan — our Support Team will help you choose the best option.
