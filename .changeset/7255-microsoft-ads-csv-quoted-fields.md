---
'owox': minor
---

**Microsoft Ads imports no longer shift columns when a value contains a comma**

When an account, campaign, ad or URL value in Microsoft Ads contained a comma, such as an account named "Example Energy, a.s.", the connector split that value in two and moved every column after it one place to the right. Clicks then held impressions, Spend held clicks, and the real spend was lost, so the only way to get correct numbers was to leave fields such as `AccountName` and the URL fields out of the Data Mart. Now values with commas, quotes or line breaks stay in their own column, and you can select these fields again.

The fix covers every Microsoft Ads report and every entity node, such as Campaigns and Keywords.

<!-- markdownlint-disable-file MD041 MD036 -->
