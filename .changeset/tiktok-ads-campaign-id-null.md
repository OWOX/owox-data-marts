---
'owox': minor
---

# TikTok Ads `campaign_id` and `adgroup_id` in Ad Insights

Previously, the `campaign_id` and `adgroup_id` fields in the `tiktok_ads_ad_insights` table were always `null`. This happened because TikTok's API requires these parent-hierarchy IDs to be requested as metrics, not dimensions, at the ad data level — and they were missing from the request. Now both fields are correctly requested and populated, so users can join ad-level performance data back to their campaigns and ad groups.
