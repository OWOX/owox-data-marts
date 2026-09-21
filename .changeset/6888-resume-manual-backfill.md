---
'owox': minor
---

# Resume a manual backfill from the last fully loaded date

A manual backfill that stops before it finishes now continues from the day after the last one it fully
loaded, instead of starting the whole period again. This matters most when a deploy or a restart
interrupts a long backfill: the retry keeps the days it already imported and requests only the rest.

Run History names the day a retry starts from, so you can see why it covers a shorter period than the one
you chose.

Scheduled and incremental runs are unaffected. A backfill still never moves the incremental load position,
so the next scheduled run continues to pick up where regular loading left off.

Shopify and TikTok Ads backfills still reload the whole period. Shopify imports one data type at a time
across the full range rather than one day at a time across all of them. TikTok Ads reports a failed day
only after it has walked the whole range, so it cannot yet tell which days it truly loaded.
