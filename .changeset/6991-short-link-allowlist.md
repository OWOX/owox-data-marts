---
'owox': minor
---

**Short links resolve only on known short link services and domains you allow**

**Short links now resolve only on an allowlist of domains. In 0.36.0, Facebook Ads, Google Ads, Microsoft Ads, TikTok Ads, X Ads and Reddit Ads requested every one-part `https` link on any domain.** A branded shortener on your own domain needs an administrator to add it. Until then, a parsed field such as `ad_final_urls_parsed` holds the original link, and `link_url_asset` gets no `parsed_url`. The next run also changes existing rows: endpoints that every run re-imports, and daily rows inside the Reimport Lookback Window. Add the domain before you upgrade to keep their values.

The allowlist contains the services `bit.ly`, `tinyurl.com`, `t.co`, `lnkd.in`, `youtu.be`, `amzn.to`, `ow.ly`, `buff.ly`, `cutt.ly`, `is.gd` and `rebrand.ly`, plus the domains in the `CONNECTOR_SHORT_LINK_DOMAINS` environment variable. Entries in the `*.links.example.com` form are accepted. Links on any other domain stay unchanged and are never requested. In OWOX Cloud, contact support to add your short link domain.

OWOX now requests only short link services. It follows redirects between allowlisted services and stops at the first address outside the allowlist, without requesting it. A parsed field therefore holds the address the short link service points to, and redirects on the landing site itself are no longer followed. A typical short link now costs one request. OWOX requests only `https` addresses whose domains resolve to public IP addresses.

An answer saved by an earlier run is used only while its domain stays allowlisted. A `408`, `429` or `5xx` answer from a short link service is treated as a failed request and retried on the next run, instead of being remembered for 30 days. Answers that 0.36.0 saved for allowlisted links stay in use for up to 30 days. This version would not save some of them, such as a `5xx` answer.

See [Resolve Short Links](../../packages/connectors/src/Sources/FacebookMarketing/GETTING_STARTED.md#resolve-short-links) and [Environment Variables](../../docs/getting-started/deployment-guide/environment-variables.md#connectors).

<!-- markdownlint-disable-file MD041 MD036 -->
