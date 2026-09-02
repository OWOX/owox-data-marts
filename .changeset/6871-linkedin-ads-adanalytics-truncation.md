---
'owox': minor
---

# Fix LinkedIn Ads adAnalytics silently dropping data when response exceeds 15,000 elements

Previously, an adAnalytics export over a large date range could silently lose data: the endpoint does not support pagination and caps its response at 15,000 elements, so campaigns from the beginning of the period were missing from the result. The connector now fetches analytics one day at a time, so a single day cannot exceed the limit.

If a daily response still reaches 15,000 elements, the import finishes with a Warning status that lists the affected days instead of losing data silently.

The connector also refreshes the LinkedIn access token once per run instead of before every request, and retries rate-limited (429) and server-error (5xx) responses instead of failing the whole import.
