---
'owox': minor
---

# Add OAuth for Google Ads connector

Added OAuth2 authentication flow for Google Ads connector. Users can now authorize access using a "Sign in with Google" button instead of manually entering RefreshToken, ClientId, and ClientSecret. The DeveloperToken is managed via environment variable and stored securely with other OAuth credentials. Also fixed a COOP SecurityError in the OAuth popup polling that affected all OAuth connectors.
