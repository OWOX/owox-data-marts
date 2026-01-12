---
'owox': minor
---

# Add OAuth flow for TikTok Ads connector

- Added support for OAuth2 authentication in the TikTok Ads connector
- Implemented OAuth credential exchange and automatic token refresh
- Added TikTok login button UI component for OAuth flow
- Added OAuth callback page for handling TikTok authorization redirect
- Manual credential entry option remains available as fallback
- Added TikTok OAuth environment variables to .env.example
