---
'owox': minor
---

# Google Ads connector uses a supported API version

Previously, the Google Ads connector called API version v21, which Google
sunset on 2026-08-05, causing every import to fail with an
`UNSUPPORTED_VERSION` error. Now, the connector uses v25, the current stable
version. This means Google Ads imports run successfully again.
