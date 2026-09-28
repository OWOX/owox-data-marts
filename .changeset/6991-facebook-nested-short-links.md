---
'owox': minor
---

**Resolve short links in every ads connector, with nested paths and a per-Data-Mart cache**

**Unchecking Create Empty Tables or Process Short Links now takes effect. Previously a saved unchecked value was treated as checked.** With **Create Empty Tables** unchecked, a run that returns no rows creates no table; if the table does not exist yet, the schema check after that run logs a `Not found: Table` error. Facebook Ads Data Marts saved with **Process Short Links** unchecked stop filling `link_url_asset.parsed_url` for new rows.

Previously only Facebook Ads resolved short links, and only single-part links such as `https://bit.ly/abc123`. Now every ads connector with landing URL fields resolves them and writes the landing page next to the original in a parsed field: `link_url_asset.parsed_url` on Facebook Ads insights, and `<field>_parsed` fields such as `object_url_parsed` (Facebook Ads creatives), `ad_final_urls_parsed` (Google Ads), `FinalUrlParsed` (Microsoft Ads), `landing_page_url_parsed` (TikTok Ads), `website_url_parsed` (X Ads) and `click_url_parsed` (Reddit Ads). A parsed field holds the landing page for short links and the original value for other links. New Data Marts select the main pair by default. In an existing Data Mart, select the parsed field: endpoints that every run re-imports, such as Facebook Ads creatives, Google Ads criteria, Microsoft Ads campaigns, TikTok Ads ads, X Ads cards and Reddit Ads ads, fill it on the next run; daily reports need a backfill for older rows.

![Google Ads Ad Group Ads Stats field list with ad_final_urls and ad_final_urls_parsed selected](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d6414653-be66-43d5-bc91-ade02110ad00/public)

To turn resolution off for a Data Mart, uncheck **Process Short Links** under Advanced settings. Google Ads, Microsoft Ads, TikTok Ads, X Ads and Reddit Ads now show this setting too.

![Google Ads connector Advanced Settings with Process Short Links checked](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/bcadd93d-9169-40ac-941e-47d57750e700/public)

Links with several path parts, such as `https://links.example.com/abc/xyz`, resolve on the domains listed in the `CONNECTOR_SHORT_LINK_DOMAINS` environment variable, set once for the whole deployment. In OWOX Cloud, contact support to add your short link domain.

Each link is requested once and the answer is remembered per Data Mart for 30 days, including links that turn out to be landing pages, so scheduled runs and backfills skip links they have already checked. The memory is bounded: a Data Mart with a very large number of distinct links requests the ones that do not fit again on each run.

See [Resolve Short Links](../../packages/connectors/src/Sources/FacebookMarketing/GETTING_STARTED.md#resolve-short-links) and [Environment Variables](../../docs/getting-started/deployment-guide/environment-variables.md#connectors).

<!-- markdownlint-disable-file MD041 MD036 -->
