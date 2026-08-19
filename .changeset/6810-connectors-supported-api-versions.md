---
'owox': minor
---

# Google Ads, LinkedIn Ads, LinkedIn Pages, and Shopify connectors use supported API versions

Previously, the Google Ads connector called API version v21, which Google
sunset on 2026-08-05, causing every import to fail with an
`UNSUPPORTED_VERSION` error. The LinkedIn Ads and LinkedIn Pages connectors
were also close to hitting the same wall: they called a version only two
months newer than one LinkedIn had already sunset. The Shopify connector was
two releases behind, with its version nearing its own support cutoff.

Now, Google Ads uses v25, LinkedIn Ads and LinkedIn Pages use the 2026-07
version, and Shopify uses the 2026-07 version — all current, supported
releases. This means imports for these connectors keep running instead of
failing once their old versions are sunset.
