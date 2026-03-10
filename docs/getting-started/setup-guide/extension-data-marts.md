# Using Data Marts from OWOX Extension

## Why This Matters

You already use the [OWOX Reports Google Sheets Extension](https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832). You have Data Marts defined with SQL queries — running within your BigQuery project and sending data to Google Sheets. While this is a powerful way to handle ad-hoc reporting, you can do more with **[OWOX Data Marts](https://app.owox.com)** while keeping your current setups fully functional:

- get reusable Insights defined by SQL with AI assistance
- unlock new delivery destinations like Looker Studio, Email, Slack, MS Teams or Google Chat for your data
- simplify access and scheduling management at the organizational level—all
- gain full visibility into run history.

> 💡 OWOX Data Marts detects your existing Extension Data Marts and automatically
> creates a **system storage** named after your GCP project ID. The storage type is “Google BigQuery (used in OWOX extension)”.
> This system storage cannot be added, edited, or deleted manually.

Take your Data Marts to the next level by completing these quick steps 👇

## Easy three-step Setup

Follow the steps below to complete the setup:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/c2c31d3821d2e0c910fb1d9260323cb4/iframe>

1. [Select a storage](#step-1-select-your-storage)
2. [Grant access to Google BigQuery](#step-2-grant-access-to-google-bigquery)
3. [Publish your Data Marts](#step-3-publish-your-data-marts)

### Step 1: Select Your Storage

In OWOX Data Marts, go to **Storages**. Find the entry labeled **Google BigQuery (used in OWOX extension)** — it appears automatically, named after your GCP project ID.

> ☝️ The Title and Project ID of this storage are locked. Each GCP project gets
> exactly one system storage to maintain stable integration with the Extension.

![OWOX Data Marts Storages list showing four entries. Arrows highlight the Storages navigation item and the "Google BigQuery (used in OWOX extension)" type label.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ea5d2ae7-a086-4dee-dc97-ca4967ca6a00/public)

### Step 2: Grant Access to Google BigQuery

Click on the storage entry to open its settings. Then:

1. Under **Authentication Method**, choose **Service Account JSON** or **Connect with Google**.
2. If using Service Account JSON, paste your [Service Account JSON key](https://docs.owox.com/docs/storages/supported-storages/google-bigquery-used-in-owox-extension/#step-3-add-a-service-account) into the **Service Account** field.
3. Leave **Auto-detect location** selected unless you experience region-specific query errors.
4. Click **Save**.

![Configure Storage Provider dialog with Location set to "Auto-detect location" and Authentication Method toggled to "Service Account JSON". The Service Account field shows a pasted JSON key with type, project_id, and private_key fields. An arrow points to the JSON key field. A Save button appears at the bottom.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/0035e4e2-2ca2-49a2-e754-5d5eadcd1b00/public)

### Step 3: Publish Your Data Marts

After completing the storage setup, your extension Data Marts appear with **Draft** status. This means OWOX has imported their definitions but has not yet verified access. To make them operational, publish them.

To publish multiple Data Marts at once, open the three-dot menu on the storage row and select **Publish drafts**.

![OWOX Data Marts Storages list with a three-dot context menu open on the "smwyc-test-3" row (Google BigQuery used in OWOX extension). The menu shows three options: View details, Edit, and Publish drafts. An arrow points to the "Publish drafts" option.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b5d43691-a9a8-4c95-317f-92b7f3ff3e00/public)

Once published, each Data Mart is live: its output schema is visible and it can be connected to destinations.

> ☝️ Extension and web Data Marts are bidirectionally linked. Deleting a Data Mart
> in the web app also removes it from the extension. New Data Marts created in the
> web app do not sync back to the extension.

## What You Can Do After Publishing

### Try AI Insights

OWOX can analyze the output schema and run history of a Data Mart to surface anomalies, trends, or suggestions — using your existing data, with no additional pipeline required.

![Demo Google Sheets Report Data Mart detail page on the Insights tab. The tab is circled in red. The content area shows an empty state with "Create your first Insight" message, a "Generate Insight with AI" button, and a "+ Blank Insight" button.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/df7097c5-40d0-4c14-c90c-583560479c00/public)

### Create Email-Based Reports

1. Add an [Email destination](https://docs.owox.com/docs/destinations/supported-destinations/email/).
2. Open a published Data Mart and go to the **Destinations** tab.
3. Configure recipients and set a [Report Trigger](https://docs.owox.com/docs/getting-started/setup-guide/report-triggers/) (daily, weekly, monthly, or on an interval).

At the scheduled time, OWOX queries BigQuery using your stored credentials, formats the result, and sends it by email.

### Build Reports in Looker Studio

1. Add a [Looker Studio destination](https://docs.owox.com/docs/destinations/supported-destinations/looker-studio/).
2. Open a published Data Mart and go to the **Destinations** tab.
3. Enable the **Available in Looker Studio** toggle for that destination.
4. In Looker Studio, connect using the OWOX Data Marts connector and the JSON Config token generated by the web app.

![Facebook Data Mart detail page on the Destinations tab. Two destination rows are listed under "Marketing Team": an email destination and a Looker Studio destination. The Looker Studio row is expanded showing an enabled "Available in Looker Studio" toggle with the status "Waiting for Looker Studio to fetch data". An arrow points to the toggle.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/5d1d0424-21d6-4d7f-30e5-7999d691f200/public)

> ☝️ Google Sheets uses **push mode** — OWOX sends data to a sheet on a schedule,
> so data is static between runs. Looker Studio uses **pull mode** — data is
> fetched live from BigQuery each time you open the report, subject to the cache
> lifetime you configured.

### Set Up Connector-Based Data Marts

Your existing extension Data Marts query data already in BigQuery. [Connector-based Data Marts](https://docs.owox.com/docs/getting-started/setup-guide/connector-data-mart/) go one step further: they pull raw data from ad platforms directly into BigQuery, which you can then query with your existing SQL Data Marts.

Supported sources: Facebook Ads, TikTok Ads, LinkedIn Ads, X Ads, Microsoft Ads, Reddit Ads, Criteo Ads, and others.

## Additional Resources

- [Schedule Data Mart runs](https://docs.owox.com/docs/getting-started/setup-guide/report-triggers/)
- [Set up email notifications](https://docs.owox.com/docs/notifications/email/)
- [Add a new data storage](https://docs.owox.com/docs/storages/manage-storages/)
- [Core concepts](https://docs.owox.com/docs/getting-started/core-concepts/)
