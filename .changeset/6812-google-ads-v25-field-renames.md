---
'owox': minor
---

# Google Ads campaign and video metrics import

Google Ads renamed four fields in its v25 API — `video_views`, `video_view_rate`, `campaign_start_date`, and `campaign_end_date` — and the connector kept requesting the old names. Because Google Ads rejects a query entirely when it contains even one unrecognized field, any `campaigns` or `campaigns_stats` import selecting one of these failed outright, including new data marts, which select the campaign dates by default.

The connector now requests Google Ads' current field names, so these imports run again. No action is needed: the fields keep the same names in OWOX, and existing data mart configurations and destination tables are unaffected.
