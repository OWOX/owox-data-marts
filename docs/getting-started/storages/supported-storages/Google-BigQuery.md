# Google BigQuery Storage
A Service Account Key is a JSON credential file for Google BigQuery authentication.

In Google Cloud Console:
1. Go to IAM & Admin > Service Accounts, create/select a service account, and generate a JSON key.
2. Enable the [BigQuery API](https://console.cloud.google.com/apis/library/bigquery.googleapis.com).
3. Grant the service account `roles/bigquery.admin` for full CRUD access to datasets, tables, views, and templates.

Note: Use a separate service account from Google Sheets if accounts differ.
