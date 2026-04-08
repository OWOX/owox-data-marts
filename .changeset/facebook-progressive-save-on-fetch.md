---
'owox': minor
---

# Save Facebook ads data progressively to prevent loss on API failures

Previously, if the Facebook API returned an error mid-fetch, all already-downloaded
records were lost. Now data is saved to BigQuery page by page, so a failure only
affects the remaining pages — not the entire dataset.
