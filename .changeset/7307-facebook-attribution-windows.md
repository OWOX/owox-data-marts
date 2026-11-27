---
'owox': minor
---

**See post-click and post-view conversions separately in Facebook Ads data**

An analyst who evaluates Facebook Ads campaigns needs to know how many conversions came after a click and how many after someone only saw the ad. Previously each conversion arrived as one number counted by the ad set's attribution setting, so the two were mixed and the split was visible only in Meta Ads Manager. Now you list attribution windows in the connector, and each conversion carries a value for every window.

Set **Action Attribution Windows** under **Advanced** settings to a comma-separated list such as `1d_click,7d_click,1d_view`. Every entry in `actions`, `action_values`, `conversions`, `conversion_values` and the other action fields then gets a key for each window that has a value, for example `{"action_type":"purchase","value":"10","1d_click":"6","7d_click":"7","1d_view":"3"}`. The setting works on every insights endpoint of the Facebook Ads connector.

![Advanced settings of the Facebook Ads connector with Action Attribution Windows set to 1d_click,7d_click,1d_view](https://cdn.owox.com/eacafbaa-2f5c-43da-4234-18f33a604c00/public)

- With the setting empty, imports stay as they were.
- `value` does not change and is not the sum of the listed windows.
- A window missing from an entry means zero. Action types Meta does not split keep only `value`.
- A malformed window fails the run with an error that names the setting.
- Meta no longer returns data for `7d_view` and `28d_view`.
- Rows imported earlier get the windows after a backfill.

See [Split Conversions by Attribution Window](../../packages/connectors/src/Sources/FacebookMarketing/GETTING_STARTED.md#split-conversions-by-attribution-window).

<!-- markdownlint-disable-file MD041 MD036 -->
