---
'owox': minor
---

# Resolve short links in ads connectors, with nested paths and a per-Data-Mart cache

**The per-Data-Mart Short Link Domains setting from the previous release is removed.** Links with several path parts, such as `https://links.example.com/abc/xyz`, now resolve on the domains listed in the `CONNECTOR_SHORT_LINK_DOMAINS` environment variable, which an administrator sets once for the whole deployment. Saved values of the old setting are ignored.

Previously only Facebook Ads resolved short links, and only single-part links such as `https://bit.ly/abc123`. Now every ads connector with landing URL fields resolves them, and writes the landing page next to the original in a parsed field: `link_url_asset.parsed_url` on Facebook Ads insights, and `<field>_parsed` fields such as `object_url_parsed` (Facebook Ads creatives), `ad_final_urls_parsed` (Google Ads), `FinalUrlParsed` (Microsoft Ads), `landing_page_url_parsed` (TikTok Ads), `website_url_parsed` (X Ads) and `click_url_parsed` (Reddit Ads). A parsed field holds the landing page for short links and the original value for other links. New Data Marts select the main pair by default; existing Data Marts need the parsed field selected and a backfill to fill old rows. **Process Short Links** stays available under Advanced settings on every connector that resolves links.

Each short link is resolved once per Data Mart and the result is remembered for 30 days, so scheduled runs and backfills no longer request the same link again. See [Resolve Short Links](../../packages/connectors/src/Sources/FacebookMarketing/GETTING_STARTED.md#resolve-short-links) and [Environment Variables](../../docs/getting-started/deployment-guide/environment-variables.md#connectors).
