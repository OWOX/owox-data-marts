---
'owox': minor
---

# Reliable OAuth sign-in for ad platform connectors

Previously, signing in to connectors that use OAuth (such as Microsoft Ads, TikTok, LinkedIn, and Google Ads) could end with a "Not Found" error right after authorizing with the provider, because the connector's callback page was routed to the backend instead of the web app. Now these callback pages load correctly and the sign-in flow completes, so the connector gets connected as expected. This affects both self-hosted and cloud deployments.
