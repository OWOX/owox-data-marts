---
'owox': minor
---

# Labeled retry settings in connector Advanced settings

Every connector's **Advanced settings** form now shows **Max Fetch Retries** and **Initial Retry Delay (ms)** instead of raw keys. The hints state that the delay is in milliseconds and that the retries value counts total attempts, including the first request. This prevents a delay of `5` being read as five seconds when it means five milliseconds.

The Facebook Ads troubleshooting guide now explains Meta's Ads Insights rate limit (code 4, subcode 1504022), the ad-account score limit (code 17, subcode 2446079), and how to adjust these settings after a rate limit error.
