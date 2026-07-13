---
'owox': minor
---

# Data Level selection for TikTok Ads performance reports

TikTok Ads `ad_insights` and `ad_insights_by_country` now honor the selected **Data Level** (advertiser, campaign, ad group, or ad). Data Level is a dropdown in the main connector settings, and the field selector pins only the unique-key fields that level requires. Advertiser-level reports no longer force you to include `ad_id` and can group by date alone. Choose Data Level before selecting fields; when you change it on a connector that already has data, use a new Data Mart so rows merge correctly.
