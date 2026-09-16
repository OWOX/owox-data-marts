---
'owox': minor
---

# Select conversions and conversion values by default in Facebook Marketing insights

- The `conversions` and `conversion_values` fields are now selected by default for the Facebook Marketing insights endpoints, including the breakdowns by age and gender, country, device platform, product ID, publisher platform and position, and region, plus the ad set and campaign endpoints. New Data Marts built on these endpoints include conversion data without manual field selection.
- **Ad Account Insights by Link URL Asset** keeps its previous defaults. Meta supports only `impressions`, `clicks`, `spend`, `reach`, `actions`, and `action_values` with Dynamic Creative asset breakdowns, so the conversion fields stay available but unselected there.
- Both fields now carry real descriptions instead of placeholders, so the field picker, the Output Schema, and MCP clients can tell `conversions` apart from `actions`.
- The connector documentation now lists how Meta limits conversion metrics on the link URL asset, product ID, and region breakdowns, and the troubleshooting guide names these fields as the first ones to clear when Meta asks you to reduce the amount of data.
