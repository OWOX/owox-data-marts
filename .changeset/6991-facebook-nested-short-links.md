---
'owox': minor
---

# Resolve nested short links in Facebook Ads insights

The Facebook Ads connector can now expand short links whose path has several parts, such as `https://links.example.com/abc/xyz`. Previously **Process Short Links** resolved only single-part links like `https://bit.ly/abc123`, so nested links from custom short link services stayed unresolved in `link_url_asset.parsed_url`.

Enter the domains of your short link services in the new advanced setting **Short Link Domains**, separated by commas. Links on those domains and their subdomains are then resolved on the **Ad Account Insights by Link URL Asset** endpoint. Single-part short links keep resolving on any domain without extra setup, and links with query parameters are still left unchanged.

![Advanced Settings in the connector setup with the Short Link Domains field highlighted and Process Short Links enabled](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4b55851f-fd42-4dd6-7b58-0fce065ace00/public)

See [Resolve Short Links](../../packages/connectors/src/Sources/FacebookMarketing/GETTING_STARTED.md#resolve-short-links).
