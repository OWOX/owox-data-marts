# Credentials

The Google Sheets source supports two authentication methods:

1. OAuth2
2. Service Account JSON

## OAuth2

Use OAuth2 when a business user should connect a spreadsheet from their own Google account.

Required environment variables for the Google Sheets source connector:

- `OAUTH_GOOGLE_SHEETS_CLIENT_ID`
- `OAUTH_GOOGLE_SHEETS_CLIENT_SECRET`
- `OAUTH_GOOGLE_SHEETS_REDIRECT_URI`
- `OAUTH_GOOGLE_SHEETS_PICKER_API_KEY`
- `OAUTH_GOOGLE_SHEETS_PROJECT_NUMBER`

The redirect URI should point to the web app callback route: `/oauth/google-sheets/callback`.

Do not use `OAUTH_GOOGLE_REDIRECT_URI` unless the connector OAuth callback is explicitly refactored to use the shared Google OAuth flow. That existing variable is used by the storage/destination OAuth flow at `/oauth/google/callback`.

Enable the Google Sheets API and Google Picker API in the same Google Cloud project. Configure the OAuth client as a Web application with the web app origins and callback URLs, and restrict the Picker API key to the Google Picker API and those HTTP referrers.

The source requests these scopes:

- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/userinfo.email`

`drive.file` grants access only to files the user selects through Google Picker or creates with the app. The connector only reads the selected spreadsheet. `OAUTH_GOOGLE_SHEETS_PROJECT_NUMBER` is the numeric Google Cloud project number used as the Picker App ID.

## Service Account JSON

Use Service Account JSON when scheduled imports should not depend on a personal Google account.

Steps:

1. Create a Google Cloud service account.
2. Create and download a JSON key for it.
3. Share the spreadsheet with the service account email.
4. Select `Service Account` in the source authentication method.
5. Paste the service account JSON key into `Service Account Key (JSON)`.

The service account email is the `client_email` value inside the downloaded JSON key.

Viewer access is enough for importing sheet data because the source connector only reads the sheet.
