# Troubleshooting Facebook Ads Imports

Use this guide after you save credentials. It covers setup, manual runs, scheduled runs, and backfills.

For access token or authorization code errors, see [Credentials](CREDENTIALS.md#troubleshooting-credential-setup).

## Quick Checks

Before changing credentials or app settings, check these items:

- Check **Run history** for the exact Meta error.
- Check **Account IDs**: use numeric IDs only, without the `act_` prefix, and separate multiple IDs with commas or semicolons.
- Check **Facebook access**: the authorized Facebook user must access every selected ad account.
- Check **Permissions**: the token must include `ads_read` and `ads_management`.
- For large backfills, reduce the date range, selected fields, or breakdowns.
- If Meta asks you to reduce the amount of data, open the Data Mart settings, expand **Advanced settings**, lower **API Page Limit** (for example to `25`), then save and rerun. Do not lower it for rate limit errors, because a smaller page size increases the number of calls.

If these checks look correct, match the **Run history** error with the cases below.

## Common Import Errors

| Error or symptom | Likely cause | What to do |
| --- | --- | --- |
| `Invalid OAuth access token`, `Error validating access token`, or `Session has expired` | The token expired, or Meta invalidated it. | Reconnect with Facebook. For manual credentials, generate a new access token. Then update the Data Mart credentials. |
| Missing `ads_read`, missing `ads_management`, or a permissions error | The token lacks a required scope. The user may have removed it during authorization. | Reauthorize with both `ads_read` and `ads_management`. `ads_read` covers Insights endpoints. `ads_management` covers account and ad object endpoints. |
| App is not approved, app is in Development mode, or the app cannot access this ad account | The Meta app or user cannot access the selected ad account. Development mode only works for app roles. | Test with a user assigned to the Meta app and ad account. For external accounts, check App Review, advanced access, Marketing API access, and Business Verification. |
| Account does not exist, account cannot load, or `Unsupported get request` | The Account ID is wrong. It may include `act_`, or the user lacks access. | Enter the numeric Account ID only. Remove `act_`. Confirm Admin, Advertiser, or Analyst access. |
| Import fails for only one account in a multi-account setup | One Account ID is invalid, or the user lacks access to that account. | Run the Data Mart with one Account ID at a time. Find the failing account. Then fix the ID or Meta access. |
| `There have been too many calls to this ad-account` (code `80004`, subcode `2446079`) | Meta throttled ads management calls for one ad account. Every account has an hourly call budget. | See [Ad Account Rate Limits](#ad-account-rate-limits). |
| Rate limit errors, `Application request limit reached`, or `User request limit reached` | Meta throttled requests for the app, user, or ad account. | Wait and rerun later. If the error repeats, reduce run frequency, date range, selected accounts, fields, or breakdowns. |
| `Please reduce the amount of data you're asking for, then retry your request` or request timeout errors | The request asks Meta for too much data. | Reduce the date range, fields, or breakdowns. Then lower **API Page Limit** in **Advanced settings** and rerun. |
| Empty results with no obvious API error | The date range has no delivery data. The selected fields may have no values. | Check the same date range in Meta Ads Manager. Then try **Ad Account Insights** with spend, clicks, and impressions. |

## Ad Account Rate Limits

Meta counts API calls per ad account in a rolling one-hour window. Your Meta app's access tier sets the budget:

| Access tier | Calls per hour, per ad account |
| --- | --- |
| Development access | 300 + 40 × active ads |
| Advanced access | 100 000 + 40 × active ads |

Meta counts requests, not rows. An ad account with 7 000 creatives costs 70 calls at an **API Page Limit** of `100`.

After a rate limit error, do this:

1. Stop the Data Mart and wait at least one hour. More calls extend the block.
2. Raise **API Page Limit** in **Advanced settings**. A limit of `500` cuts the call count fivefold.
3. Remove fields you do not report on. Large fields slow every call.
4. Split ad accounts across several Data Marts. Stagger the schedules by an hour.
5. Lower the run frequency. Catalog endpoints such as Ad Creatives change slowly.
6. Apply for Advanced Access in your Meta app. This raises the budget to 100 000 calls.

Meta explains the full model in [Marketing API rate limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting).

## Still Blocked

If the Run history error does not match any case above:

1. Search [Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a).
2. Open an [issue](https://github.com/OWOX/owox-data-marts/issues) to report a bug.
3. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions).
