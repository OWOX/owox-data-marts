---
'owox': minor
---

# Add Microsoft Ads OAuth Integration

- Implemented OAuth2 authentication flow for the Microsoft Ads connector to support secure, long-lived access.
- Added frontend components (`MicrosoftLoginButton` and callback routing) to handle the user authorization process.
- Updated the backend source configuration to parse and validate `AuthType` with Client ID, Client Secret, and Refresh Token.
- Implemented `exchangeOauthCredentials` and automatic token refreshing (`getAccessToken`) using the `offline_access` scope for persistent background data fetching.
- Created database migrations to support storing the new `AuthType` JSON configuration for Microsoft Ads datamarts.
