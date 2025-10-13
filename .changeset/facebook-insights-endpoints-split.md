---
'owox': minor
---

# Split Facebook Marketing insights endpoint into three separate endpoints

- Split `ad-account/insights` into three endpoints: base insights, insights by country, and insights by link URL asset
- Added `ad-account/insights-by-country` endpoint with country breakdown
- Added `ad-account/insights-by-link-url-asset` endpoint with link_url_asset breakdown
- Refactored insights data fetching to use object parameters and separate fields from breakdowns
