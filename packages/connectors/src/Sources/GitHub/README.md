# GitHub Source

This source exports stars and contributors data from the GitHub API to Google Sheets on a daily basis, in a format like this:

## Output table structure

| date | stars | conributors
| ------------ | ------ | ----
| 2025, Jun 1 | 40 | 14
| 2025, Jun 2 | 43 | 16
| 2025, Jun 3 | 45 | 16

To fetch data from private repositories, you need to generate a personal access token [GitHub personal access tokens page](https://github.com/settings/personal-access-tokens).

Google BigQuery as storage is not implemented yet.

## License

This source is part of the OWOX Data Marts project and is distributed under the [MIT license](../../../../../licenses/MIT.md).