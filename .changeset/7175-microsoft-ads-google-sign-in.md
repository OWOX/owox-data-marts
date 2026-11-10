---
'owox': minor
---

**Microsoft Ads imports work for advertisers who sign in with Google**

Teams that sign in to Microsoft Advertising with Google could set up the Microsoft Ads source, but every run failed with error `126 IdentityTypeMismatch` and imported nothing. Microsoft Advertising accepts only a Google sign-in for these users, and the source offered only a Microsoft one. Now the Microsoft Ads Credential offers **Sign in with Google** next to **Sign in with Microsoft**, and runs import data with the Google sign-in.

- Signing in now checks the user with Microsoft Advertising. A sign-in of the wrong type fails right away and says which button to use. The Credential shows the email of the connected user instead of "Microsoft Ads User", and a new Credential is named after that email instead of "Microsoft Ads".
- A run whose Credential has the wrong sign-in type stops after the first request with the same advice, instead of repeating error 126 for every day of the import.
- Other Microsoft Ads errors in Run History read as Microsoft Advertising's own message, such as `HTTP 401: Authentication failed. (105 InvalidCredentials)`, instead of the raw JSON response.
- Credentials signed in with Microsoft keep working as before.
- Self-hosted: **Sign in with Google** appears once you set `OAUTH_MICROSOFT_ADS_GOOGLE_CLIENT_ID` and `OAUTH_MICROSOFT_ADS_GOOGLE_CLIENT_SECRET`, with `OAUTH_GOOGLE_REDIRECT_URI` pointing to the Google callback page, see [Environment Variables](../../docs/getting-started/deployment-guide/environment-variables.md#microsoft-ads-source-sign-in-with-google). A Credential entered by hand can use a Google OAuth client too, see [Microsoft Ads credentials](../../packages/connectors/src/Sources/MicrosoftAds/CREDENTIALS.md#if-you-sign-in-to-microsoft-advertising-with-google).

<!-- markdownlint-disable-file MD041 MD036 -->
