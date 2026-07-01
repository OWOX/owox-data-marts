# Criteo Source

The **Criteo Source** allows you to transfer raw data from Criteo advertising services. Use this data for in-depth analysis and reporting.

## Available Endpoints

| Endpoint | Description |
| --- | --- |
| `statistics` | Campaign performance metrics (clicks, displays, cost, sales, ROAS, and more) broken down by advertiser, campaign, adset, ad, day, and optional dimensions such as device, OS, and channel. |
| `placements` | Performance metrics broken down by publisher placement and environment (Web, Android, iOS). |
| `placement_categories` | Performance metrics broken down by content category. |
| `transactions` | Transaction-level data with individual order details attributed to Criteo ads. |

> **Note:** Breakdown by publisher **domain** is not available in the Criteo `2026-01` API.
> For the closest equivalent, use the `placements` endpoint, which breaks performance down
> by individual placement.

## Getting Started

To begin, check out [**GETTING STARTED.md**](GETTING_STARTED.md) for step-by-step instructions.

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
