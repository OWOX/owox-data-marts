---
'owox': minor
---

# Resume an interrupted manual backfill from the last fully loaded date

When a deploy or a restart interrupts a manual backfill, the automatic retry now continues from the day
after the last one it fully loaded, instead of starting the whole period again. It keeps the days it
already imported and requests only the rest, which matters most on a long backfill.

Starting a backfill yourself always loads the whole period you choose, including after one that failed.
Only the automatic retry of an interrupted run resumes.

Run History names the day that retry starts from, so you can see why it covers a shorter period than the
one you chose.

Scheduled and incremental runs are unaffected. A backfill still never moves the incremental load position,
so the next scheduled run continues to pick up where regular loading left off.

Shopify and TikTok Ads backfills still reload the whole period. Shopify imports one data type at a time
across the full range rather than one day at a time across all of them. TikTok Ads reports a failed day
only after it has walked the whole range, so it cannot yet tell which days it truly loaded.
