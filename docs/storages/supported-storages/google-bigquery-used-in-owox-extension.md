# Google BigQuery (used in OWOX extension)

**Google BigQuery (used in OWOX extension)** is a system storage that appears automatically in OWOX Data Marts if you have created Data Marts using **[OWOX Reports (Google Sheets extension)](https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832)**.

This storage connects your existing Data Marts from the extension to the OWOX Data Marts web interface. It allows you to complete a one-time setup, publish your Data Marts, and manage them using additional capabilities available in OWOX Data Marts.

> ☝️ You cannot manually add or delete this storage.

## Finish Setting Up the Storage

If you see your extension Data Marts listed with the **Draft** status, this is expected.

They remain in Draft because OWOX Data Marts requires a one-time BigQuery access configuration. After you complete the storage setup, you can publish your Data Marts and start using them in the web interface.

Follow the steps below to finish the setup.

### Step 1. Review the Storage Settings

In the OWOX Data Marts web application, navigate to **Storages**.  
In the list, find all storages with the type **Google BigQuery (used in OWOX extension)** and open each one to review and complete its settings.

You will see the following fields:

- **Title** – The title is fixed and matches your GCP project ID.  
- **Storage Type** – Google BigQuery (used in OWOX extension).  
- **Project ID** – The project ID is fixed and cannot be changed.

A separate system storage is created for each GCP project used with the OWOX extension. These fields are locked to ensure stable integration between the extension and OWOX Data Marts.

If you need to work with a different GCP project, create a new storage.

### Step 2. Set the Location

By default, **Auto-detect location** is selected. We recommend keeping this setting unless you experience region-related query issues.

### Step 3. Add a Service Account

To enable access to your BigQuery project, you must provide a Service Account JSON key.

#### Required roles

> ☝️ The service account must have the `bigquery.dataEditor` and `bigquery.jobUser` roles. These roles allow read, write, and job execution access to your project resources.

#### How to get a Service Account JSON key

1. Go to **[Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)**.
2. Open **IAM & Admin → Service Accounts**.
3. Create a new service account or select an existing one.
4. Assign the required roles: `bigquery.dataEditor` and `bigquery.jobUser`.
5. Open the **Keys** tab.
6. Click **Add key → Create new key**.
7. Choose **JSON** format and click **Create**.
8. Open the downloaded file, copy its entire content, and paste it into the Service Account field in OWOX Data Marts.

Save the storage settings.

### Step 4. Publish Your Existing Data Marts

After completing the storage setup, your extension Data Marts connected to this storage can be published. You can publish them individually or manage multiple Data Marts using batch actions.

Once published, your Data Marts become fully operational in OWOX Data Marts.

## What You Can Do with Extension Data Marts

After connecting your storage, you can manage your extension Data Marts using additional features available in OWOX Data Marts:

- Export Data Mart results not only to Google Sheets, but also to Looker Studio, Slack, Email, and other supported destinations.
- Run Data Marts on a schedule.
- Add descriptions and define aliases for fields in the output schema.
- Discover insights using AI based on your Data Mart data.
- Manage multiple Data Marts more efficiently using batch actions.
- Create new Data Marts and load data from additional sources such as Facebook, LinkedIn, TikTok, and X Ads directly into your data warehouse.

## FAQ

### Why do I see this storage in my project?

This system storage appears automatically if you use OWOX Reports (Google Sheets extension) and have created Data Marts there.

It connects your existing extension Data Marts to OWOX Data Marts.

### Can I create new Data Marts using this storage?

No.

The **Google BigQuery (used in OWOX extension)** storage is available only for Data Marts created in the extension.

When creating new Data Marts in OWOX Data Marts, this storage cannot be selected.

### If I delete a Data Mart in OWOX Data Marts, will it also be deleted in the extension?

Yes.

Data Marts created in the extension and managed in OWOX Data Marts are synchronized. If you delete such a Data Mart in the web interface, it will also be removed from the extension.

You can use batch actions to manage and delete multiple extension Data Marts at once.

### If I create a new Data Mart in OWOX Data Marts, will it appear in the extension?

No.

New Data Marts created in OWOX Data Marts are not synced back to the extension.

### Can I edit or delete this storage?

No.

This is a system storage created automatically to maintain compatibility with OWOX Reports (Google Sheets extension). It cannot be manually added, edited, or deleted.

### Why are the Title and Project ID fields fixed?

A separate system storage is created for each GCP project used with the extension.

- The title automatically matches the project ID.
- The project ID cannot be changed.

This ensures stable integration between the extension and OWOX Data Marts.

If you need storage for another GCP project, contact support.

### Can I use this storage without the extension?

No.

This system storage is created only for integrating Data Marts from OWOX Reports (Google Sheets extension). If you do not use the extension, this storage will not appear in your project.

## Next Steps

After publishing your Data Marts, you can:

- [Schedule Data Mart runs](../../getting-started/setup-guide/report-triggers.md) and get [email notifications when they run successfully or fail](../../notifications/email.md)
- [Export data to supported destinations](../../destinations/manage-destinations.md)
- [Manage schemas and field descriptions](../../getting-started/setup-guide/sql-data-mart.md#step-3-define-output-schema)
