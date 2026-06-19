---
"owox": minor
---

# Reliable incremental sync after partial connector run

Previously, if a connector run failed partway through multiple accounts, the incremental date checkpoint could advance past data that was never fully fetched — causing those dates to be silently skipped on the next run. Now the checkpoint is written only after all accounts complete successfully, so a failed run always retries from the correct starting point. This affects MicrosoftAds, CriteoAds, GoogleAds, RedditAds, and XAds connectors.
