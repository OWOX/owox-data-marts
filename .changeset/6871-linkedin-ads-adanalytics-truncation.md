---
'owox': minor
---

# Fix LinkedIn Ads adAnalytics silently dropping data when response exceeds 15,000 elements

Previously, an adAnalytics export over a large date range could silently lose data: the endpoint does not support pagination and caps its response at 15,000 elements, so campaigns from the beginning of the period were missing from the result. The connector now fetches analytics one day at a time, so a single day cannot exceed the limit.

If a daily response still reaches 15,000 elements, the import finishes with a Warning status and a message about possible truncation (element count and an example day) instead of losing data silently.
