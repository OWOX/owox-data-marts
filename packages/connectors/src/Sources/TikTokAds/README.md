# TikTok Ads Source

The **TikTok Ads Source** allows you to transfer raw data from TikTok advertising service. Use this data for in-depth analysis and reporting.

## Getting Started

To begin, check out [**GETTING STARTED.md**](GETTING_STARTED.md) for step-by-step instructions.

## Available Data

| Node | Description | Destination table |
| --- | --- | --- |
| `advertiser` | Advertiser account details, including name, company, and currency. | `tiktok_ads_advertiser` |
| `campaigns` | Campaign settings, status, budget, and schedule. | `tiktok_ads_campaigns` |
| `ad_groups` | Ad group settings, bid strategy, optimization goal, placement, and targeting schedule. | `tiktok_ads_ad_groups` |
| `ads` | Individual ad creatives, statuses, and campaign/ad group links. | `tiktok_ads_ads` |
| `ad_insights` | Daily performance metrics at the selected TikTok Ads data level. | `tiktok_ads_ad_insights` |
| `ad_insights_by_country` | Daily performance metrics at the selected TikTok Ads data level, broken down by country. | `tiktok_ads_ad_insights_by_country` |
| `audiences` | Custom audiences, including type, size, validity status, and expiration. | `tiktok_ads_audiences` |

## Data Level for Performance Nodes

`Data Level` controls the reporting grain for `ad_insights` and `ad_insights_by_country`. The default is `AUCTION_AD`.

| Data Level | `ad_insights` unique key fields | `ad_insights_by_country` unique key fields |
| --- | --- | --- |
| `AUCTION_ADVERTISER` | `stat_time_day` | `stat_time_day`, `country_code` |
| `AUCTION_CAMPAIGN` | `campaign_id`, `stat_time_day` | `campaign_id`, `stat_time_day`, `country_code` |
| `AUCTION_ADGROUP` | `adgroup_id`, `stat_time_day` | `adgroup_id`, `stat_time_day`, `country_code` |
| `AUCTION_AD` | `ad_id`, `stat_time_day` | `ad_id`, `stat_time_day`, `country_code` |

The field selector keeps the required unique-key fields selected for the chosen data level, so choose the data level before customizing fields. If a connector has already loaded data, changing `Data Level` can make new rows merge against a different key structure in the same destination table. Use a new Data Mart or destination table when changing the reporting grain.

## Table of Contents

- [**GETTING STARTED**](GETTING_STARTED.md) – quick and easy setup guide.
- [**README**](README.md) – general information about the source.
- [**CREDENTIALS**](CREDENTIALS.md) – detailed guides for each step of the data retrieval process.
- [**Q&A**](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) – troubleshooting common issues.

## Support & Feedback

- If you encounter an issue, please check the [**Q&A**](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) section first.
- To report a bug, open an [**issue**](https://github.com/OWOX/owox-data-marts/issues)
- Have an idea or want a new integration? Submit a [**feature request**](https://github.com/OWOX/owox-data-marts/discussions)

## Other Data Sources

Looking for other data sources? Check out our [full list of data sources](../../../../../README.md#data-sources).

## License

This source is part of the OWOX Data Marts project and is distributed under the [MIT license](../../../../../licenses/MIT.md).
