# Credentials

Use Service Account JSON when scheduled imports should not depend on a personal Google account.

Steps:

1. Create a Google Cloud service account.
2. Create and download a JSON key for it.
3. Share the spreadsheet with the service account email.
4. Paste the service account JSON key into `Service Account Key (JSON)`.

The service account email is the `client_email` value inside the downloaded JSON key.

Viewer access is enough for importing sheet data because the source connector only reads the sheet.
