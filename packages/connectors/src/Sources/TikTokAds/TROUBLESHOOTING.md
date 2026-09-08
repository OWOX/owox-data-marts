# Troubleshooting TikTok Ads Imports

Use this guide after you save credentials. It covers setup, manual runs, scheduled runs, and backfills.

For access token and authorization code errors, see [Credentials](CREDENTIALS.md#troubleshooting-credential-setup).

Most failed imports come from the destination table or from a temporary TikTok outage. Check
those two causes first.

## Quick Checks

Before you change credentials or app settings, check these items:

- Check **Run history** for the exact error message.
- Check that the destination dataset exists, and that the connector can write to it.
- Check **Advertiser IDs**: use numeric IDs, separated by commas.
- Check that the authorized TikTok user can access every listed advertiser.
- Check that **Data Level** matches the fields you selected.
- For large backfills, shorten the date range or reduce selected fields.

If these checks look correct, match the **Run history** error with the cases below.

## Common Import Errors

| Error or symptom | Likely cause | What to do |
| --- | --- | --- |
| `Error schema actualization: Not found: Table <project>:<dataset>.<table>` | The destination table is missing. The run created no table, or someone deleted it. | See [Destination Table Errors](#destination-table-errors). |
| `TikTok API error: No permission to operate advertiser: <id>` | The token cannot access that advertiser. | The run logs a warning and skips the advertiser. Remove the ID, or reauthorize with access to it. |
| `TikTok API error: Internal service connection timeout. Please try again.` | TikTok had a temporary outage. The connector already retried three times. | Rerun the Data Mart. If it repeats for hours, check the [TikTok API status page](https://business-api.tiktok.com/portal/docs). |
| `TikTok API error: System error.` | TikTok returned an unspecified server error. | Rerun the Data Mart. This error clears on its own. |
| `TikTok API error: Service maintenance: UV metric temporarily unavailable` | TikTok suspended a specific metric for maintenance. | Remove the UV metrics from your field selection, or wait and rerun. |
| `fetch failed` | The network call to TikTok did not complete. | Rerun the Data Mart. |
| `TikTok API error: ... doesn't exist or has been deleted` | A campaign, ad group, or audience no longer exists. | The run logs a warning and continues. Remove stale IDs from **Advertiser IDs**. |
| `All advertisers failed to import data. Errors: ...` | Every advertiser failed. This line summarizes the run. | Read the per-advertiser error listed inside the message, then match it above. |
| `<N> out of <M> advertisers had errors. Failed advertisers: ...` | Some advertisers failed, others succeeded. | The run keeps every row it fetched. Fix the listed advertisers, then rerun. |
| `TikTok API error` with code `40100` | TikTok throttled your app. | See [Rate Limits](#rate-limits). |
| `To fetch advertiser data, both AppId and AppSecret must be provided` | The Data Mart holds a token, but no App ID or App Secret. | Open the connector settings. Fill in **App ID** and **App Secret**. See [Credentials](CREDENTIALS.md). |
| `Missing required unique fields for endpoint '<node>'. Missing fields: ...` | A saved configuration omits a pinned field. The field selector locks these, so the configuration came from the API. | Open the connector settings and reopen the field selector. It reselects the pinned fields for your **Data Level**. See [Endpoints and Fields](ENDPOINTS_AND_FIELDS.md). |
| `Invalid data_level: <value>. Using default AUCTION_AD.` | **Data Level** holds an unsupported value. | The connector falls back to `AUCTION_AD`. Set a supported value to control the grain. |
| `Unknown node type: <name>` | The Data Mart references an endpoint that no longer exists. | Choose a supported endpoint. See [Endpoints and Fields](ENDPOINTS_AND_FIELDS.md). |
| Rows merge incorrectly, or counts double after a settings change | Someone changed **Data Level** on a table that already held data. | Create a new Data Mart or a new destination table. Do not mix grains in one table. |
| Empty results with no API error | The date range has no delivery data. | Check the same range in [TikTok Ads Manager](https://ads.tiktok.com/). Then retry with spend, impressions, and clicks. |

## Destination Table Errors

This is the most common cause of a failing TikTok Data Mart. The run reports:

```text
Error schema actualization: Not found: Table my-project:my_dataset.tiktok_ads_ads
```

The connector ran, then failed to read the destination table. Check these causes in order:

1. **TikTok returned no rows, and the connector created no table.** Open **Advanced settings**
   and check **Create Empty Tables**. When you turn it off, the connector skips table creation on an
   empty result. Turn it on to create the table with every selected column.
2. **Someone deleted the table or the dataset.** Recreate the dataset, then rerun the
   Data Mart. The connector recreates the table.
3. **The Data Mart points at the wrong dataset.** Open the Data Mart settings and check the
   destination. Confirm the dataset name and the region.
4. **Your storage credentials no longer grant write access.** Check them. See
   [Storage Management](https://docs.owox.com/docs/storages/manage-storages/).

A Data Mart in this state fails on every scheduled run until you fix it. Check **Run history**
after the next run to confirm the fix.

## Warnings and Errors

Some TikTok responses are warnings, not failures. The run skips the affected advertiser and
finishes. Look for these in **Run history**:

- `No permission to operate advertiser`
- `... doesn't exist or has been deleted`

A run that reports only warnings still writes every row it fetched. A run that reports
`<N> out of <M> advertisers had errors` also keeps its rows. Only
`All advertisers failed to import data` stops the run without data.

## Rate Limits

TikTok returns `code: 40100` when it throttles your app. The connector waits one second,
doubles the wait, and retries up to three times.

TikTok applies these limits per developer app, across every endpoint:

| Level | Queries per second | Queries per minute | Queries per day |
| --- | ---: | ---: | ---: |
| Basic | 10 | 600 | 864,000 |
| Advanced | 20 | 1,200 | 1,728,000 |
| Premium | 30 | 1,800 | 2,592,000 |
| Ultimate | 50 | 3,000 | 4,320,000 |

TikTok sets every new app to **Basic**. The limit covers the whole app, not one advertiser.
Every Data Mart and script that shares the app draws from the same budget.

After a minute limit, wait five minutes. After a daily limit, wait until 00:00:00 UTC.

To reduce load, do this:

1. Wait five minutes, then start a **Manual Run**.
2. Remove fields you do not report on.
3. Lower **Reimport Lookback Window**. Each extra day multiplies calls by the advertiser count.
4. Stagger Data Mart schedules by at least an hour. Splitting advertiser IDs across Data
   Marts does not help on its own, because the budget covers the whole app.
5. Apply for a higher level in **My Apps → App Detail → Authorization**. TikTok raises the
   level one step at a time.

TikTok documents the full model in [Rate limits](https://business-api.tiktok.com/portal/docs/rate-limits/v1.3).

## Sandbox Mode Limits

**Sandbox Mode** sends requests to TikTok's test environment. It restricts what you can import:

- Each endpoint allows 1 request per second, 30 per minute, and 1,000 per day.
- Mock reporting data covers 2020-12-08 through 2020-12-19 only. Other dates return zeros.
- **Data Level** supports `AUCTION_CAMPAIGN`, `AUCTION_ADGROUP`, and `AUCTION_AD`. It does
  not support `AUCTION_ADVERTISER`.
- The `advertiser` and `audiences` endpoints do not work. TikTok does not expose them in the
  sandbox environment.

Turn **Sandbox Mode** off for production imports. TikTok documents the environment in
[Sandbox accounts](https://business-api.tiktok.com/portal/docs/sandbox-accounts/v1.3).

## Still Blocked

If the Run history error does not match any case above:

1. Search [Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
2. Open an [issue](https://github.com/OWOX/owox-data-marts/issues) to report a bug.
3. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions).
