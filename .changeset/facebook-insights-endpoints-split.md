---
'owox': minor
---

# Split Facebook Marketing insights endpoint into three separate endpoints

- Split `ad-account/insights` into three endpoints: base insights, insights by country, and insights by link URL asset
- Added `ad-account/insights-by-country` endpoint with country breakdown
- Added `ad-account/insights-by-link-url-asset` endpoint with link_url_asset breakdown
- Refactored insights data fetching to use object parameters and separate fields from breakdowns

## ⚠️ Breaking Changes

- `ad-account/insights` endpoint no longer supports breakdown fields
- If your data mart was using `ad-account/insights` with breakdown fields (e.g., country, link_url_asset), you need to recreate it using the appropriate new endpoint:
  - Use `ad-account/insights-by-country` for country breakdown
  - Use `ad-account/insights-by-link-url-asset` for link URL asset breakdown
