---
'owox': minor
---

# Enrich Facebook Marketing ad-account/ads endpoint

The Facebook Marketing connector's `ad-account/ads` endpoint now returns real ad data instead of null values.

**What's New:**

- Added 19 useful fields including ad name, status, campaign/adset relationships, creative details, and timestamps
- 8 essential fields are now pre-selected by default (id, name, status, effective_status, adset_id, campaign_id, created_time, updated_time)

**Before:** Only 3 placeholder fields that returned null  
**After:** Comprehensive ad data ready for analytics

**Note:** For performance metrics (impressions, clicks, spend), continue using the `ad-account/insights` endpoint.
