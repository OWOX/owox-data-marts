# X Ads Source

Export raw data from X Ads (formerly Twitter Ads) into your data warehouse for custom analysis, reporting, and marketing dashboards.

## Available Data

| Endpoint | Description |
|----------|-------------|
| Accounts | Advertising accounts — name, business, country, timezone, and approval status |
| Campaigns | Campaigns — status, budget optimization, daily and total budget, and currency |
| Line Items | Ad groups within campaigns — bid strategy, goal, budget, and schedule |
| Promoted Tweets | Tweets running as ads — status, approval, and links to their line items |
| Tweets | Original tweets used as ad creatives — text, engagement counts, and card URI |
| Ad Performance | Daily performance by placement — impressions, clicks, spend, and engagements |
| Ad Performance by Country | Daily performance broken down by country — impressions, clicks, and spend |
| Targeting Locations | Reference table of location IDs with names and country codes |
| Cards | Website and app cards — type, URI, and components |
| All Cards | All card types with full creative details — title, destination URL, and call to action |

## Prerequisites

Before setting up this connector, make sure you have:

- An active X Ads account with at least one advertising campaign
- Standard Ads API access approved by X (requires a separate request — see [Credentials Guide](CREDENTIALS.md))
- An OWOX Data Marts account with at least one storage configured

## Getting Started

Follow the [**Getting Started Guide**](GETTING_STARTED.md) for step-by-step setup instructions.

To obtain your API credentials, see the [**Credentials Guide**](CREDENTIALS.md).

## Support

- Join the [**Slack Community**](https://join.slack.com/t/owox-data-marts/shared_invite/zt-3tnigd08g-f2uU_7oNNwzCyTB2tITnqA) to ask questions and connect with other users
- Check the [**Q&A section**](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) for answers to common questions
- Found a bug? [**Open an issue**](https://github.com/OWOX/owox-data-marts/issues)
- Have a feature request or new integration idea? [**Start a discussion**](https://github.com/OWOX/owox-data-marts/discussions)

## Other Data Sources

Looking for other data sources? See the [full list of data sources](../../../../../README.md#data-sources).

## License

This source is part of the OWOX Data Marts project and is distributed under the [MIT license](../../../../../licenses/MIT.md).
