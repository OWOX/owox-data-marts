# TikTok Ads Source

Use this connector to import TikTok Ads data into an OWOX Data Mart.

You can:

- Import daily performance metrics at the advertiser, campaign, ad group, or ad level.
- Pull a country breakdown of daily performance.
- Import advertiser, campaign, ad group, and ad metadata.
- Import custom audience metadata.
- Run manual backfills.
- Schedule recurring connector runs.

## Prerequisites

- A [TikTok for Business](https://ads.tiktok.com/) account.
- A TikTok advertiser account you can access.
- An OWOX Data Marts storage.

Connect with OAuth, or with an access token from your own TikTok developer app. See [Credentials](CREDENTIALS.md).

See the OWOX guide to [add a storage](https://docs.owox.com/docs/storages/manage-storages/#adding-a-new-storage).

If you create your first connector, read the OWOX guide to [create a connector-based Data Mart](https://docs.owox.com/docs/getting-started/setup-guide/connector-data-mart/).

## Choose a Reporting Grain

**Data Level** sets the reporting grain for the two performance endpoints. Choose it before
you select fields. OWOX pins the matching unique-key fields so rows merge correctly. The
default is `AUCTION_AD`.

> ⚠️ Do not change **Data Level** after a run has loaded data into a table. New rows would
> merge on a different key structure. Use a new Data Mart or a new destination table instead.

For the unique keys per level, see [Endpoints and Fields](ENDPOINTS_AND_FIELDS.md#data-level-and-unique-keys).

## Table of Contents

- [**Credentials**](CREDENTIALS.md): connect with OAuth or an access token.
- [**Getting Started**](GETTING_STARTED.md): create and run the Data Mart.
- [**Endpoints and Fields**](ENDPOINTS_AND_FIELDS.md): choose endpoints and fields.
- [**Troubleshooting**](TROUBLESHOOTING.md): fix import, permission, and destination table errors.
- [**Q&A**](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a): check community answers.

## Support & Feedback

- Check [**Troubleshooting**](TROUBLESHOOTING.md) first.
- Search [**Q&A**](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) for existing answers.
- Open an [**issue**](https://github.com/OWOX/owox-data-marts/issues) to report a bug.
- Submit a [**feature request**](https://github.com/OWOX/owox-data-marts/discussions) to request a change.

## Other Data Sources

Looking for other data sources? See the [full list of data sources](../../../../../README.md#data-sources).

## License

This source is part of the OWOX Data Marts project and is distributed under the [MIT license](../../../../../licenses/MIT.md).
