---
'owox': minor
---

# Add new acebook Marketing insights endpoints and improve Facebook field schema filtering

Introduced several new **Facebook Marketing API insights** endpoints with specific breakdowns:

- `ad-account/insights-by-age-and-gender` — provides age and gender breakdowns  
- `ad-account/insights-by-device-platform` — provides device platform breakdown  
- `ad-account/insights-by-product-id` — provides product ID breakdown  
- `ad-account/insights-by-publisher-platform` and  
  `ad-account/insights-by-publisher-platform-and-position` — provide publisher platform and platform position breakdowns  
- `ad-account/insights-by-region` — provides region-level breakdown  

⚠️ Breaking Changes
The legacy `ad-account/insights` endpoint **no longer supports breakdown fields**.

If your Data Mart previously used `ad-account/insights` with breakdowns (such as `age`, `gender`, `country`, `device_platform`, `link_url_asset`, `product_id`, `publisher_platform`, `platform_position`, or `region`),  
please migrate to the appropriate new endpoint:

| Breakdown Type | New Endpoint |
|-----------------|---------------|
| Age / Gender | `ad-account/insights-by-age-and-gender` |
| Country | `ad-account/insights-by-country` |
| Device Platform | `ad-account/insights-by-device-platform` |
| Link URL Asset | `ad-account/insights-by-link-url-asset` |
| Product ID | `ad-account/insights-by-product-id` |
| Publisher Platform / Position | `ad-account/insights-by-publisher-platform-and-position` |
| Region | `ad-account/insights-by-region` |

---

**Recommendation:**  
Recreate your Data Mart using the correct endpoint to ensure compatibility with the latest Facebook Marketing API structure.
