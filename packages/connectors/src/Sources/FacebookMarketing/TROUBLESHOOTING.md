# Troubleshooting Facebook Ads Imports

Use this guide when credentials are already saved, but the Data Mart fails during configuration, a manual run, a scheduled run, or a backfill.

If the error happens while generating an access token or exchanging an authorization code, see [CREDENTIALS](CREDENTIALS.md#troubleshooting-credential-setup).

## Quick Checks

- Open the **Run history** tab and copy the exact Meta error message.
- Enter numeric ad account IDs only, without the `act_` prefix.
- Separate multiple Account IDs with commas or semicolons.
- Confirm the authorized Facebook user still has access to every selected ad account.
- Confirm the token was authorized with `ads_read` and `ads_management`.
- For large backfills, reduce the date range, selected fields, breakdowns, or **API Page Limit**.

## Common Import Errors

| Error or symptom | Likely cause | What to do |
| --- | --- | --- |
| `Invalid OAuth access token`, `Error validating access token`, or `Session has expired` | The token expired, was revoked, was invalidated by Meta, or was generated for a different app. | Reconnect with Facebook, or generate a new access token and update the Data Mart credentials. |
| Missing `ads_read`, missing `ads_management`, or a permissions error | The token was created without one of the required scopes, or the user removed the permission during authorization. | Reauthorize with both `ads_read` and `ads_management`. `ads_read` is used for `ad-account/insights` and `ad-account/insights-by-*`; `ads_management` is used for ad account and ad object endpoints. |
| App is not approved, app is in Development mode, or the app cannot access this ad account | The Meta app or authorized user is not allowed to access the selected ad account. Development mode works only for users assigned a role on the app. | Test with a user assigned to the Meta app and ad account. For client or external ad accounts, check whether Meta requires App Review, advanced access, Marketing API access, or Business Verification. |
| Account does not exist, account cannot be loaded, or `Unsupported get request` | The Account ID is wrong, includes `act_`, or the authorized user cannot access that ad account. | Enter the numeric Account ID only, without `act_`, and verify the user has Admin, Advertiser, or Analyst access to the ad account. |
| Import fails for only one account in a multi-account setup | One Account ID is invalid or the user lacks access to that account. | Run the Data Mart with one Account ID at a time to identify the failing account, then fix the ID or access in Meta Business settings. |
| Rate limit errors, `Application request limit reached`, or `User request limit reached` | Meta is throttling API requests for the app, user, or ad account. | Wait and rerun later. If the error repeats, reduce run frequency, date range, selected accounts, selected fields, or breakdown count. |
| `Please reduce the amount of data you're asking for, then retry your request` or request timeout errors | The request is too large for Meta to process in one call. | Reduce the backfill date range, select fewer fields, use fewer breakdowns, or lower **API Page Limit** in advanced settings. |
| Empty results with no obvious API error | The selected date range has no delivery data, the selected fields are not populated for that account, or the user has access to the ad account but not the expected data. | Check the same date range in Meta Ads Manager, confirm the account delivered ads during that period, and try `ad-account/insights` with basic fields such as spend, clicks, and impressions. |

## Still Blocked

If the Run history error does not match any case above:

1. [Visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first — your question may already be answered.
2. Found a bug? [Open an issue](https://github.com/OWOX/owox-data-marts/issues).
3. Join the [discussion forum](https://github.com/OWOX/owox-data-marts/discussions) to ask questions or propose improvements.
