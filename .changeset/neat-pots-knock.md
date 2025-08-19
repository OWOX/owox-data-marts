---
'owox': minor
---
# Remove unsupported fields

- Removed the following unsupported or deprecated fields from `adAccountInsightsFields` in the Facebook Marketing API reference:
  - `age_targeting`
  - `estimated_ad_recall_rate_lower_bound`
  - `estimated_ad_recall_rate_upper_bound`
  - `estimated_ad_recallers_lower_bound`
  - `estimated_ad_recallers_upper_bound`
  - `gender_targeting`
  - `labels`
  - `location`
- Cleaned up the field definitions to avoid including unsupported fields for Facebook API v19.0 and above.
- Improved maintainability and reduced the risk of API errors related to invalid fields.
