This source exports stars and contributors data from the GitHub API to Google Sheets on a daily basis, in a format like this:
To fetch data from private repositories, you need to generate a personal access token [here](https://github.com/settings/personal-access-tokens).

### Output table structure
| date | stars | conributors
| ------------ | ------ | ----
| 2025, Jun 1 | 40 | 14
| 2025, Jun 2 | 43 | 16
| 2025, Jun 3 | 45 | 16


Google BigQuery as storage is not implemented yet