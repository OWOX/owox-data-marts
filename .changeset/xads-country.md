---
'owox': minor
---

# X Ads: Country Breakdown for Ad Stats

You can now load daily ad stats broken down by country using the new `stats_by_country` node. It tracks impressions, clicks, and other metrics per country for each promoted tweet.

To get human-readable country names, use the companion `targeting_locations` node — a reference table that maps X Ads location IDs to country names and ISO codes. Run it once, then join with `stats_by_country` on the `country` field.
